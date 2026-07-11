import React, { useRef, useEffect, useState, useMemo } from "react";
import type { Paper, MapPoint, ClusterSummary, Edit } from "../types";
import { ExternalLink, X, ZoomIn, ZoomOut, Maximize, RefreshCw, AlertTriangle } from "lucide-react";

const highlightText = (text: string, search: string) => {
  if (!search || !search.trim()) return <span>{text}</span>;
  const escapedSearch = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  const regex = new RegExp(`(${escapedSearch})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-200 text-slate-900 rounded-sm px-0.5 font-semibold">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
};

interface EmbeddingMapProps {
  filteredPapers: Paper[];
  activeView: string;
  edits: Record<string, Edit>;
  onUpdateEdit: (key: string, patch: Partial<Edit>) => void;
  searchQuery?: string;
  searchInTitle?: boolean;
  searchInAbstract?: boolean;
}

interface ProjectedPoint extends MapPoint {
  sx: number;
  sy: number;
  zx: number;
  zy: number;
}

export const EmbeddingMap: React.FC<EmbeddingMapProps> = ({
  filteredPapers,
  activeView,
  edits,
  onUpdateEdit,
  searchQuery = "",
  searchInTitle = true,
  searchInAbstract = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Map Data States
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [clusters, setClusters] = useState<ClusterSummary[]>([]);
  const [mapStatus, setMapStatus] = useState("Waiting for map server...");
  const [hoverPoint, setHoverPoint] = useState<MapPoint | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [isComputing, setIsComputing] = useState(false);

  // Selected Paper State
  const [selectedPaperKey, setSelectedPaperKey] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  // Zoom & Pan States
  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [canvasDimensions, setCanvasDimensions] = useState({ w: 800, h: 620 });
  const scaleRef = useRef(scale);
  const panOffsetRef = useRef(panOffset);
  useEffect(() => {
    scaleRef.current = scale;
    panOffsetRef.current = panOffset;
  }, [scale, panOffset]);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const requestIdRef = useRef(0);

  // Sync Tracking States
  const [lastComputedKeysKey, setLastComputedKeysKey] = useState("");
  const currentKeysKey = useMemo(() => {
    return filteredPapers.map((p) => p.__key).join("|");
  }, [filteredPapers]);

  const isOutOfSync = useMemo(() => {
    if (!lastComputedKeysKey) return false; // First load is handled automatically
    return currentKeysKey !== lastComputedKeysKey;
  }, [currentKeysKey, lastComputedKeysKey]);

  // Find selected paper details
  const selectedPaper = useMemo(() => {
    if (!selectedPaperKey) return null;
    return filteredPapers.find((p) => p.__key === selectedPaperKey) || null;
  }, [selectedPaperKey, filteredPapers]);

  // Find matching IDs for the search query to highlight them on the map without re-rendering layout
  const matchingIds = useMemo(() => {
    if (!searchQuery) return null;
    const query = searchQuery.toLowerCase().trim();
    if (!query) return null;

    return new Set(
      filteredPapers
        .filter((p) => {
          let matchTitle = false;
          let matchAbstract = false;
          if (searchInTitle) {
            matchTitle = p.title.toLowerCase().includes(query);
          }
          if (searchInAbstract) {
            matchAbstract = p.abstract.toLowerCase().includes(query);
          }
          const edit = edits[p.__key];
          const paperTags = edit?.tags || [];
          const matchTags = paperTags.join(" ").toLowerCase().includes(query);
          return matchTitle || matchAbstract || matchTags;
        })
        .map((p) => p.__key)
    );
  }, [filteredPapers, searchQuery, edits, searchInTitle, searchInAbstract]);

  // Reset selected paper if it's filtered out
  useEffect(() => {
    if (selectedPaperKey && !filteredPapers.some((p) => p.__key === selectedPaperKey)) {
      setSelectedPaperKey(null);
    }
  }, [filteredPapers, selectedPaperKey]);

  // Generate mapping colors
  const clusterColors = useMemo(() => {
    return [
      "#197064",
      "#b54708",
      "#175cd3",
      "#c11574",
      "#027a48",
      "#7a5af8",
      "#b42318",
      "#0e7090",
      "#875bf7",
      "#a15c07",
    ];
  }, []);

  const getClusterColor = (clusterId: number, index: number) => {
    if (clusterId === -1) return "#98a2b3";
    return clusterColors[index % clusterColors.length];
  };

  const hexToRgba = (hex: string, alpha: number) => {
    const normalized = hex.replace("#", "");
    const value = parseInt(normalized.length === 3 ? normalized.repeat(2) : normalized, 16);
    const red = (value >> 16) & 255;
    const green = (value >> 8) & 255;
    const blue = value & 255;
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  };

  // UMAP bounds
  const bounds = useMemo(() => {
    if (!points.length) return null;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX,
      maxX: maxX === minX ? minX + 1 : maxX,
      minY,
      maxY: maxY === minY ? minY + 1 : maxY,
    };
  }, [points]);

  // Map high-dimensional points to un-zoomed screen space (sx, sy)
  const projectPoint = (point: MapPoint, w: number, h: number) => {
    if (!bounds) return { sx: 0, sy: 0 };
    const pad = 42;
    const sx = pad + ((point.x - bounds.minX) / (bounds.maxX - bounds.minX)) * (w - pad * 2);
    const sy = h - pad - ((point.y - bounds.minY) / (bounds.maxY - bounds.minY)) * (h - pad * 2);
    return { sx, sy };
  };

  // Fetch coordinates and clusters
  const fetchMapData = async () => {
    if (activeView !== "map" || filteredPapers.length === 0) return;

    const ids = filteredPapers.map((p) => p.__key);
    if (ids.length < 3) {
      setPoints([]);
      setClusters([]);
      setMapStatus("Select at least three papers to compute a map.");
      return;
    }

    const currentId = requestIdRef.current + 1;
    requestIdRef.current = currentId;
    setIsComputing(true);
    setMapStatus(`Computing UMAP, HDBSCAN, and labels for ${ids.length.toLocaleString()} papers...`);

    // Lock the current key representation in state to resolve "out of sync"
    setLastComputedKeysKey(currentKeysKey);

    try {
      const response = await fetch("/api/map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail || payload.error || "Map computation failed");
      if (currentId !== requestIdRef.current) return;

      const receivedPoints = (payload.points || []) as MapPoint[];
      const rawClusters = (payload.clusters || []) as ClusterSummary[];

      const mappedClusters = rawClusters.map((cluster, index) => ({
        ...cluster,
        color: getClusterColor(cluster.cluster, index),
      }));

      setPoints(receivedPoints);
      setClusters(mappedClusters);
      setMapStatus(`${receivedPoints.length.toLocaleString()} papers mapped into ${mappedClusters.length.toLocaleString()} semantic groups.`);
    } catch (error) {
      if (currentId !== requestIdRef.current) return;
      setPoints([]);
      setClusters([]);
      setMapStatus("Map server is not ready. Start the local analysis server after generating embeddings.");
      setLastComputedKeysKey(""); // Let them retry if it failed
      console.error(error);
    } finally {
      if (currentId === requestIdRef.current) {
        setIsComputing(false);
      }
    }
  };

  // Auto-fetch ONLY on first load (when map has never been computed)
  useEffect(() => {
    if (activeView === "map" && points.length === 0 && filteredPapers.length >= 3) {
      fetchMapData();
    }
  }, [activeView]);

  // Compute final screen positions taking zoom (scale) and pan (panOffset) into account
  const projectedPoints = useMemo(() => {
    if (!points.length || !bounds) return [];

    const w = canvasDimensions.w;
    const h = canvasDimensions.h;

    return points.map((p) => {
      const { sx, sy } = projectPoint(p, w, h);
      const zx = (sx - w / 2) * scale + w / 2 + panOffset.x;
      const zy = (sy - h / 2) * scale + h / 2 + panOffset.y;
      return { ...p, sx, sy, zx, zy };
    });
  }, [points, bounds, scale, panOffset, canvasDimensions]);

  // Handle canvas drawing
  useEffect(() => {
    if (activeView !== "map") return; // DO NOT compute sizes or draw canvas when hidden (resolves zoom shift bugs)

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(360, Math.floor(rect.height));

    // Sync dimensions state if it changed from layout updates
    if (width !== canvasDimensions.w || height !== canvasDimensions.h) {
      setCanvasDimensions({ w: width, h: height });
      return;
    }

    if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
    }

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = "#fbfcfd";
    ctx.fillRect(0, 0, width, height);

    if (!points.length || !bounds) {
      ctx.fillStyle = "#667085";
      ctx.font = "700 14px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        isComputing ? "Computing dynamic layout..." : "Switch to the map after the analysis server is running.",
        width / 2,
        height / 2
      );
      return;
    }

    const clustersById = new Map<string, ClusterSummary>(
      clusters.map((cluster) => [String(cluster.cluster), cluster])
    );

    // Draw cluster hulls/backgrounds
    const grouped = new Map<number, ProjectedPoint[]>();
    projectedPoints.forEach((p) => {
      if (p.cluster === -1) return;
      if (!grouped.has(p.cluster)) grouped.set(p.cluster, []);
      grouped.get(p.cluster)!.push(p);
    });

    // Draw hulls (slightly faded if out of sync)
    grouped.forEach((clusterPoints, clusterId) => {
      if (clusterPoints.length < 4) return;
      const cluster = clustersById.get(String(clusterId));
      const minX = Math.min(...clusterPoints.map((p) => p.zx)) - 18;
      const maxX = Math.max(...clusterPoints.map((p) => p.zx)) + 18;
      const minY = Math.min(...clusterPoints.map((p) => p.zy)) - 18;
      const maxY = Math.max(...clusterPoints.map((p) => p.zy)) + 18;

      ctx.beginPath();
      const r = 18;
      const w = maxX - minX;
      const h = maxY - minY;
      const rx = Math.min(r, w / 2, h / 2);
      ctx.moveTo(minX + rx, minY);
      ctx.arcTo(minX + w, minY, minX + w, minY + h, rx);
      ctx.arcTo(minX + w, minY + h, minX, minY + h, rx);
      ctx.arcTo(minX, minY + h, minX, minY, rx);
      ctx.arcTo(minX, minY, minX + w, minY, rx);
      ctx.closePath();

      const color = cluster?.color || "#197064";
      ctx.fillStyle = hexToRgba(color, isOutOfSync ? 0.04 : 0.08);
      ctx.strokeStyle = hexToRgba(color, isOutOfSync ? 0.12 : 0.24);
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
    });

    // Draw points (semi-transparent if out of sync, or faded out if not matching active search query)
    projectedPoints.forEach((p) => {
      const cluster = clustersById.get(String(p.cluster));
      const isHover = hoverPoint?.id === p.id;
      const isSelected = selectedPaperKey === p.id;
      const matchesSearch = !matchingIds || matchingIds.has(p.id);

      ctx.beginPath();
      ctx.arc(p.zx, p.zy, isSelected ? 7 : isHover ? 5.5 : 3.8, 0, Math.PI * 2);
      ctx.fillStyle = p.cluster === -1 ? "#98a2b3" : cluster?.color || "#197064";
      ctx.globalAlpha = isHover || isSelected ? 1 : isOutOfSync ? 0.4 : matchesSearch ? 0.78 : 0.08;
      ctx.fill();
      ctx.globalAlpha = 1;

      if (isHover || isSelected) {
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeStyle = isSelected ? "#0f5c52" : "#18202a";
        ctx.stroke();
      }
    });

    // Draw cluster labels (only when zoom level is reasonable to keep readable)
    if (scale > 0.6) {
      clusters.forEach((cluster) => {
        const clusterPoints = projectedPoints.filter((p) => p.cluster === cluster.cluster);
        if (!clusterPoints.length) return;
        const cx = clusterPoints.map((p) => p.zx).reduce((a, b) => a + b, 0) / clusterPoints.length;
        const cy = clusterPoints.map((p) => p.zy).reduce((a, b) => a + b, 0) / clusterPoints.length;

        ctx.font = "800 11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const label = cluster.label || `Cluster ${cluster.cluster}`;
        const metrics = ctx.measureText(label);
        ctx.fillStyle = isOutOfSync ? "rgba(255, 255, 255, 0.65)" : "rgba(255, 255, 255, 0.86)";
        ctx.fillRect(cx - metrics.width / 2 - 8, cy - 12, metrics.width + 16, 24);
        ctx.fillStyle = isOutOfSync ? "#667085" : "#18202a";
        ctx.fillText(label, cx, cy);
      });
    }
  }, [projectedPoints, clusters, hoverPoint, selectedPaperKey, isComputing, scale, isOutOfSync, matchingIds, activeView]);

  // Handle pointer interactions (Hover, Pan, Zoom)
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !projectedPoints.length) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Handle Pan dragging
    if (isDraggingRef.current) {
      const dx = x - dragStartRef.current.x;
      const dy = y - dragStartRef.current.y;
      setPanOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      dragStartRef.current = { x, y };
      return;
    }

    // Handle Hover detection
    let nearest: ProjectedPoint | null = null;
    let nearestDistance = Infinity;

    for (const p of projectedPoints) {
      if (matchingIds && !matchingIds.has(p.id)) continue;
      const distance = Math.hypot(p.zx - x, p.zy - y);
      if (distance < nearestDistance) {
        nearest = p;
        nearestDistance = distance;
      }
    }

    if (!nearest || nearestDistance > 16) {
      setHoverPoint(null);
      return;
    }

    setHoverPoint(nearest);
    setTooltipPos({
      x: Math.min(rect.width - 360, nearest.zx + 14),
      y: Math.max(8, nearest.zy + 14),
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    dragStartRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = false;

    // Detect click (if there was very little/no dragging)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let nearest: ProjectedPoint | null = null;
    let nearestDistance = Infinity;

    for (const p of projectedPoints) {
      if (matchingIds && !matchingIds.has(p.id)) continue;
      const distance = Math.hypot(p.zx - x, p.zy - y);
      if (distance < nearestDistance) {
        nearest = p;
        nearestDistance = distance;
      }
    }

    // Set clicked paper
    if (nearest && nearestDistance <= 18) {
      setSelectedPaperKey(nearest.id);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const zoomFactor = 2.0;
    const nextScale = Math.min(15, scale * zoomFactor);

    setPanOffset((prev) => ({
      x: x - (x - prev.x - rect.width / 2) * (nextScale / scale) - rect.width / 2,
      y: y - (y - prev.y - rect.height / 2) * (nextScale / scale) - rect.height / 2,
    }));
    setScale(nextScale);
  };

  // Zooming via Native Wheel listener to block browser zoom conflicts (passive: false)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const currentScale = scaleRef.current;
      const currentPan = panOffsetRef.current;

      const zoomFactor = 1.1;
      const nextScale = e.deltaY < 0 
        ? Math.min(15, currentScale * zoomFactor) 
        : Math.max(0.4, currentScale / zoomFactor);

      if (nextScale !== currentScale) {
        setPanOffset({
          x: x - (x - currentPan.x - rect.width / 2) * (nextScale / currentScale) - rect.width / 2,
          y: y - (y - currentPan.y - rect.height / 2) * (nextScale / currentScale) - rect.height / 2,
        });
        setScale(nextScale);
      }
    };

    canvas.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleNativeWheel);
    };
  }, []);

  const handleResetZoom = () => {
    setScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleZoomIn = () => setScale((s) => Math.min(15, s * 1.2));
  const handleZoomOut = () => setScale((s) => Math.max(0.4, s / 1.2));

  const handleClusterClick = (clusterNum: number) => {
    const clusterPoints = projectedPoints.filter((p) => p.cluster === clusterNum);
    if (!clusterPoints.length) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width || canvas.width));
    const h = Math.max(360, Math.floor(rect.height || canvas.height));

    const sxs = clusterPoints.map((p) => p.sx);
    const sys = clusterPoints.map((p) => p.sy);
    const minSx = Math.min(...sxs);
    const maxSx = Math.max(...sxs);
    const minSy = Math.min(...sys);
    const maxSy = Math.max(...sys);

    const cWidth = maxSx - minSx;
    const cHeight = maxSy - minSy;

    const centerX = minSx + cWidth / 2;
    const centerY = minSy + cHeight / 2;

    const paddingMultiplier = 1.35;
    const scaleX = w / (cWidth || 1) / paddingMultiplier;
    const scaleY = h / (cHeight || 1) / paddingMultiplier;
    const nextScale = Math.max(0.4, Math.min(15, Math.min(scaleX, scaleY)));

    const targetPanX = -(centerX - w / 2) * nextScale;
    const targetPanY = -(centerY - h / 2) * nextScale;

    setScale(nextScale);
    setPanOffset({ x: targetPanX, y: targetPanY });
  };

  // Edit Interface Helpers
  const paperEdit = selectedPaper ? edits[selectedPaper.__key] : undefined;
  const currentRelevance = paperEdit?.relevance || selectedPaper?.__aiRelevance || "Unsure";
  const currentTags = paperEdit?.tags || [];

  const handleRelevanceToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedPaper) return;
    const nextRelevance = e.target.checked ? "Yes" : "No";
    onUpdateEdit(selectedPaper.__key, { relevance: nextRelevance });
  };

  const handleAddTag = () => {
    if (!selectedPaper) return;
    const cleaned = tagInput.trim().slice(0, 48);
    if (!cleaned) return;
    if (!currentTags.includes(cleaned)) {
      onUpdateEdit(selectedPaper.__key, { tags: [...currentTags, cleaned].sort((a, b) => a.localeCompare(b)) });
    }
    setTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    if (!selectedPaper) return;
    onUpdateEdit(selectedPaper.__key, { tags: currentTags.filter((t) => t !== tagToRemove) });
  };

  // Keyboard Arrow Key Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedPaperKey || activeView !== "map") return;

      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
        return;
      }

      const currentPoint = projectedPoints.find((p) => p.id === selectedPaperKey);
      if (!currentPoint) return;

      let candidates = projectedPoints.filter((p) => p.id !== selectedPaperKey);
      if (matchingIds) {
        candidates = candidates.filter((p) => matchingIds.has(p.id));
      }
      if (candidates.length === 0) return;

      const dxSign = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      const dySign = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0; // Canvas sy decreases going UP

      if (dxSign === 0 && dySign === 0) return;

      e.preventDefault();

      let nextPoint: ProjectedPoint | null = null;
      let bestScore = Infinity;

      candidates.forEach((p) => {
        const dx = p.zx - currentPoint.zx;
        const dy = p.zy - currentPoint.zy;
        const dist = Math.hypot(dx, dy);

        const dot = dx * dxSign + dy * dySign;
        if (dot <= 0) return; // Must be in the target half-plane

        // Minimize distance squared divided by projection dot product to favor axial movements
        const score = (dist * dist) / dot;
        if (score < bestScore) {
          bestScore = score;
          nextPoint = p;
        }
      });

      if (nextPoint) {
        setSelectedPaperKey((nextPoint as ProjectedPoint).id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedPaperKey, projectedPoints, matchingIds, activeView]);

  return (
    <div ref={containerRef} className="grid gap-4 w-full min-w-0">
      {/* Map Toolbar */}
      <div className="flex items-center justify-between gap-4 border border-line rounded-xl bg-white p-4 shadow-premium">
        <div>
          <h3 className="font-bold text-slate-800 text-base">Live Semantic Map</h3>
          <p className="text-xs text-muted mt-1 leading-normal">{mapStatus}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-1.5 hover:bg-slate-50 text-slate-600 rounded-md transition-all"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-1.5 hover:bg-slate-50 text-slate-600 rounded-md transition-all"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleResetZoom}
              className="p-1.5 hover:bg-slate-50 text-slate-600 rounded-md transition-all"
              title="Reset View"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleResetZoom}
            className="px-3 py-2 border border-line rounded-lg text-xs font-bold text-slate-600 hover:text-ink hover:bg-slate-50 transition-all shadow-sm"
          >
            Reset Zoom
          </button>
          <button
            type="button"
            disabled={isComputing}
            onClick={fetchMapData}
            className="flex items-center gap-2 px-4 py-2 border border-line rounded-lg text-xs font-bold text-slate-600 hover:text-ink hover:bg-slate-50 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isComputing ? "animate-spin" : ""}`} />
            Refresh map
          </button>
        </div>
      </div>

      {/* Out of Sync Notice */}
      {isOutOfSync && points.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs sm:text-sm text-amber-800 animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <span>
              The current map layout represents your <strong>previous selection</strong>. Your sidebar filters have changed.
            </span>
          </div>
          <button
            type="button"
            onClick={fetchMapData}
            disabled={isComputing}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg transition-all shadow-sm flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isComputing ? "animate-spin" : ""}`} />
            Update Map ({filteredPapers.length} papers)
          </button>
        </div>
      )}



      {/* Clusters Row Above Map */}
      <div className="border border-line rounded-xl bg-white p-4 shadow-premium w-full min-w-0 overflow-hidden">
        <h3 className="font-bold text-slate-800 text-[10px] uppercase tracking-wider mb-2 select-none">Clusters</h3>
        <div className="flex gap-3 overflow-x-auto pb-3.5 custom-scrollbar select-none">
          {clusters.length > 0 ? (
            clusters.map((c) => (
              <button
                key={c.cluster}
                type="button"
                onClick={() => handleClusterClick(c.cluster)}
                className="flex-shrink-0 border-l-4 rounded-r-lg bg-soft p-2.5 text-left text-xs flex flex-col gap-0.5 border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-all cursor-pointer min-w-[200px] max-w-[280px]"
                style={{ borderLeftColor: c.color }}
              >
                <strong className="font-bold text-ink leading-tight truncate w-full">
                  {c.label || `Cluster ${c.cluster}`}
                </strong>
                <span className="text-[9px] text-muted font-bold uppercase">
                  {c.count.toLocaleString()} papers
                </span>
                {c.keywords && c.keywords.length > 0 && (
                  <p className="text-[10px] text-slate-400 font-medium truncate w-full border-t border-slate-100 pt-0.5 mt-0.5">
                    {c.keywords.join(", ")}
                  </p>
                )}
              </button>
            ))
          ) : (
            <p className="text-xs text-muted font-medium py-1">No clusters resolved yet.</p>
          )}
        </div>
      </div>

      {/* Map Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 min-h-[620px]">
        {/* Canvas Area */}
        <div className="relative min-h-[620px] border border-line rounded-xl bg-[#fbfcfd] shadow-premium overflow-hidden select-none">
          {/* Zoom Level Indicator (Top Right) */}
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm border border-line rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-slate-700 shadow-sm pointer-events-none select-none z-10 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
            Zoom: {Math.round(scale * 100)}%
          </div>

          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            className="block w-full h-full min-h-[620px] cursor-grab active:cursor-grabbing"
            aria-label="Embedding scatter plot"
          />

          {/* Hover Tooltip (hidden when a paper is clicked/selected to reduce clutter) */}
          {hoverPoint && !selectedPaperKey && (
            <div
              className="absolute z-10 max-w-[340px] border border-line rounded-lg bg-white/95 shadow-premium p-3 text-xs leading-normal pointer-events-none"
              style={{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y}px` }}
            >
              <strong className="block font-bold text-ink mb-1">{hoverPoint.title}</strong>
              <span className="text-muted font-medium">
                {hoverPoint.conference} {hoverPoint.year}
              </span>
              <div className="mt-1.5 pt-1.5 border-t border-slate-100 font-semibold text-accent-strong">
                Topic: {clusters.find((c) => c.cluster === hoverPoint.cluster)?.label || "Noise / unclustered"}
              </div>
              <div className="mt-1 text-[10px] text-muted italic">Click point to view full details & edit</div>
            </div>
          )}
        </div>

        {/* Selected Paper Details Sidebar (Next to map) */}
        <aside className="border border-line rounded-xl bg-white shadow-premium p-5 flex flex-col overflow-y-auto max-h-[620px]">
          {selectedPaper ? (
            <div className="relative flex flex-col gap-4 animate-fadeIn transition-all duration-300">
              <button
                type="button"
                onClick={() => setSelectedPaperKey(null)}
                className="absolute top-0 right-0 flex items-center justify-center w-8 h-8 rounded-full border border-line bg-white text-slate-400 hover:text-slate-800 hover:shadow-sm transition-all"
                aria-label="Close details"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="pr-8">
                <span className="text-[10px] font-black text-accent-strong uppercase tracking-widest">
                  Selected Paper Details
                </span>
                <h2 className="text-base font-extrabold text-ink leading-snug mt-1">{searchInTitle ? highlightText(selectedPaper.title, searchQuery) : selectedPaper.title}</h2>
                <span className="inline-block text-xs font-semibold text-muted mt-1">
                  {[
                    selectedPaper.conference,
                    selectedPaper.year,
                    selectedPaper.type,
                    selectedPaper.award ? `Award: ${selectedPaper.award}` : "",
                  ]
                    .filter(Boolean)
                    .join(" | ")}
                </span>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-100 pt-3 text-xs">
                <div>
                  <h4 className="font-bold text-slate-400 uppercase tracking-wider mb-0.5">Authors</h4>
                  <p className="font-medium text-slate-700">
                    {selectedPaper.authors?.replaceAll("; ", ", ") || "Not listed"}
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-slate-400 uppercase tracking-wider mb-0.5">Affiliations</h4>
                  <p className="font-medium text-slate-700">
                    {selectedPaper.affiliations?.replaceAll("; ", ", ") || "Not listed"}
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-slate-400 uppercase tracking-wider mb-0.5">Session</h4>
                  <p className="font-medium text-slate-700">{selectedPaper.sessions || "No session listed"}</p>
                </div>
                <div>
                  <h4 className="font-bold text-slate-400 uppercase tracking-wider mb-0.5">AI Rationale</h4>
                  <p className="font-medium text-slate-700">{selectedPaper.rationale || "No AI rationale provided"}</p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Abstract</h4>
                <p className="text-xs text-slate-600 leading-relaxed max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  {searchInAbstract ? highlightText(selectedPaper.abstract || "No abstract provided", searchQuery) : (selectedPaper.abstract || "No abstract provided")}
                </p>
              </div>

              {/* Edit Controls */}
              <div className="flex flex-col gap-4 mt-2 pt-3 border-t border-line">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Classification</span>
                  <label className="inline-flex items-start gap-2.5 text-xs font-medium text-ink cursor-pointer mt-1">
                    <input
                      type="checkbox"
                      checked={currentRelevance === "Yes"}
                      onChange={handleRelevanceToggle}
                      className="w-4.5 h-4.5 rounded text-accent focus:ring-accent border-line accent-accent cursor-pointer"
                    />
                    <span className="select-none pt-0.5">Relevant to human-AI interaction</span>
                  </label>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tags</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add tag, Enter"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                      className="flex-1 text-xs bg-slate-50 border border-line rounded-lg py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="px-3 py-1.5 border border-accent rounded-lg text-xs font-extrabold text-accent bg-white hover:bg-accent hover:text-white transition-all"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5 min-h-[20px]">
                    {currentTags.length > 0 ? (
                      currentTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 bg-soft border border-line px-2 py-0.5 rounded-full text-[10px] font-bold text-slate-600"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-700 transition-all"
                            aria-label={`Remove ${tag}`}
                          >
                            <X className="w-2 h-2" />
                          </button>
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] font-medium text-slate-400 mt-0.5">No tags yet</span>
                    )}
                  </div>
                </div>
              </div>

              {/* DOI Actions */}
              <div className="mt-1 pt-3 border-t border-slate-100 flex justify-end">
                {selectedPaper.doi ? (
                  <a
                    href={selectedPaper.doi}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 border border-accent rounded-lg text-xs font-extrabold text-accent py-1.5 px-2.5 hover:bg-accent hover:text-white transition-all shadow-sm"
                  >
                    Open ACM DOI
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-[10px] font-medium text-slate-400">No DOI available</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center h-full py-20 text-muted select-none">
              <svg className="w-12 h-12 text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
              <h4 className="text-sm font-bold text-slate-700">No Paper Selected</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-[200px] leading-normal">
                Click a circle on the semantic map to inspect details, read rationales, or add tags.
              </p>
              <div className="mt-6 border-t border-line pt-4 w-full">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Keyboard Shortcuts</span>
                <span className="text-[11px] text-slate-500 font-medium leading-normal block">
                  Use arrow keys <strong className="text-slate-700">← ↑ ↓ →</strong> to navigate between adjacent papers on the map.
                </span>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
