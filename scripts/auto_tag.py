#!/usr/bin/env python3
import csv
import re
from pathlib import Path

CSV_PATH = Path("chi_uist_after_chatgpt.csv")

# Data Science keywords regex
DATA_SCIENCE_PAT = re.compile(
    r"\b(data\s+science|data\s+scientists?|data\s+analytics|data\s+work(er)?s?|data\s+analysis|data\s+visualiz[a-z]*|exploratory\s+data|visualization|visual\s+analytics|jupyter|computational\s+notebooks?|data\s+wrangling|data\s+cleaning|dataframe|pandas)\b",
    re.IGNORECASE
)

# Accessibility keywords regex
ACCESSIBILITY_PAT = re.compile(
    r"\b(accessib[a-z]*|blind|deaf|vision\s+impair[a-z]*|visual\s+impair[a-z]*|hearing\s+impair[a-z]*|disabilit[a-z]*|screen\s+readers?|sign\s+language|assistive\s+tech[a-z]*|braille|neurodiverg[a-z]*|adhd|autis[m-z]*|motor\s+impair[a-z]*)\b",
    re.IGNORECASE
)

def main():
    if not CSV_PATH.exists():
        print(f"Error: {CSV_PATH} not found.")
        return

    rows = []
    ds_count = 0
    a11y_count = 0
    total_relevant = 0

    with CSV_PATH.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames)
        
        # Ensure 'tags' column is in fieldnames
        if "tags" not in fieldnames:
            fieldnames.append("tags")
            
        for row in reader:
            is_relevant = row.get("relevance", "").strip().lower() == "yes"
            if is_relevant:
                total_relevant += 1
                title = row.get("title", "")
                abstract = row.get("abstract", "")
                sessions = row.get("sessions", "")
                combined_text = f"{title}. {abstract}. {sessions}"
                
                # Get existing tags
                existing_tags_str = row.get("tags") or ""
                existing_tags = [t.strip() for t in existing_tags_str.split(";") if t.strip()]
                
                # Check topics
                added_tags = []
                if DATA_SCIENCE_PAT.search(combined_text):
                    if "data science" not in existing_tags:
                        added_tags.append("data science")
                        ds_count += 1
                if ACCESSIBILITY_PAT.search(combined_text):
                    if "accessibility" not in existing_tags:
                        added_tags.append("accessibility")
                        a11y_count += 1
                        
                if added_tags:
                    combined_tags = existing_tags + added_tags
                    row["tags"] = ";".join(combined_tags)
                    
            rows.append(row)

    # Write back CSV
    with CSV_PATH.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Tag Preprocessing complete:")
    print(f"- Total relevant papers scanned: {total_relevant:,}")
    print(f"- Tagged with 'data science': {ds_count:,}")
    print(f"- Tagged with 'accessibility': {a11y_count:,}")

if __name__ == "__main__":
    main()
