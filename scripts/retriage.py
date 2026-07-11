#!/usr/bin/env python3
import csv
import re
from pathlib import Path

# File paths
CSV_PATH = Path("chi_uist_after_chatgpt.csv")
BACKUP_PATH = Path("chi_uist_after_chatgpt.csv.bak")

# Keywords and Regex patterns for LLM, Generative AI, and AI Agents
GEN_AI_KEYWORDS = [
    r"\bllms?\b",
    r"large language model",
    r"generative\s+ai\b",
    r"generative\s+artificial\s+intelligence",
    r"generative\s+model",
    r"generative\s+adversarial",
    r"\bgans?\b",
    r"diffusion\s+model",
    r"stable\s+diffusion",
    r"midjourney",
    r"dall-e",
    r"\bgpt\b",
    r"chatgpt",
    r"llama",
    r"claude",
    r"gemini",
    r"copilot",
    r"prompt\s+engineering",
    r"prompting",
    r"prompt-based",
    r"text-to-image",
    r"text-to-code",
    r"text-to-video",
    r"image\s+generation",
    r"video\s+generation",
    r"code\s+generation",
    r"generative\s+design",
    r"chatbot",
    r"conversational\s+agent",
    r"autonomous\s+agent",
    r"ai\s+agent",
    r"llm\s+agent",
    r"agentic",
    r"large\s+multimodal\s+model",
    r"\blmms?\b",
    r"in-context\s+learning",
    r"instruction\s+tuning"
]

pattern = re.compile("|".join(GEN_AI_KEYWORDS), re.IGNORECASE)

def main():
    if not CSV_PATH.exists():
        print(f"Error: {CSV_PATH} not found.")
        return

    # Backup the original file
    if not BACKUP_PATH.exists():
        import shutil
        shutil.copy(CSV_PATH, BACKUP_PATH)
        print(f"Created backup of original CSV at {BACKUP_PATH}")

    rows = []
    total_yes = 0
    converted_to_no = 0

    with CSV_PATH.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for index, row in enumerate(reader):
            # Check current relevance
            is_relevant = row.get("relevance", "").strip().lower() == "yes"
            if is_relevant:
                total_yes += 1
                title = row.get("title", "")
                abstract = row.get("abstract", "")
                combined_text = f"{title}. {abstract}"
                
                # Test against GenAI patterns
                if not pattern.search(combined_text):
                    # Convert to No
                    row["relevance"] = "No"
                    row["rationale"] = "Broad HCI/HAI paper. Excluded because it does not explicitly focus on or utilize LLMs, Generative AI, or AI Agents."
                    converted_to_no += 1
            rows.append(row)

    # Write new CSV
    with CSV_PATH.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Triage Audit complete:")
    print(f"- Total papers evaluated: {len(rows):,}")
    print(f"- Original relevant ('Yes') papers: {total_yes:,}")
    print(f"- Converted to irrelevant ('No'): {converted_to_no:,}")
    print(f"- Remaining relevant ('Yes') papers: {total_yes - converted_to_no:,}")

if __name__ == "__main__":
    main()
