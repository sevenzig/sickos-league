#!/usr/bin/env python3
"""
Presort loose video files and directories across multiple source directories into tv/ and movies/ subdirs.
Dry-run by default. Pass --go to actually move files.
Pass --stats-only to suppress verbose file-by-file output.
"""
import os
import re
import sys
import shutil
from pathlib import Path

# Main root folders
BASE = Path("/home/sevenzig/files")
TV   = BASE / "tv" / "_unsorted"
MOV  = BASE / "movies" / "_unsorted"

# Define all directories you want the script to scan for loose files/folders
SOURCES = [
    BASE,
    BASE / "completed_downloads",
    BASE / "completped_downloads"
]

# Standard video extensions
EXTS = {".mkv", ".mp4", ".avi", ".m4v", ".webm", ".flv", ".wmv", ".mpg", ".mpeg"}

# Explicit ignore list for system, data, and non-media folders
# Only applied when scanning BASE itself, so it doesn't swallow category
# subfolders (tv/movies/music/books) that download clients create inside
# completed_downloads/completped_downloads.
IGNORE_LIST = {
    "tv", "movies", "bin", "homebox-data", "koel", "music", "books",
    "completed_downloads", "completped_downloads", "lost+found", "downloads"
}

# 1. TV - Strong SxxExx or Sxx (even if pushed directly against words like DarkShadowsS05)
TV_STRONG_RE = re.compile(r'\b[Ss]\d{1,2}(?:[Ee]\d{1,2})?\b|(?<=[a-zA-Z])[Ss]\d{1,2}(?:[Ee]\d{1,2})?(?![0-9])', re.IGNORECASE)

# 2. MOV - 4-digit year 1900–2099
YEAR_RE = re.compile(r'\b(?:19|20)\d{2}\b')

# 3. MOV - Explicit movie keywords
MOVIE_RE = re.compile(r'\b(?:movie|feature|film|docu|documentary)\b', re.IGNORECASE)

# 4. TV - Stage patterns (standard in Initial D releases)
STAGE_RE = re.compile(r'\b(?:\d{1,2}(?:st|nd|rd|th)|First|Second|Third|Fourth|Fifth|Final|Stage)\s+Stage\b', re.IGNORECASE)

# 5. TV - Weekly/Anime episode numbers (e.g., "01" or "01 03")
EP_RE = re.compile(r'\b(?:ep|episode|e)\s*\d{1,3}\b|\b\d{1,2}\s*~\s*\d{1,2}\b|\b\d{1,2}\b', re.IGNORECASE)

# 6. MOV - Common release tags (used as a scene fallback for movies with no year)
SCENE_RE = re.compile(r'\b(?:dvdrip|bluray|bdrip|hdrip|web-dl|webrip|x264|x265|h264|h265|hevc|10bit)\b', re.IGNORECASE)

stats_only = "--stats-only" in sys.argv
dry = "--go" not in sys.argv

# Ensure destination folders are ready
if not dry:
    TV.mkdir(parents=True, exist_ok=True)
    MOV.mkdir(parents=True, exist_ok=True)


def clean_name(s):
    """Normalize names by replacing punctuation separators with spaces to fix boundary matching."""
    return re.sub(r'[._\s,([\]-]', ' ', s)


def classify_item(f, apply_ignore):
    name = f.name
    name_lower = name.lower()

    # Hidden files are always skipped. IGNORE_LIST only applies at the BASE
    # level (to avoid moving tv/movies/completed_downloads themselves) -
    # applying it inside a landing folder would also swallow category
    # subfolders like completed_downloads/tv/ or completed_downloads/movies/.
    if name.startswith(".") or (apply_ignore and name_lower in IGNORE_LIST):
        return None, "IGNORE"

    # Gather video files inside
    video_files = []
    if f.is_file():
        if f.suffix.lower() in EXTS:
            video_files = [f]
    elif f.is_dir():
        for path in f.rglob("*"):
            if path.is_file() and path.suffix.lower() in EXTS:
                # Ignore hidden subdirectories
                if not any(part.startswith(".") for part in path.parts):
                    video_files.append(path)
    else:
        return None, "IGNORE"

    # If the folder has no video files (e.g. books, logs), silently ignore it
    if not video_files:
        return None, "IGNORE"

    # Rule A: Multi-video directories are almost certainly TV Show season/series packs
    if f.is_dir() and len(video_files) > 1:
        return "TV", f"TV Show (Directory with {len(video_files)} episodes)"

    # Rule B: Single video folders or loose files get parsed by name matching
    candidates = [clean_name(name)]
    if len(video_files) == 1:
        candidates.append(clean_name(video_files[0].name))

    # Match 1: Strong TV indicators (Sxx/SxxExx)
    for c in candidates:
        if TV_STRONG_RE.search(c):
            return "TV", "TV Show (Strong Sxx pattern)"

    # Match 2: Strong Movie Year indicator (takes priority over weaker episodic patterns)
    for c in candidates:
        if YEAR_RE.search(c):
            return "MOV", "Movie (Year matched)"

    # Match 3: Strong Movie Keywords
    for c in candidates:
        if MOVIE_RE.search(c):
            return "MOV", "Movie (Keyword matched)"

    # Match 4: Anime TV Stage patterns
    for c in candidates:
        if STAGE_RE.search(c):
            return "TV", "TV Show (Stage pattern)"

    # Match 5: Weekly episode numbers (excluding common video standard resolutions/codecs)
    for c in candidates:
        for m in EP_RE.finditer(c):
            num_match = re.search(r'\d+', m.group(0))
            if num_match:
                val = int(num_match.group(0))
                if val not in {360, 480, 576, 720, 1080, 2160, 264, 265, 1008}:
                    return "TV", f"TV Show (Episode #{val} matched)"

    # Match 6: Weaker Movie Scene keywords
    for c in candidates:
        if SCENE_RE.search(c):
            return "MOV", "Movie (Scene tags matched)"

    # Match 7: Fallback for loose video assets that have no TV characteristics
    return "MOV", "Movie (Fallback - video asset with no TV signatures)"


tv_count = mov_count = skip_count = 0

# Loop through each defined source directory
for src_dir in SOURCES:
    if not src_dir.is_dir():
        if not stats_only:
            print(f"Skipping source '{src_dir}' (directory does not exist)")
        continue

    if not stats_only:
        print(f"\n--- Scanning Source: {src_dir} ---")

    for f in sorted(src_dir.iterdir()):
        category, reason = classify_item(f, apply_ignore=(src_dir == BASE))

        if category is None:
            if reason == "IGNORE" and not stats_only:
                print(f"SKIP  {f.name} ({reason})")
            skip_count += 1
            continue

        dest_dir = TV if category == "TV" else MOV
        dest = dest_dir / f.name

        if dest.exists():
            if not stats_only:
                print(f"SKIP  {f.name} (already exists in destination)")
            skip_count += 1
            continue

        if category == "TV":
            tv_count += 1
        else:
            mov_count += 1

        if not stats_only:
            print(f"{'MOVE' if not dry else 'DRY '} {category}  {f.name} -> {reason}")

        if not dry:
            shutil.move(str(f), str(dest))

print(f"\n{'DRY RUN — ' if dry else ''}TV: {tv_count}  Movies: {mov_count}  Skipped: {skip_count}")
if dry:
    print("Run with --go to actually move files.")
