#!/usr/bin/env python3
"""Local analysis server for dynamic embedding-map triage.

Run this server after creating `data/paper_embeddings.npz` and
`data/papers_metadata.json` with `scripts/precompute_embeddings.py`.
"""

from __future__ import annotations

import json
import math
import os
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import mimetypes
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
EMBEDDINGS_PATH = DATA_DIR / "paper_embeddings.npz"
METADATA_PATH = DATA_DIR / "papers_metadata.json"
ALLOW_FALLBACK = os.environ.get("ANALYSIS_ALLOW_FALLBACK") == "1"

STOPWORDS = {
    # Standard English stopwords (3+ chars)
    "about",
    "above",
    "across",
    "after",
    "afterwards",
    "again",
    "against",
    "all",
    "almost",
    "alone",
    "along",
    "already",
    "also",
    "although",
    "always",
    "among",
    "amongst",
    "amount",
    "and",
    "another",
    "any",
    "anyhow",
    "anyone",
    "anything",
    "anyway",
    "anywhere",
    "are",
    "around",
    "back",
    "became",
    "because",
    "become",
    "becomes",
    "becoming",
    "been",
    "before",
    "beforehand",
    "behind",
    "being",
    "below",
    "beside",
    "besides",
    "between",
    "beyond",
    "both",
    "bottom",
    "but",
    "call",
    "cannot",
    "can",
    "could",
    "did",
    "down",
    "due",
    "during",
    "each",
    "either",
    "else",
    "elsewhere",
    "empty",
    "enough",
    "even",
    "ever",
    "every",
    "everyone",
    "everything",
    "everywhere",
    "except",
    "few",
    "fifteen",
    "fifty",
    "fill",
    "find",
    "fire",
    "first",
    "five",
    "for",
    "former",
    "formerly",
    "forty",
    "found",
    "four",
    "from",
    "front",
    "full",
    "further",
    "get",
    "give",
    "had",
    "has",
    "have",
    "hence",
    "her",
    "here",
    "hereafter",
    "hereby",
    "herein",
    "hereupon",
    "hers",
    "herself",
    "him",
    "himself",
    "his",
    "how",
    "however",
    "hundred",
    "its",
    "itself",
    "keep",
    "last",
    "latter",
    "latterly",
    "least",
    "less",
    "ltd",
    "made",
    "many",
    "may",
    "meanwhile",
    "might",
    "mill",
    "mine",
    "more",
    "moreover",
    "most",
    "mostly",
    "move",
    "much",
    "must",
    "myself",
    "name",
    "namely",
    "neither",
    "never",
    "nevertheless",
    "next",
    "nine",
    "nobody",
    "none",
    "noone",
    "nor",
    "not",
    "nothing",
    "now",
    "nowhere",
    "off",
    "often",
    "once",
    "one",
    "only",
    "onto",
    "other",
    "others",
    "otherwise",
    "our",
    "ours",
    "ourselves",
    "out",
    "over",
    "own",
    "part",
    "per",
    "perhaps",
    "please",
    "put",
    "rather",
    "same",
    "see",
    "seem",
    "seemed",
    "seeming",
    "seems",
    "serious",
    "several",
    "she",
    "should",
    "show",
    "side",
    "since",
    "sincere",
    "six",
    "sixty",
    "some",
    "somehow",
    "someone",
    "something",
    "sometime",
    "sometimes",
    "somewhere",
    "still",
    "such",
    "system",
    "take",
    "ten",
    "than",
    "that",
    "the",
    "their",
    "them",
    "themselves",
    "then",
    "thence",
    "there",
    "thereafter",
    "thereby",
    "therefore",
    "therein",
    "thereupon",
    "these",
    "they",
    "thick",
    "thin",
    "third",
    "this",
    "those",
    "though",
    "three",
    "through",
    "throughout",
    "thru",
    "thus",
    "together",
    "too",
    "top",
    "toward",
    "towards",
    "twelve",
    "twenty",
    "two",
    "under",
    "until",
    "up",
    "upon",
    "us",
    "very",
    "via",
    "was",
    "well",
    "were",
    "what",
    "whatever",
    "when",
    "whence",
    "whenever",
    "where",
    "whereafter",
    "whereas",
    "whereby",
    "wherein",
    "whereupon",
    "wherever",
    "whether",
    "which",
    "while",
    "whither",
    "who",
    "whoever",
    "whole",
    "whom",
    "whose",
    "why",
    "will",
    "with",
    "within",
    "without",
    "would",
    "yet",
    "you",
    "your",
    "yours",
    "yourself",
    "yourselves",

    # CHI/UIST domain specific low-information terms
    "chi",
    "uist",
    "paper",
    "papers",
    "study",
    "studies",
    "research",
    "results",
    "participants",
    "analysis",
    "design",
    "designs",
    "interface",
    "interfaces",
    "interaction",
    "interactions",
    "user",
    "users",
    "system",
    "systems",
    "data",
    "tool",
    "tools",
    "approach",
    "approaches",
    "framework",
    "frameworks",
    "method",
    "methods",
    "evaluating",
    "evaluate",
    "evaluation",
    "evaluations",
    "novel",
    "proposed",
    "prototype",
    "present",
    "presents",
    "showing",
    "shows",
    "conducted",
    "controlled",
    "experiment",
    "experiments",
    "task",
    "tasks",
    "performance",
    "improving",
    "improve",
    "improves",
    "support",
    "supporting",
    "assist",
    "assisting",
    "help",
    "helping",
    "model",
    "models",
    "using",
    "work",
    "based",
    "human",
    "different",
    "various",
    "provide",
    "provides",
    "providing",
}


class MapRequest(BaseModel):
    ids: list[str]


app = FastAPI(title="CHI/UIST Paper Triage Analysis")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8000", "http://localhost:8000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

dataset: dict[str, Any] = {
    "metadata": {},
    "embeddings": None,
    "id_to_index": {},
    "model": "",
}


@app.on_event("startup")
def load_dataset() -> None:
    if not EMBEDDINGS_PATH.exists() or not METADATA_PATH.exists():
      return

    with METADATA_PATH.open(encoding="utf-8") as handle:
        metadata_rows = json.load(handle)
    packed = np.load(EMBEDDINGS_PATH, allow_pickle=False)
    ids = [str(item) for item in packed["ids"]]
    dataset["metadata"] = {str(row["id"]): row for row in metadata_rows}
    dataset["embeddings"] = packed["embeddings"].astype(np.float32)
    dataset["id_to_index"] = {paper_id: index for index, paper_id in enumerate(ids)}
    dataset["model"] = str(packed["model"][0]) if "model" in packed.files else ""


@app.get("/")
def index() -> FileResponse:
    return FileResponse(ROOT / "dist" / "index.html")


@app.get("/chi_uist_after_chatgpt.csv")
def get_csv() -> FileResponse:
    return FileResponse(ROOT / "chi_uist_after_chatgpt.csv")


@app.get("/api/status")
def status() -> dict[str, Any]:
    embeddings = dataset["embeddings"]
    return {
        "ready": embeddings is not None,
        "papers": 0 if embeddings is None else int(embeddings.shape[0]),
        "dimensions": 0 if embeddings is None else int(embeddings.shape[1]),
        "model": dataset["model"],
        "fallback": ALLOW_FALLBACK,
    }


@app.post("/api/map")
def compute_map(request: MapRequest) -> dict[str, Any]:
    embeddings = dataset["embeddings"]
    if embeddings is None:
        raise HTTPException(
            status_code=503,
            detail="Embeddings are missing. Run scripts/precompute_embeddings.py first.",
        )

    ordered_ids = [paper_id for paper_id in request.ids if paper_id in dataset["id_to_index"]]
    if len(ordered_ids) < 3:
        raise HTTPException(status_code=400, detail="At least three known paper IDs are required.")

    indexes = np.array([dataset["id_to_index"][paper_id] for paper_id in ordered_ids], dtype=np.int64)
    subset = embeddings[indexes]

    coords = reduce_umap(subset)
    labels = cluster_hdbscan(coords, subset)
    cluster_summaries = extract_cluster_labels(ordered_ids, labels)

    points = []
    for paper_id, coord, cluster in zip(ordered_ids, coords, labels):
        meta = dataset["metadata"].get(paper_id, {})
        points.append(
            {
                "id": paper_id,
                "x": float(coord[0]),
                "y": float(coord[1]),
                "cluster": int(cluster),
                "title": meta.get("title", ""),
                "conference": meta.get("conference", ""),
                "year": meta.get("year", ""),
                "relevance": meta.get("relevance", ""),
            }
        )

    return {
        "points": points,
        "clusters": cluster_summaries,
        "algorithm": {
            "reduction": "UMAP" if not ALLOW_FALLBACK else "UMAP or PCA fallback",
            "clustering": "HDBSCAN" if not ALLOW_FALLBACK else "HDBSCAN or density fallback",
        },
    }


def reduce_umap(vectors: np.ndarray) -> np.ndarray:
    try:
        import umap

        reducer = umap.UMAP(
            n_components=2,
            n_neighbors=max(2, min(30, len(vectors) - 1)),
            min_dist=0.08,
            metric="cosine",
            random_state=42,
        )
        return reducer.fit_transform(vectors).astype(np.float32)
    except Exception as exc:
        if not ALLOW_FALLBACK:
            raise HTTPException(status_code=503, detail=f"UMAP is unavailable: {exc}") from exc
        centered = vectors - vectors.mean(axis=0, keepdims=True)
        _, _, vh = np.linalg.svd(centered, full_matrices=False)
        return (centered @ vh[:2].T).astype(np.float32)


def cluster_hdbscan(coords: np.ndarray, vectors: np.ndarray) -> np.ndarray:
    try:
        import hdbscan

        min_cluster_size = max(5, min(45, int(math.sqrt(len(coords)) * 1.5)))
        min_samples = max(3, min(15, int(min_cluster_size / 4)))
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size,
            min_samples=min_samples,
            cluster_selection_method="leaf",
        )
        return clusterer.fit_predict(coords).astype(np.int32)
    except Exception as exc:
        if not ALLOW_FALLBACK:
            raise HTTPException(status_code=503, detail=f"HDBSCAN is unavailable: {exc}") from exc
        return density_fallback(coords)


def density_fallback(coords: np.ndarray) -> np.ndarray:
    if len(coords) < 8:
        return np.zeros(len(coords), dtype=np.int32)
    bins = np.linspace(0, len(coords), max(3, min(10, int(math.sqrt(len(coords))))), dtype=int)
    order = np.argsort(coords[:, 0])
    labels = np.full(len(coords), -1, dtype=np.int32)
    for cluster_id, (start, end) in enumerate(zip(bins[:-1], bins[1:])):
        labels[order[start:end]] = cluster_id
    return labels


def extract_cluster_labels(ordered_ids: list[str], labels: np.ndarray) -> list[dict[str, Any]]:
    cluster_to_ids: dict[int, list[str]] = defaultdict(list)
    for paper_id, label in zip(ordered_ids, labels):
        if int(label) >= 0:
            cluster_to_ids[int(label)].append(paper_id)

    cluster_docs = {
        cluster: " ".join(text_for(dataset["metadata"][paper_id]) for paper_id in ids)
        for cluster, ids in cluster_to_ids.items()
    }
    tokenized = {cluster: tokenize(text) for cluster, text in cluster_docs.items()}
    document_frequency = Counter()
    for tokens in tokenized.values():
        document_frequency.update(set(tokens))

    cluster_count = max(len(tokenized), 1)
    summaries = []
    for cluster, tokens in tokenized.items():
        counts = Counter(tokens)
        total = sum(counts.values()) or 1
        scores = {}
        for term, count in counts.items():
            tf = count / total
            idf = math.log((1 + cluster_count) / (1 + document_frequency[term])) + 1
            scores[term] = tf * idf
        keywords = [term for term, _ in sorted(scores.items(), key=lambda item: item[1], reverse=True)[:5]]
        summaries.append(
            {
                "cluster": cluster,
                "count": len(cluster_to_ids[cluster]),
                "keywords": keywords,
                "label": ", ".join(keywords[:3]) if keywords else f"Cluster {cluster}",
            }
        )

    return sorted(summaries, key=lambda item: item["count"], reverse=True)


def text_for(row: dict[str, Any]) -> str:
    return f"{row.get('title', '')}. {row.get('abstract', '')}"


def tokenize(text: str) -> list[str]:
    tokens = re.findall(r"[a-z][a-z-]{2,}", text.lower())
    return [token for token in tokens if token not in STOPWORDS and len(token) <= 28]


app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="static")
