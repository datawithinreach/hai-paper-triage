#!/usr/bin/env python3
"""Precompute paper embeddings for the local triage app.

The script keeps model-dependent work offline. The web server later loads the
resulting dense vectors and recomputes only the active 2D layout and clusters.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer


DEFAULT_MODEL = "BAAI/bge-m3"
DEFAULT_INPUT = Path("chi_uist_after_chatgpt.csv")
DEFAULT_OUT_DIR = Path("data")


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def paper_key(row: dict[str, str], index: int) -> str:
    return clean_text(row.get("content_id")) or clean_text(row.get("imported_id")) or f"paper-{index}"


def load_papers(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def main() -> None:
    parser = argparse.ArgumentParser(description="Precompute CHI/UIST paper text embeddings.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--device", default=None, help="Optional sentence-transformers device, e.g. cpu, mps, cuda")
    args = parser.parse_args()

    papers = load_papers(args.input)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    metadata = []
    texts = []
    ids = []
    for index, row in enumerate(papers):
        normalized = {key: clean_text(value) for key, value in row.items()}
        key = paper_key(normalized, index)
        title = normalized.get("title", "")
        abstract = normalized.get("abstract", "")
        unified_text = clean_text(f"{title}. {abstract}")
        ids.append(key)
        texts.append(unified_text)
        metadata.append(
            {
                "id": key,
                "conference": normalized.get("conference", ""),
                "year": normalized.get("year", ""),
                "type": normalized.get("type", ""),
                "title": title,
                "authors": normalized.get("authors", ""),
                "affiliations": normalized.get("affiliations", ""),
                "doi": normalized.get("doi", ""),
                "sessions": normalized.get("sessions", ""),
                "abstract": abstract,
                "relevance": normalized.get("relevance", ""),
                "rationale": normalized.get("rationale", ""),
                "embedding_text": unified_text,
            }
        )

    print(f"Loading {args.model} for {len(texts):,} papers...")
    model = SentenceTransformer(args.model, device=args.device)
    embeddings = model.encode(
        texts,
        batch_size=args.batch_size,
        normalize_embeddings=True,
        show_progress_bar=True,
        convert_to_numpy=True,
    ).astype(np.float32)

    np.savez_compressed(
        args.out_dir / "paper_embeddings.npz",
        ids=np.array(ids),
        embeddings=embeddings,
        model=np.array([args.model]),
    )
    with (args.out_dir / "papers_metadata.json").open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, ensure_ascii=False)

    print(f"Wrote {args.out_dir / 'paper_embeddings.npz'}")
    print(f"Wrote {args.out_dir / 'papers_metadata.json'}")


if __name__ == "__main__":
    main()
