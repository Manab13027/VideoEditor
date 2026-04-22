"""Social media optimization service."""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

PLATFORM_LIMITS: dict = {
    "tiktok":         {"maxFileSizeMB": 287,    "maxDurationSeconds": 600,   "recommendedWidth": 1080, "recommendedHeight": 1920, "maxHashtags": 30},
    "instagram_reel": {"maxFileSizeMB": 100,    "maxDurationSeconds": 90,    "recommendedWidth": 1080, "recommendedHeight": 1920, "maxHashtags": 30},
    "instagram_post": {"maxFileSizeMB": 100,    "maxDurationSeconds": 60,    "recommendedWidth": 1080, "recommendedHeight": 1080, "maxHashtags": 30},
    "youtube":        {"maxFileSizeMB": 262144, "maxDurationSeconds": 43200, "recommendedWidth": 1920, "recommendedHeight": 1080, "maxHashtags": 0},
}

_HASHTAG_DB_PATH = Path(__file__).parent.parent / "data" / "hashtag_db.json"
_hashtag_db: dict | None = None

# Synonyms expand keyword matching beyond bare category names
_CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "travel":     ["trip", "vlog", "explore", "adventure", "vacation", "holiday", "tour", "paris", "abroad"],
    "food":       ["recipe", "cooking", "cook", "eat", "meal", "dish", "cuisine", "bake", "chef"],
    "fitness":    ["gym", "workout", "exercise", "training", "health", "muscle", "cardio", "yoga", "run"],
    "gaming":     ["game", "gamer", "play", "stream", "esport", "console", "pc", "rpg", "fps"],
    "music":      ["song", "singer", "beat", "melody", "rap", "guitar", "piano", "band", "cover"],
    "fashion":    ["style", "outfit", "clothes", "clothing", "wear", "ootd", "dress", "haul"],
    "comedy":     ["funny", "joke", "laugh", "humor", "humour", "skit", "prank", "meme"],
    "beauty":     ["makeup", "skincare", "cosmetic", "tutorial", "skin", "hair", "nails"],
    "tech":       ["technology", "gadget", "software", "hardware", "phone", "laptop", "coding", "ai", "app"],
    "education":  ["learn", "study", "tutorial", "teach", "lesson", "school", "course", "how"],
    "lifestyle":  ["daily", "routine", "life", "morning", "evening", "habits", "wellbeing"],
    "pets":       ["cat", "dog", "animal", "puppy", "kitten", "pet", "cute", "fur"],
    "business":   ["entrepreneur", "startup", "money", "finance", "marketing", "brand", "hustle"],
    "sports":     ["sport", "athlete", "football", "basketball", "soccer", "tennis", "swim", "race"],
    "art":        ["draw", "paint", "design", "creative", "sketch", "illustration", "artwork"],
    "diy":        ["craft", "handmade", "build", "make", "project", "tutorial", "repair", "home"],
    "nature":     ["outdoor", "wildlife", "forest", "mountain", "ocean", "plant", "landscape"],
    "motivation": ["inspire", "goal", "mindset", "success", "positivity", "grind", "hustle"],
    "vlog":       ["day", "week", "life", "behind", "scenes", "diary", "follow", "come"],
}


def _load_hashtag_db() -> dict:
    global _hashtag_db
    if _hashtag_db is None:
        with open(_HASHTAG_DB_PATH, encoding="utf-8") as f:
            _hashtag_db = json.load(f)
    return _hashtag_db


def _best_category(title: str, description: str, db: dict) -> str:
    """Find best matching category using category names + synonym keywords."""
    words = set(f"{title} {description}".lower().split())
    best_cat = "general"
    best_score = 0
    for cat in db:
        if cat == "general":
            continue
        # Score = name word matches + synonym matches
        name_words = set(cat.replace("_", " ").split())
        synonyms = set(_CATEGORY_KEYWORDS.get(cat, []))
        score = len(words & (name_words | synonyms))
        if score > best_score:
            best_score = score
            best_cat = cat
    return best_cat


def generate_hashtags(
    title: str,
    description: str,
    platforms: list[str],
    api_key: Optional[str] = None,
) -> list[dict]:
    """Return [{platform, tags}] for each requested platform.

    Tries Claude API (claude-haiku-4-5-20251001) first.
    Falls back to local hashtag_db.json on any failure or missing key.
    Tags are returned without # prefix.
    """
    key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=key)
            platform_list = ", ".join(platforms)
            message = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1024,
                messages=[{
                    "role": "user",
                    "content": (
                        f'Generate hashtag sets for a video titled "{title}". '
                        f'Description: "{description}". '
                        f'Return ONLY valid JSON with this exact shape (no markdown, no explanation): '
                        f'{{"tiktok": ["tag1", "tag2", ...up to 30 tags], '
                        f'"instagram_reel": ["tag1", ...up to 10 tags], '
                        f'"instagram_post": ["tag1", ...up to 10 tags], '
                        f'"youtube": []}}. '
                        f'Only include platforms from this list: {platform_list}. '
                        f'Tags must be lowercase, no spaces, no # symbol.'
                    ),
                }],
            )
            raw = message.content[0].text.strip()
            if raw.startswith("```"):
                parts = raw.split("```")
                raw = parts[1]
                if raw.startswith("json"):
                    raw = raw[4:]
            data = json.loads(raw.strip())
            return [{"platform": p, "tags": data.get(p, [])} for p in platforms]
        except Exception:
            pass  # fall through to local DB

    # Local DB fallback
    db = _load_hashtag_db()
    cat = _best_category(title, description, db)
    cat_data = db.get(cat, db.get("general", {}))
    results = []
    for platform in platforms:
        db_key = "instagram" if "instagram" in platform else platform
        tags = cat_data.get(db_key, cat_data.get("tiktok", []))
        limit = PLATFORM_LIMITS.get(platform, {}).get("maxHashtags", 30)
        results.append({"platform": platform, "tags": tags[:limit] if limit else tags})
    return results


def extract_thumbnail(
    video_path: str,
    timestamp: float,
    overlay_text: Optional[str] = None,
    preview: bool = False,
) -> str:
    """Extract a video frame at timestamp. Returns path to output file.

    preview=True -> small JPEG for suggestions UI.
    preview=False -> full-resolution PNG, with optional drawtext overlay.
    """
    suffix = ".jpg" if preview else ".png"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    tmp.close()
    output_path = tmp.name

    if preview:
        cmd = [
            "ffmpeg", "-y", "-ss", str(timestamp), "-i", video_path,
            "-vframes", "1", "-vf", "scale=320:-1", "-q:v", "5",
            output_path,
        ]
    elif overlay_text:
        escaped = overlay_text.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:")
        drawtext = (
            f"drawtext=text='{escaped}':"
            f"fontsize=h/15:fontcolor=white:"
            f"shadowcolor=black:shadowx=2:shadowy=2:"
            f"x=(w-text_w)/2:y=h-th-40"
        )
        cmd = [
            "ffmpeg", "-y", "-ss", str(timestamp), "-i", video_path,
            "-vframes", "1", "-vf", drawtext, output_path,
        ]
    else:
        cmd = [
            "ffmpeg", "-y", "-ss", str(timestamp), "-i", video_path,
            "-vframes", "1", output_path,
        ]

    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        raise ValueError(result.stderr.decode(errors="replace"))
    return output_path


def get_thumbnail_suggestions(video_path: str, count: int = 4) -> list[dict]:
    """Extract frames at 0%, 25%, 50%, 75% of video duration.

    Returns [{"timestamp": float, "path": str}].
    Skips failed extractions silently.
    """
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", video_path],
        capture_output=True, text=True,
    )
    duration = float(probe.stdout.strip() or "0")
    if duration <= 0:
        return []

    timestamps = [duration * i / max(count - 1, 1) for i in range(count)]
    results = []
    for ts in timestamps:
        try:
            path = extract_thumbnail(video_path, ts, preview=True)
            results.append({"timestamp": round(ts, 2), "path": path})
        except ValueError:
            pass
    return results


def get_platform_limits() -> dict:
    return PLATFORM_LIMITS
