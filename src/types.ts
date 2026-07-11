export interface Paper {
  id: string;
  title: string;
  conference: string;
  year: string;
  type: string;
  authors: string;
  affiliations: string;
  doi: string;
  sessions: string;
  abstract: string;
  relevance: string;
  rationale: string;
  award?: string;

  __key: string;
  __index: number;
  __search: string;
  __aiRelevance: "Yes" | "No" | "Unsure";
}

export interface Edit {
  relevance: "Yes" | "No" | "Unsure";
  tags: string[];
  updated_at: string;
}

export interface MapPoint {
  id: string;
  x: number;
  y: number;
  cluster: number;
  title: string;
  conference: string;
  year: string;
  relevance: string;
}

export interface ClusterSummary {
  cluster: number;
  count: number;
  keywords: string[];
  label: string;
  color?: string;
}

export interface Filters {
  search: string;
  searchInTitle: boolean;
  searchInAbstract: boolean;
  conference: string;
  years: Set<string>;
  relevance: Set<"Yes" | "No" | "Unsure">;
  tag: string;
  type: string;
  showOnlyEdited: boolean;
  sort: string;
}
