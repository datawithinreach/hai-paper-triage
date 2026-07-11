import { useMemo } from "react";
import type { Filters, Paper, Edit } from "../types";
import { Search, RotateCcw, Download, Upload } from "lucide-react";

interface SidebarProps {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  papers: Paper[];
  edits: Record<string, Edit>;
  uniqueConferences: string[];
  uniqueYears: string[];
  uniqueTypes: string[];
  allTags: string[];
  savedEditsCount: number;
  onExport: () => void;
  onImport: (csvText: string) => void;
  onReset: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  filters,
  setFilters,
  papers,
  edits,
  uniqueConferences,
  uniqueYears,
  uniqueTypes,
  allTags,
  savedEditsCount,
  onExport,
  onImport,
  onReset,
}) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === "string") {
        onImport(text);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const yearStats = useMemo(() => {
    const stats: Record<string, { relevant: number; irrelevant: number; total: number }> = {};
    papers.forEach((p) => {
      if (p.year) {
        if (!stats[p.year]) {
          stats[p.year] = { relevant: 0, irrelevant: 0, total: 0 };
        }
        const edit = edits[p.__key];
        const effRelevance = edit ? edit.relevance : p.__aiRelevance;
        if (effRelevance === "Yes") {
          stats[p.year].relevant += 1;
        } else {
          stats[p.year].irrelevant += 1;
        }
        stats[p.year].total += 1;
      }
    });
    return stats;
  }, [papers, edits]);

  const maxTotal = useMemo(() => {
    const values = Object.values(yearStats).map((s) => s.total);
    return values.length > 0 ? Math.max(...values) : 1;
  }, [yearStats]);
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, search: e.target.value }));
  };

  const handleConfChange = (conf: string) => {
    setFilters((prev) => ({ ...prev, conference: conf }));
  };

  const handleYearToggle = (year: string) => {
    setFilters((prev) => {
      const nextYears = new Set(prev.years);
      if (nextYears.has(year)) {
        nextYears.delete(year);
      } else {
        nextYears.add(year);
      }
      return { ...prev, years: nextYears };
    });
  };

  const handleRelevanceToggle = (rel: "Yes" | "No" | "Unsure") => {
    setFilters((prev) => {
      const nextRel = new Set(prev.relevance);
      if (nextRel.has(rel)) {
        nextRel.delete(rel);
      } else {
        nextRel.add(rel);
      }
      return { ...prev, relevance: nextRel };
    });
  };





  return (
    <aside className="w-full lg:w-80 lg:h-screen lg:sticky lg:top-0 bg-white border-b lg:border-b-0 lg:border-r border-line p-6 overflow-y-auto flex flex-col justify-between">
      <div className="space-y-6">
        {/* Brand */}
        <div className="pb-4 border-b border-line">
          <h1 className="text-2xl font-extrabold text-ink leading-tight">Paper Triage</h1>
          <p className="text-xs text-muted mt-1.5 font-medium">CHI/UIST human-AI interaction review</p>
        </div>

        {/* Search */}
        <div className="flex flex-col gap-2">
          <label htmlFor="search" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Search
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
              <Search className="w-4 h-4" />
            </span>
            <input
              id="search"
              type="text"
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-line rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent text-sm transition-all"
              placeholder="Title, author, abstract, tag..."
              value={filters.search}
              onChange={handleSearchChange}
            />
          </div>
          <div className="flex items-center gap-4 mt-1.5 pl-1 select-none">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-500 font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={filters.searchInTitle}
                onChange={(e) => setFilters((prev) => ({ ...prev, searchInTitle: e.target.checked }))}
                className="w-3.5 h-3.5 rounded text-accent focus:ring-accent border-line accent-accent cursor-pointer"
              />
              Title
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-500 font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={filters.searchInAbstract}
                onChange={(e) => setFilters((prev) => ({ ...prev, searchInAbstract: e.target.checked }))}
                className="w-3.5 h-3.5 rounded text-accent focus:ring-accent border-line accent-accent cursor-pointer"
              />
              Abstract
            </label>
          </div>
        </div>

        {/* Conference */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Conference</span>
          <div className="flex gap-2">
            {["All", ...uniqueConferences].map((conf) => {
              const isActive = filters.conference === conf;
              return (
                <button
                  key={conf}
                  type="button"
                  onClick={() => handleConfChange(conf)}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                    isActive
                      ? "bg-accent-strong text-white border-accent-strong shadow-sm"
                      : "bg-white text-slate-600 border-line hover:bg-slate-50"
                  }`}
                >
                  {conf}
                </button>
              );
            })}
          </div>
        </div>

        {/* Year Distribution Stacked Bar Chart */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Year</span>
          <div className="bg-slate-50 border border-line rounded-xl p-3.5 flex items-end justify-between gap-3 h-36 select-none">
            {[...uniqueYears].reverse().map((year) => {
              const stats = yearStats[year] || { relevant: 0, irrelevant: 0, total: 0 };
              const isActive = filters.years.has(year);
              const pct = (stats.total / maxTotal) * 100;
              
              // Segment percentage heights
              const relPct = stats.total > 0 ? (stats.relevant / stats.total) * 100 : 0;
              const irrelPct = stats.total > 0 ? (stats.irrelevant / stats.total) * 100 : 0;

              return (
                <button
                  key={year}
                  type="button"
                  onClick={() => handleYearToggle(year)}
                  className="flex-1 flex flex-col items-center gap-1 group cursor-pointer h-full justify-end"
                  title={`${year}: ${stats.relevant.toLocaleString()} Relevant, ${stats.irrelevant.toLocaleString()} Irrelevant / Unsure (Total: ${stats.total.toLocaleString()})`}
                >
                  {/* Tooltip Count */}
                  <span className="text-[9px] font-black text-slate-500 opacity-80 group-hover:opacity-100 transition-opacity">
                    {stats.total.toLocaleString()}
                  </span>
                  
                  {/* Stacked Bar Visual */}
                  <div 
                    className="w-full relative rounded-t-md transition-all duration-300 flex flex-col-reverse overflow-hidden" 
                    style={{ height: `${Math.max(15, pct * 0.65)}%` }}
                  >
                    {/* Relevant Segment */}
                    <div 
                      className={`w-full transition-all ${
                        isActive 
                          ? "bg-accent-strong" 
                          : "bg-slate-400 group-hover:bg-slate-500"
                      }`}
                      style={{ height: `${relPct}%` }}
                    />
                    {/* Irrelevant Segment */}
                    <div 
                      className={`w-full transition-all border-b border-white/10 ${
                        isActive 
                          ? "bg-accent/30" 
                          : "bg-slate-200 group-hover:bg-slate-300"
                      }`}
                      style={{ height: `${irrelPct}%` }}
                    />
                  </div>
                  
                  {/* Label */}
                  <span className={`text-[10px] font-bold tracking-tight transition-all mt-1 ${
                    isActive ? "text-accent-strong font-black" : "text-slate-500"
                  }`}>
                    {year}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Relevance</span>
          <div className="flex gap-1.5">
            {(["Yes", "No", "Unsure"] as const).map((option) => {
              const isActive = filters.relevance.has(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handleRelevanceToggle(option)}
                  className={`flex-1 px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer text-center ${
                    isActive
                      ? "bg-accent-strong text-white border-accent-strong shadow-sm"
                      : "bg-white text-slate-600 border-line hover:bg-slate-50"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-100 flex flex-col gap-1.5">
            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filters.showOnlyEdited}
                onChange={(e) => setFilters((prev) => ({ ...prev, showOnlyEdited: e.target.checked }))}
                className="w-3.5 h-3.5 rounded text-accent focus:ring-accent border-line accent-accent cursor-pointer"
              />
              Show only edited papers
            </label>
            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filters.showOnlyBookmarked}
                onChange={(e) => setFilters((prev) => ({ ...prev, showOnlyBookmarked: e.target.checked }))}
                className="w-3.5 h-3.5 rounded text-accent focus:ring-accent border-line accent-accent cursor-pointer"
              />
              Show only bookmarked papers
            </label>
          </div>
        </div>

        {/* Type Filter */}
        <div className="flex flex-col gap-2">
          <label htmlFor="type" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Type
          </label>
          <select
            id="type"
            className="w-full bg-white border border-line rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
            value={filters.type}
            onChange={(e) => setFilters((prev) => ({ ...prev, type: e.target.value }))}
          >
            <option value="All">All types</option>
            {uniqueTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Tag Filter */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Tag</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFilters((prev) => ({ ...prev, tag: "" }))}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                filters.tag === ""
                  ? "bg-accent-strong text-white border-accent-strong shadow-sm"
                  : "bg-white text-slate-600 border-line hover:bg-slate-50"
              }`}
            >
              All
            </button>
            {allTags.map((tag) => {
              const isActive = filters.tag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, tag: isActive ? "" : tag }))}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                    isActive
                      ? "bg-accent-strong text-white border-accent-strong shadow-sm"
                      : "bg-white text-slate-600 border-line hover:bg-slate-50"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>


      </div>

      {/* Footer / Actions */}
      <div className="mt-8 pt-6 border-t border-line space-y-4">
        <div className="flex gap-2">
          <label className="flex-1 inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-line font-bold text-sm py-2.5 px-4 rounded-lg shadow-sm hover:shadow transition-all cursor-pointer select-none">
            <Upload className="w-4 h-4 text-slate-500" />
            Import CSV
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={onExport}
            className="flex-1 inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-strong text-white font-bold text-sm py-2.5 px-4 rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center justify-center bg-white border border-line text-slate-600 hover:text-ink font-bold text-sm py-2.5 px-3.5 rounded-lg hover:bg-slate-50 transition-all"
            title="Reset filters"
          >
            <RotateCcw className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="flex items-center gap-3 bg-soft p-3 rounded-lg border border-line text-xs font-medium text-muted">
          <strong className="text-xl font-extrabold text-accent-strong">{savedEditsCount}</strong>
          <span>edited papers saved in this browser</span>
        </div>
      </div>
    </aside>
  );
};
