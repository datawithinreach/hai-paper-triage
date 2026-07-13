import { useState, useEffect, useMemo } from "react";
import { PanelLeft } from "lucide-react";
import type { Paper, Edit, Filters } from "./types";
import { parseCsv, normalizeRow } from "./utils/csv";
import { Sidebar } from "./components/Sidebar";
import { PaperCard } from "./components/PaperCard";
import { EmbeddingMap } from "./components/EmbeddingMap";

const DATA_FILE = import.meta.env.BASE_URL + "chi_uist_after_chatgpt.csv";
const STORAGE_KEY = "hai-paper-triage-edits-v1";
const BASELINE_EDITS_KEY = "hai-paper-triage-baseline-edits-v1";
const PAGE_SIZE = 80;

function loadEdits(): Record<string, Edit> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error("Failed to load edits from localStorage", error);
    return {};
  }
}

function saveEdits(edits: Record<string, Edit>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(edits));
  } catch (error) {
    console.error("Failed to save edits to localStorage", error);
  }
}

export default function App() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>(loadEdits);
  const [loadState, setLoadState] = useState("Loading dataset...");
  const [activeView, setActiveView] = useState<"list" | "map">("list");
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [filters, setFilters] = useState<Filters>({
    search: "",
    searchInTitle: true,
    searchInAbstract: true,
    conference: "All",
    years: new Set<string>(),
    relevance: new Set<"Yes" | "No" | "Unsure">(["Yes"]),
    tags: new Set<string>(),
    type: "All",
    showOnlyEdited: false,
    showOnlyBookmarked: false,
    sort: "relevance",
  });

  // Fetch and parse CSV data
  useEffect(() => {
    async function init() {
      try {
        const response = await fetch(DATA_FILE);
        if (!response.ok) throw new Error(`Could not load ${DATA_FILE}`);
        const csv = await response.text();
        const rawRows = parseCsv(csv);
        
        // Load baseline edits overrides from localStorage
        const storedBaseline = localStorage.getItem(BASELINE_EDITS_KEY);
        const baselineEdits: Record<string, Edit> = storedBaseline ? JSON.parse(storedBaseline) : {};

        const normalized = rawRows.map((row, index) => {
          const paper = normalizeRow(row, index);
          const override = baselineEdits[paper.__key];
          if (override) {
            paper.__aiRelevance = override.relevance;
            paper.__tags = override.tags;
            paper.__bookmarked = !!override.bookmarked;
          }
          return paper;
        });
        
        // Populate years from data initially
        const years = Array.from(new Set(normalized.map((row) => row.year).filter(Boolean))).sort();
        setFilters((prev) => ({ ...prev, years: new Set(years) }));
        setPapers(normalized);
        setLoadState(`${normalized.length.toLocaleString()} papers loaded`);
      } catch (error) {
        setLoadState("Dataset could not be loaded");
        console.error(error);
      }
    }
    init();
  }, []);

  // Compute unique values for filter controls
  const uniqueConferences = useMemo(() => {
    return Array.from(new Set(papers.map((p) => p.conference).filter(Boolean)));
  }, [papers]);

  const uniqueYears = useMemo(() => {
    return Array.from(new Set(papers.map((p) => p.year).filter(Boolean))).sort((a, b) => b.localeCompare(a));
  }, [papers]);

  const uniqueTypes = useMemo(() => {
    return Array.from(new Set(papers.map((p) => p.type).filter(Boolean))).sort();
  }, [papers]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    papers.forEach((p) => {
      const paperTags = edits[p.__key]?.tags || p.__tags || [];
      paperTags.forEach((t) => tags.add(t));
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [papers, edits]);

  // Update tag selections when edits change
  useEffect(() => {
    const nextTags = new Set<string>();
    let changed = false;
    filters.tags.forEach((t) => {
      if (allTags.includes(t)) {
        nextTags.add(t);
      } else {
        changed = true;
      }
    });
    if (changed) {
      setFilters((prev) => ({ ...prev, tags: nextTags }));
    }
  }, [allTags, filters.tags]);

  // Handle saving of edits
  const handleUpdateEdit = (key: string, patch: Partial<Edit>) => {
    setEdits((prev) => {
      const paper = papers.find((p) => p.__key === key);
      const current = prev[key] || {
        relevance: paper?.__aiRelevance || "Unsure",
        tags: paper?.__tags || [],
        bookmarked: !!paper?.__bookmarked,
        updated_at: new Date().toISOString(),
      };
      
      const next: Edit = {
        ...current,
        ...patch,
        updated_at: new Date().toISOString(),
      };
      
      const changedRelevance = next.relevance !== paper?.__aiRelevance;
      
      const origTags = paper?.__tags || [];
      const tagsChanged = next.tags.length !== origTags.length || !next.tags.every((t) => origTags.includes(t));
      
      const changedBookmark = next.bookmarked !== !!paper?.__bookmarked;
      
      const nextEdits = { ...prev };
      if (!changedRelevance && !tagsChanged && !changedBookmark) {
        delete nextEdits[key];
      } else {
        nextEdits[key] = next;
      }
      
      saveEdits(nextEdits);
      return nextEdits;
    });
  };

  // Helper functions for paper relevance and tags
  const getEffectiveRelevance = (paper: Paper) => {
    return edits[paper.__key]?.relevance || paper.__aiRelevance || "Unsure";
  };

  const getTags = (paper: Paper) => {
    return edits[paper.__key]?.tags || paper.__tags || [];
  };

  const getEffectiveBookmarked = (paper: Paper) => {
    return edits[paper.__key]?.bookmarked ?? paper.__bookmarked;
  };

  // Apply filters and sorting
  const filteredPapers = useMemo(() => {
    const { search, searchInTitle, searchInAbstract, conference, years, relevance, tags, type, showOnlyEdited, showOnlyBookmarked, sort } = filters;
    
    let result = papers.filter((paper) => {
      const currentRelevance = getEffectiveRelevance(paper);
      const paperTags = getTags(paper);
      const searchLower = search.trim().toLowerCase();
      
      const matchConf = conference === "All" || paper.conference === conference;
      const matchYear = years.has(paper.year);
      const matchRelevance = relevance.has(currentRelevance);
      const matchTag = tags.size === 0 || Array.from(tags).every((t) => paperTags.includes(t));
      const matchType = type === "All" || paper.type === type;
      const matchEdited = !showOnlyEdited || !!edits[paper.__key];
      const matchBookmarked = !showOnlyBookmarked || getEffectiveBookmarked(paper);
      
      let matchSearch = true;
      if (searchLower) {
        let matchTitle = false;
        let matchAbstract = false;
        if (searchInTitle) {
          matchTitle = paper.title.toLowerCase().includes(searchLower);
        }
        if (searchInAbstract) {
          matchAbstract = paper.abstract.toLowerCase().includes(searchLower);
        }
        const tagText = paperTags.join(" ").toLowerCase();
        const matchTags = tagText.includes(searchLower);
        matchSearch = matchTitle || matchAbstract || matchTags;
      }
      
      return matchConf && matchYear && matchRelevance && matchTag && matchType && matchEdited && matchBookmarked && matchSearch;
    });

    // Sorting
    result.sort((a, b) => {
      if (sort === "year-asc") {
        return a.year.localeCompare(b.year) || a.title.localeCompare(b.title);
      }
      if (sort === "title-asc") {
        return a.title.localeCompare(b.title);
      }
      if (sort === "relevance") {
        const relA = getEffectiveRelevance(a) === "Yes" ? 1 : 0;
        const relB = getEffectiveRelevance(b) === "Yes" ? 1 : 0;
        return relB - relA || b.year.localeCompare(a.year) || a.title.localeCompare(b.title);
      }
      if (sort === "irrelevant") {
        const relA = getEffectiveRelevance(a) === "No" ? 1 : 0;
        const relB = getEffectiveRelevance(b) === "No" ? 1 : 0;
        return relB - relA || b.year.localeCompare(a.year) || a.title.localeCompare(b.title);
      }
      // default: year-desc
      return b.year.localeCompare(a.year) || a.title.localeCompare(b.title);
    });

    return result;
  }, [papers, edits, filters]);

  const mapFilteredPapers = useMemo(() => {
    const { conference, years, relevance, tags, showOnlyBookmarked } = filters;
    
    const result = papers.filter((paper) => {
      const currentRelevance = getEffectiveRelevance(paper);
      const paperTags = getTags(paper);
      
      const matchConf = conference === "All" || paper.conference === conference;
      const matchYear = years.has(paper.year);
      const matchRelevance = relevance.has(currentRelevance);
      const matchTag = tags.size === 0 || Array.from(tags).every((t) => paperTags.includes(t));
      const matchBookmarked = !showOnlyBookmarked || getEffectiveBookmarked(paper);
      
      return matchConf && matchYear && matchRelevance && matchTag && matchBookmarked;
    });

    // Stably sort to keep consistent ID ordering for the API request
    result.sort((a, b) => a.__key.localeCompare(b.__key));
    return result;
  }, [papers, edits, filters.conference, filters.years, filters.relevance, filters.tags, filters.showOnlyBookmarked]);

  // Handle infinite scroll
  useEffect(() => {
    const handleScroll = () => {
      const nearBottom = window.innerHeight + window.scrollY > document.body.offsetHeight - 600;
      if (nearBottom && visibleLimit < filteredPapers.length) {
        setVisibleLimit((prev) => prev + PAGE_SIZE);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [visibleLimit, filteredPapers.length]);

  // Reset limit when filters change
  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [filters]);

  // Actions
  const handleResetFilters = () => {
    setFilters({
      search: "",
      searchInTitle: true,
      searchInAbstract: true,
      conference: "All",
      years: new Set(uniqueYears),
      relevance: new Set(["Yes"]),
      tags: new Set<string>(),
      type: "All",
      showOnlyEdited: false,
      showOnlyBookmarked: false,
      sort: "relevance",
    });
  };

  const handleExportCsv = () => {
    if (!papers.length) return;
    
    // Grab headers from the first paper object or use columns
    const columns = [
      "conference",
      "year",
      "type",
      "title",
      "authors",
      "affiliations",
      "countries",
      "doi",
      "award",
      "sessions",
      "abstract",
      "content_id",
      "imported_id",
      "relevance_original",
      "rationale",
      "relevance_edited",
      "tags",
      "bookmarked",
      "edited_at",
    ];

    const csvContent = [
      columns.join(","),
      ...papers.map((p) => {
        const edit = edits[p.__key];
        
        // Use user-edited tags/bookmarks if they exist, otherwise fallback to baseline values
        const activeTags = edit && edit.tags ? edit.tags : p.__tags;
        const tagsStr = activeTags ? activeTags.join(";") : "";
        
        const isBookmarked = edit && edit.bookmarked !== undefined ? edit.bookmarked : p.__bookmarked;

        const activeRelevance = edit ? edit.relevance : p.__aiRelevance;
        const relevanceEditedStr = activeRelevance !== p.relevance ? activeRelevance : "";

        const rowData = [
          p.conference,
          p.year,
          p.type,
          p.title,
          p.authors,
          p.affiliations,
          "", // countries placeholder if not saved
          p.doi,
          p.award || "",
          p.sessions,
          p.abstract,
          p.content_id || "",
          p.imported_id || "",
          p.__aiRelevance,
          p.rationale,
          relevanceEditedStr,
          tagsStr,
          isBookmarked ? "Yes" : "No",
          edit ? edit.updated_at : "",
        ];
        
        return rowData
          .map((value) => {
            const str = String(value ?? "");
            if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
              return `"${str.replaceAll('"', '""')}"`;
            }
            return str;
          })
          .join(",");
      }),
    ].join("\n");

    const blob = new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `chi_uist_triage_reviewed_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportCsv = (csvText: string) => {
    try {
      const rawRows = parseCsv(csvText);
      if (!rawRows || rawRows.length === 0) {
        alert("Empty or invalid CSV file.");
        return;
      }
      
      const normalized = rawRows.map((row, index) => normalizeRow(row, index));
      
      // Reconstruct user edits from the imported CSV rows by comparing with the server baseline
      const importedEdits: Record<string, Edit> = {};
      normalized.forEach((p) => {
        const originalPaper = papers.find((orig) => orig.__key === p.__key);
        if (!originalPaper) return;

        // An edit exists if relevance_edited is filled and differs from original relevance
        const hasRelevanceEdit = p.__aiRelevance !== originalPaper.__aiRelevance;

        // Compare tags arrays
        const origTags = originalPaper.__tags || [];
        const impTags = p.__tags || [];
        const tagsChanged = origTags.length !== impTags.length || !origTags.every((t) => impTags.includes(t));

        // Compare bookmarks (original baseline has no bookmarks)
        const hasBookmarkEdit = p.__bookmarked === true;
        
        if (hasRelevanceEdit || tagsChanged || hasBookmarkEdit) {
          importedEdits[p.__key] = {
            relevance: p.__aiRelevance,
            tags: p.__tags,
            bookmarked: p.__bookmarked,
            updated_at: new Date().toISOString(),
          };
        }
      });
      
      // Save these as the persistent baseline overrides
      localStorage.setItem(BASELINE_EDITS_KEY, JSON.stringify(importedEdits));
      
      // Reset active session edits completely back to zero
      setEdits({});
      saveEdits({});
      
      alert(`Successfully imported progress! Loaded ${Object.keys(importedEdits).length} overrides into baseline. Your active edits counter has been reset to 0.`);
      
      // Force page reload to cleanly re-initialize the baseline CSV with the imported baseline edits
      window.location.reload();
    } catch (err) {
      alert("Failed to parse the imported CSV file. Make sure it has a valid format.");
      console.error(err);
    }
  };

  // Metrics
  const relevantCount = useMemo(() => {
    return filteredPapers.filter((p) => getEffectiveRelevance(p) === "Yes").length;
  }, [filteredPapers, edits]);

  const editedCount = Object.keys(edits).length;
  const progressPercent = papers.length ? Math.round((editedCount / papers.length) * 100) : 0;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen">
      {/* Sidebar */}
      {isSidebarOpen && (
        <Sidebar
          filters={filters}
          setFilters={setFilters}
          papers={papers}
          edits={edits}
          uniqueConferences={uniqueConferences}
          uniqueYears={uniqueYears}
          uniqueTypes={uniqueTypes}
          allTags={allTags}
          savedEditsCount={editedCount}
          onExport={handleExportCsv}
          onImport={handleImportCsv}
          onReset={handleResetFilters}
        />
      )}

      {/* Main Workspace */}
      <main className="flex-1 p-6 md:p-8 min-w-0">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="flex items-center justify-center p-2.5 border border-line bg-white hover:bg-slate-50 text-slate-600 hover:text-ink rounded-xl transition-all shadow-sm cursor-pointer"
              title={isSidebarOpen ? "Collapse Filter Panel" : "Expand Filter Panel"}
            >
              <PanelLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="text-xs font-black text-accent-strong tracking-widest uppercase mb-1">{loadState}</div>
              <h2 className="text-3xl font-extrabold text-ink tracking-tight">
                {activeView === "map" ? "Embedding Map" : "Proceedings Review"}
              </h2>
            </div>
          </div>
          
          {/* Metrics */}
          <div className="grid grid-cols-3 gap-2.5 min-w-[300px]">
            <div className="bg-white border border-line rounded-lg p-3 shadow-premium">
              <strong className="block text-xl font-extrabold text-ink">{filteredPapers.length.toLocaleString()}</strong>
              <span className="block text-[10px] font-bold text-muted uppercase mt-0.5">shown</span>
            </div>
            <div className="bg-white border border-line rounded-lg p-3 shadow-premium">
              <strong className="block text-xl font-extrabold text-ink">{relevantCount.toLocaleString()}</strong>
              <span className="block text-[10px] font-bold text-muted uppercase mt-0.5">relevant</span>
            </div>
            <div className="bg-white border border-line rounded-lg p-3 shadow-premium">
              <strong className="block text-xl font-extrabold text-ink">{editedCount.toLocaleString()}</strong>
              <span className="block text-[10px] font-bold text-muted uppercase mt-0.5">edited</span>
            </div>
          </div>
        </header>

        {/* View Toggle Tabs */}
        <nav className="inline-flex bg-slate-200 border border-line rounded-lg p-1 gap-1 mb-5" aria-label="View mode">
          <button
            type="button"
            onClick={() => setActiveView("list")}
            aria-pressed={activeView === "list"}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
              activeView === "list"
                ? "bg-white text-accent-strong shadow-sm"
                : "text-muted hover:text-ink hover:bg-slate-300/40"
            }`}
          >
            Review list
          </button>
          <button
            type="button"
            onClick={() => setActiveView("map")}
            aria-pressed={activeView === "map"}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${
              activeView === "map"
                ? "bg-white text-accent-strong shadow-sm"
                : "text-muted hover:text-ink hover:bg-slate-300/40"
            }`}
          >
            Embedding map
          </button>
        </nav>

        {/* Progress Strip */}
        <section className="flex items-center gap-3 mb-6 text-xs font-bold text-muted" aria-label="Review progress">
          <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span>
            {editedCount > 0
              ? `${editedCount.toLocaleString()} of ${papers.length.toLocaleString()} papers edited (${progressPercent}%)`
              : "No edits yet"}
          </span>
        </section>

        {/* View Panel */}
        <div className="mt-4">
          <div className={activeView === "list" ? "block" : "hidden"}>
            {/* Header / Sort Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <span className="text-xs font-bold text-slate-500">
                Showing {filteredPapers.length.toLocaleString()} papers
              </span>
              <div className="flex items-center gap-2">
                <label htmlFor="list-sort" className="text-xs font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                  Sort:
                </label>
                <select
                  id="list-sort"
                  value={filters.sort}
                  onChange={(e) => setFilters((prev) => ({ ...prev, sort: e.target.value }))}
                  className="bg-white border border-line rounded-lg py-1.5 px-3 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent cursor-pointer"
                >
                  <option value="relevance">Relevant first</option>
                  <option value="year-desc">Newest first</option>
                  <option value="year-asc">Oldest first</option>
                  <option value="title-asc">Title A-Z</option>
                  <option value="irrelevant">Irrelevant first</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              {filteredPapers.length > 0 ? (
                filteredPapers
                  .slice(0, visibleLimit)
                  .map((paper) => (
                    <PaperCard
                      key={paper.__key}
                      paper={paper}
                      edit={edits[paper.__key]}
                      onUpdateEdit={handleUpdateEdit}
                      searchQuery={filters.search}
                      searchInTitle={filters.searchInTitle}
                      searchInAbstract={filters.searchInAbstract}
                      allTags={allTags}
                    />
                  ))
              ) : (
                <div className="border border-line rounded-xl bg-white shadow-premium p-8 text-center mt-6">
                  <h3 className="text-lg font-bold text-ink">No matching papers</h3>
                  <p className="text-sm text-muted mt-2">Try a broader search or reset the filters.</p>
                </div>
              )}
            </div>
          </div>

          <div className={activeView === "map" ? "block" : "hidden"}>
            <EmbeddingMap
              filteredPapers={mapFilteredPapers}
              activeView={activeView}
              edits={edits}
              onUpdateEdit={handleUpdateEdit}
              searchQuery={filters.search}
              searchInTitle={filters.searchInTitle}
              searchInAbstract={filters.searchInAbstract}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
