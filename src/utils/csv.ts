import type { Paper } from "../types";

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];

  const rawHeaders = rows.shift() || [];
  const headers = rawHeaders.map((header) => header.replace(/^\uFEFF/, ""));

  return rows.map((values) => {
    const item: Record<string, string> = {};
    headers.forEach((header, index) => {
      item[header] = values[index] ?? "";
    });
    return item;
  });
}

export function normalizeRelevance(value: string): "Yes" | "No" | "Unsure" {
  const text = String(value || "").trim().toLowerCase();
  if (text === "yes" || text === "relevant" || text === "true") return "Yes";
  if (text === "no" || text === "not relevant" || text === "false") return "No";
  return "Unsure";
}

export function normalizeRow(row: Record<string, string>, index: number): Paper {
  const cleanedRow: Record<string, string> = {};
  Object.keys(row).forEach((key) => {
    cleanedRow[key] = String(row[key] ?? "").trim();
  });

  const key = cleanedRow.content_id || cleanedRow.imported_id || `${cleanedRow.title}-${cleanedRow.year}-${index}`;
  const rawRelevance = cleanedRow.relevance || cleanedRow.relevance_original || "";
  const aiRelevance = normalizeRelevance(rawRelevance);

  return {
    id: key,
    title: cleanedRow.title || "Untitled paper",
    conference: cleanedRow.conference || "",
    year: cleanedRow.year || "",
    type: cleanedRow.type || "",
    authors: cleanedRow.authors || "",
    affiliations: cleanedRow.affiliations || "",
    doi: cleanedRow.doi || "",
    sessions: cleanedRow.sessions || "",
    abstract: cleanedRow.abstract || "",
    relevance: cleanedRow.relevance || "",
    rationale: cleanedRow.rationale || "",
    award: cleanedRow.award || undefined,

    __key: key,
    __index: index,
    __search: [
      cleanedRow.title,
      cleanedRow.authors,
      cleanedRow.affiliations,
      cleanedRow.sessions,
      cleanedRow.abstract,
      cleanedRow.rationale,
      cleanedRow.conference,
      cleanedRow.year,
    ]
      .join(" ")
      .toLowerCase(),
    __aiRelevance: aiRelevance,
  };
}
