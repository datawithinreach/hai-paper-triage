#!/usr/bin/env python3
import csv
import json
from pathlib import Path

CSV_PATH = Path("chi_uist_after_chatgpt.csv")
JSON_PATH = Path("data/papers_metadata.json")

def main():
    if not CSV_PATH.exists() or not JSON_PATH.exists():
        print("Required files not found.")
        return

    # Read relevance and rationale from CSV
    csv_data = {}
    with CSV_PATH.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cid = row.get("content_id") or row.get("imported_id")
            if cid:
                csv_data[cid] = {
                    "relevance": row.get("relevance", "No"),
                    "rationale": row.get("rationale", "")
                }

    # Load JSON
    with JSON_PATH.open(encoding="utf-8") as f:
        metadata = json.load(f)

    # Sync
    updated_count = 0
    for paper in metadata:
        pid = paper.get("id")
        if pid in csv_data:
            if paper["relevance"] != csv_data[pid]["relevance"]:
                paper["relevance"] = csv_data[pid]["relevance"]
                paper["rationale"] = csv_data[pid]["rationale"]
                updated_count += 1

    # Save JSON back
    with JSON_PATH.open("w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False)

    print(f"Synced metadata JSON: Updated {updated_count:,} papers to match CSV relevance.")

if __name__ == "__main__":
    main()
