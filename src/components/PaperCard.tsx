import { useState } from "react";
import type { Paper, Edit } from "../types";
import { Plus, Minus, ExternalLink, X } from "lucide-react";

interface PaperCardProps {
  paper: Paper;
  edit?: Edit;
  onUpdateEdit: (key: string, patch: Partial<Edit>) => void;
  searchQuery?: string;
  searchInTitle?: boolean;
  searchInAbstract?: boolean;
}

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

export const PaperCard: React.FC<PaperCardProps> = ({
  paper,
  edit,
  onUpdateEdit,
  searchQuery = "",
  searchInTitle = true,
  searchInAbstract = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const relevance = edit?.relevance || paper.__aiRelevance || "Unsure";
  const tags = edit?.tags || [];

  const handleRelevanceToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextRelevance = e.target.checked ? "Yes" : "No";
    onUpdateEdit(paper.__key, { relevance: nextRelevance });
  };

  const handleAddTag = () => {
    const cleaned = tagInput.trim().slice(0, 48);
    if (!cleaned) return;
    if (!tags.includes(cleaned)) {
      onUpdateEdit(paper.__key, { tags: [...tags, cleaned].sort((a, b) => a.localeCompare(b)) });
    }
    setTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onUpdateEdit(paper.__key, { tags: tags.filter((t) => t !== tagToRemove) });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const getRelevancePillClass = (rel: string) => {
    switch (rel) {
      case "Yes":
        return "bg-[#dff4ed] text-[#12644f]";
      case "No":
        return "bg-[#f5e6e8] text-danger";
      default:
        return "bg-[#fff0d6] text-warn";
    }
  };

  return (
    <article className="border border-line rounded-xl bg-white shadow-premium overflow-hidden transition-all duration-200">
      {/* Header Summary */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 sm:p-5 text-left gap-4 hover:bg-slate-50/50 transition-all focus:outline-none"
        aria-expanded={isExpanded}
      >
        <div className="flex items-start gap-4 flex-1">
          <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border border-line text-accent-strong bg-white font-black text-sm">
            {isExpanded ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-base sm:text-lg font-extrabold text-ink leading-snug">
              {searchInTitle ? highlightText(paper.title, searchQuery) : paper.title}
            </h3>
            <span className="inline-block mt-1.5 text-xs font-semibold text-muted">
              {[
                paper.conference,
                paper.year,
                paper.type,
                paper.award ? `Award: ${paper.award}` : "",
              ]
                .filter(Boolean)
                .join(" | ")}
            </span>
          </div>
        </div>
        <span className={`flex-shrink-0 text-xs font-extrabold px-3 py-1.5 rounded-full ${getRelevancePillClass(relevance)}`}>
          {relevance}
        </span>
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-5 pb-5 pt-3 border-t border-line ml-12 mr-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Authors</h4>
              <p className="text-sm font-medium text-slate-700">{paper.authors?.replaceAll("; ", ", ") || "Not listed"}</p>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Affiliations</h4>
              <p className="text-sm font-medium text-slate-700">{paper.affiliations?.replaceAll("; ", ", ") || "Not listed"}</p>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Session</h4>
              <p className="text-sm font-medium text-slate-700">{paper.sessions || "No session listed"}</p>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">AI Rationale</h4>
              <p className="text-sm font-medium text-slate-700">{paper.rationale || "No AI rationale provided"}</p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Abstract</h4>
            <p className="text-sm text-slate-600 leading-relaxed font-normal">
              {searchInAbstract ? highlightText(paper.abstract || "No abstract provided", searchQuery) : (paper.abstract || "No abstract provided")}
            </p>
          </div>

          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 pt-5 border-t border-line">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Classification</span>
              <label className="inline-flex items-start gap-2.5 text-sm font-medium text-ink cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={relevance === "Yes"}
                  onChange={handleRelevanceToggle}
                  className="w-5 h-5 rounded text-accent focus:ring-accent border-line accent-accent cursor-pointer"
                />
                <span className="select-none pt-0.5">Relevant to human-AI interaction interfaces</span>
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tags</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add tag, then press Enter"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 text-sm bg-slate-50 border border-line rounded-lg py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-4 py-1.5 border border-accent rounded-lg text-xs font-extrabold text-accent bg-white hover:bg-accent hover:text-white transition-all"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2 min-h-[24px]">
                {tags.length > 0 ? (
                  tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1.5 bg-soft border border-line px-2.5 py-1 rounded-full text-xs font-bold text-slate-600"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="flex items-center justify-center w-4 h-4 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-700 transition-all"
                        aria-label={`Remove ${tag}`}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))
                ) : (
                  <span className="text-xs font-medium text-slate-400 mt-1">No tags yet</span>
                )}
              </div>
            </div>
          </div>

          {/* DOI */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex justify-end">
            {paper.doi ? (
              <a
                href={paper.doi}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 border border-accent rounded-lg text-xs font-extrabold text-accent py-2 px-3 hover:bg-accent hover:text-white transition-all shadow-sm"
              >
                Open ACM DOI
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : (
              <span className="text-xs font-medium text-slate-400">No DOI available</span>
            )}
          </div>
        </div>
      )}
    </article>
  );
};
