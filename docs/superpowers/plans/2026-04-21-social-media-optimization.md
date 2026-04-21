# Social Media Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated Social tab to ClipForge with metadata authoring, AI hashtag suggestions (Claude API + local fallback), feed-mode preview for all major platforms, thumbnail picker, real-time platform validation, and multi-platform batch export.

**Architecture:** Export-first (no direct platform API uploads). A new `SocialPanel` component owns a two-column layout: left panel has collapsible sections for metadata, hashtags, thumbnail, validation, and multi-export; right panel shows a live CSS feed mock with the actual video proxy embedded. Backend adds a `/api/social` router with four endpoints that call a new `social_service.py`. Multi-export delegates job creation to the existing `start_export` route handler.

**Tech Stack:** React + Zustand (frontend), FastAPI + aiosqlite (backend), ffmpeg (thumbnail extraction), Anthropic Python SDK (hashtag generation, optional), pytest (backend tests).

---

## File Map

### New files
| Path | Responsibility |
|---|---|
| `frontend/src/stores/socialStore.ts` | Zustand store — metadata, hashtags, multi-export jobs |
| `frontend/src/components/social/MetadataPanel.tsx` | Title, description, platform chip toggles |
| `frontend/src/components/social/ValidationWarnings.tsx` | Client-side platform limit checks |
| `frontend/src/components/social/HashtagPanel.tsx` | Keyword input → API call → per-platform tag display + copy |
| `frontend/src/components/social/ThumbnailPicker.tsx` | Video scrubber, canvas frame capture, PNG export |
| `frontend/src/components/social/FeedPreview.tsx` | Platform switcher + CSS mock UIs with embedded video |
| `frontend/src/components/social/MultiExportPanel.tsx` | Per-platform export queue, status polling |
| `frontend/src/components/social/SocialPanel.tsx` | Root two-column layout, composes all panels |
| `backend/data/hashtag_db.json` | Curated hashtag sets by category (~20 categories) |
| `backend/services/social_service.py` | generate_hashtags, extract_thumbnail, get_thumbnail_suggestions |
| `backend/routers/social.py` | /api/social/* endpoints |
| `tests/test_social_service.py` | Unit tests for social_service functions |
| `tests/test_social_router.py` | Integration tests for /api/social endpoints |

### Modified files
| Path | Change |
|---|---|
| `frontend/src/types/index.ts` | Add `SocialPlatform`, `SocialMetadata`, `HashtagResult`, `MultiExportJob`; add `"social"` to `TabMode` |
| `frontend/src/api/client.ts` | Add `socialHashtags`, `socialThumbnail`, `socialThumbnailSuggest`, `socialMultiExport`, `socialValidate` |
| `frontend/src/components/layout/TabBar.tsx` | Add Social tab between Export and Help |
| `frontend/src/App.tsx` | Import `SocialPanel`, render for `activeTab === "social"` |
| `backend/main.py` | Register `social_router` |

---

## Task 1: Types + TabMode

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add new types and extend TabMode**

Open `frontend/src/types/index.ts`. Add after the existing `AIJob` interface at the end of the file:

```typescript
export type SocialPlatform = "tiktok" | "instagram_reel" | "instagram_post" | "youtube";

export interface SocialMetadata {
  title: string;
  description: string;
  platforms: SocialPlatform[];
  thumbnailTime: number | null;
}

export interface HashtagResult {
  platform: string;
  tags: string[];
}

export interface MultiExportJob {
  platform: SocialPlatform;
  jobId: string;
  status: "pending" | "running" | "done" | "error";
  outputPath: string | null;
  error: string | null;
}
```

Change the existing `TabMode` line from:
```typescript
export type TabMode = "edit" | "batch" | "export" | "ai" | "help";
```
to:
```typescript
export type TabMode = "edit" | "batch" | "export" | "ai" | "social" | "help";
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor/frontend"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor"
git add frontend/src/types/index.ts
git commit -m "feat(social): add SocialPlatform, SocialMetadata, HashtagResult, MultiExportJob types"
```

---

## Task 2: socialStore

**Files:**
- Create: `frontend/src/stores/socialStore.ts`

- [ ] **Step 1: Create the store**

```typescript
import { create } from "zustand";
import type { HashtagResult, MultiExportJob, SocialMetadata, SocialPlatform } from "../types";

interface SocialState {
  metadata: SocialMetadata;
  hashtags: HashtagResult[];
  multiExportJobs: MultiExportJob[];
  setMetadata: (patch: Partial<SocialMetadata>) => void;
  setHashtags: (results: HashtagResult[]) => void;
  setMultiExportJobs: (jobs: MultiExportJob[] | ((prev: MultiExportJob[]) => MultiExportJob[])) => void;
  reset: () => void;
}

const DEFAULT_METADATA: SocialMetadata = {
  title: "",
  description: "",
  platforms: ["tiktok", "instagram_reel"] as SocialPlatform[],
  thumbnailTime: null,
};

export const useSocialStore = create<SocialState>((set) => ({
  metadata: DEFAULT_METADATA,
  hashtags: [],
  multiExportJobs: [],

  setMetadata: (patch) =>
    set((s) => ({ metadata: { ...s.metadata, ...patch } })),

  setHashtags: (results) => set({ hashtags: results }),

  setMultiExportJobs: (jobs) =>
    set((s) => ({
      multiExportJobs: typeof jobs === "function" ? jobs(s.multiExportJobs) : jobs,
    })),

  reset: () => set({ metadata: DEFAULT_METADATA, hashtags: [], multiExportJobs: [] }),
}));
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor/frontend"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor"
git add frontend/src/stores/socialStore.ts
git commit -m "feat(social): add socialStore with metadata, hashtags, multiExportJobs"
```

---

## Task 3: API client methods

**Files:**
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: Add social API functions**

Append to the end of `frontend/src/api/client.ts`:

```typescript
// Social
export const socialHashtags = (body: {
  title: string;
  description?: string;
  platforms: string[];
  api_key?: string;
}) => api.post("/social/hashtags", body);

export const socialThumbnail = (
  mediaId: string,
  timestamp: number,
  overlayText?: string
): string =>
  `http://localhost:8000/api/social/thumbnail/${mediaId}?timestamp=${timestamp}${overlayText ? `&overlay_text=${encodeURIComponent(overlayText)}` : ""}`;

export const socialThumbnailSuggest = (mediaId: string) =>
  api.get(`/social/thumbnail/${mediaId}/suggestions`);

export const socialMultiExport = (body: {
  project_id: string;
  platforms: string[];
}) => api.post("/social/multi-export", body);

export const socialValidate = () => api.get("/social/limits");
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor/frontend"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor"
git add frontend/src/api/client.ts
git commit -m "feat(social): add socialHashtags, socialThumbnail, socialMultiExport API helpers"
```

---

## Task 4: Hashtag database

**Files:**
- Create: `backend/data/hashtag_db.json`

- [ ] **Step 1: Create the database file**

```bash
mkdir -p "/Users/fighter/Documents/Projects Folder/VideoEditor/backend/data"
```

Create `backend/data/hashtag_db.json`:

```json
{
  "travel": {
    "tiktok": ["fyp","travel","traveltok","wanderlust","explore","adventure","travelvibes","worldtravel","travelgram","vacation","abroad","traveling","destination","nomad","backpacker","solotravel","travellife","traveladdict","roamtheplanet","beautifuldestinations","travelphoto","travelblogger","instatravel","travelmore","welltravelled","traveldeep","travelstoke","travelinspiration","aroundtheworld","globetrotter"],
    "instagram": ["travel","wanderlust","explore","adventure","travelgram","instatravel","vacation","travelblogger","travelphoto","traveladdict"]
  },
  "food": {
    "tiktok": ["fyp","food","foodtok","foodie","recipe","cooking","homecooking","yummy","delicious","foodlover","instafood","foodies","tasty","easyrecipe","mealprep","healthyfood","snack","dinner","lunch","breakfast","baking","chef","kitchentips","viral","trending","foodvideo","foodreview","streetfood","mukbang","asmrfood"],
    "instagram": ["food","foodie","recipe","instafood","foodlover","homecooking","yummy","delicious","foodphotography","healthyfood"]
  },
  "fitness": {
    "tiktok": ["fyp","fitness","workout","gym","fit","fitnessmotivation","exercise","health","training","fittok","weightloss","bodybuilding","cardio","gains","sweat","strong","motivation","personaltrainer","healthylifestyle","gymlife","workoutvideo","abs","transformation","homeworkout","fitlife","wellness","active","sport","run","lifting"],
    "instagram": ["fitness","workout","gym","fitnessmotivation","health","training","exercise","healthy","gains","motivation"]
  },
  "gaming": {
    "tiktok": ["fyp","gaming","gamer","gameplay","gamertok","videogames","twitch","streamer","gamingtiktok","pcgaming","consolegaming","rpg","fps","moba","esports","newgame","gamingsetup","gta","minecraft","fortnite","cod","valorant","apex","lol","pubg","gamepass","xbox","playstation","nintendo","viral"],
    "instagram": ["gaming","gamer","gameplay","videogames","esports","streamer","gamingsetup","pcgaming","twitch","gamerlife"]
  },
  "music": {
    "tiktok": ["fyp","music","musician","song","singer","band","guitar","piano","drums","producer","newmusic","originalsong","cover","acoustic","viral","trending","musician","hiphop","pop","rock","rnb","indie","edm","lofi","beats","studio","recording","musicvideo","playlist","concert"],
    "instagram": ["music","musician","song","newmusic","singer","guitar","producer","originalsong","musicvideo","livemusic"]
  },
  "fashion": {
    "tiktok": ["fyp","fashion","style","ootd","outfit","fashiontok","clothes","trending","aesthetic","streetwear","vintage","thrift","luxury","fashionista","model","lookbook","haul","stylist","fashioninspo","wiwt","outfitcheck","fashionblogger","streetstyle","viral","shopping","designer","capsulewardrobe","sustainable","minimalfashion","bold"],
    "instagram": ["fashion","style","ootd","outfit","fashionista","streetwear","vintage","lookbook","fashionblogger","sustainablefashion"]
  },
  "comedy": {
    "tiktok": ["fyp","funny","comedy","funnytiktok","humor","lol","meme","laughing","jokes","comedytok","viral","trending","prank","skit","relatable","foryou","trending","hilarious","comedyvideo","comicrelief","standup","comedians","joking","funnymemes","funnymomments","satire","parody","roast","banter","funnyvideo"],
    "instagram": ["funny","comedy","humor","meme","lol","relatable","viral","jokes","funnymemes","comedyvideos"]
  },
  "beauty": {
    "tiktok": ["fyp","beauty","makeup","skincare","beautytok","glam","tutorial","makeuptutorial","skincareRoutine","grwm","motd","skincaretips","beautyproducts","makeuplover","glowup","transformation","drugstore","luxury","beautyreview","cleanbeauty","naturalmakeup","smokyeye","lipliner","foundation","contour","highlight","blush","mascara","eyeshadow","skingoals"],
    "instagram": ["beauty","makeup","skincare","beautyblogger","makeuplover","glam","tutorial","skincareRoutine","grwm","glowup"]
  },
  "tech": {
    "tiktok": ["fyp","tech","technology","techtok","gadget","review","techreview","smartphone","laptop","coding","programmer","developer","ai","software","hardware","startup","innovation","futuretech","apple","android","windows","linux","cybersecurity","datascience","machinelearning","robotics","viral","trending","techbro","unboxing","comparison"],
    "instagram": ["tech","technology","gadget","techreview","coding","developer","innovation","startup","ai","unboxing"]
  },
  "education": {
    "tiktok": ["fyp","learnontiktok","educational","didyouknow","facts","learning","knowledge","studytok","school","college","tips","lifehacks","howto","tutorial","science","history","math","english","psychology","philosophy","mindblowing","viral","trending","tipsandtricks","studentlife","studywithme","productivity","study","brain","wisdom"],
    "instagram": ["education","learning","didyouknow","facts","knowledge","tips","tutorial","howto","studygram","learneveryday"]
  },
  "lifestyle": {
    "tiktok": ["fyp","lifestyle","dailyvlog","dayinmylife","vlog","routine","morningroutine","nightroutine","productivity","selfcare","wellness","mindfulness","healthylifestyle","aesthetic","clean","organize","minimalist","homor","homedecor","apartment","adultlife","adulting","viral","trending","slowliving","intentional","grwm","selflove","positivity","motivation"],
    "instagram": ["lifestyle","vlog","dayinmylife","selfcare","wellness","morningroutine","aesthetic","minimalist","productivity","selflove"]
  },
  "pets": {
    "tiktok": ["fyp","pets","dog","cat","dogsoftiktok","catsoftiktok","puppy","kitten","petsoftiktok","cuteanimals","funnypets","animals","petlover","doglover","catlover","animallovers","rescue","adopt","petcare","dogtraining","pawsome","dogmom","catmom","goldenretriever","husky","viral","trending","petvideos","fluffyanimals","furbaby"],
    "instagram": ["pets","dog","cat","puppy","kitten","dogsofinstagram","catsofinstagram","animals","petlover","adorable"]
  },
  "business": {
    "tiktok": ["fyp","business","entrepreneur","smallbusiness","startup","money","success","motivation","hustle","grind","marketing","socialmedia","branding","sales","ecommerce","dropshipping","investing","finance","sidehustle","businesstips","entrepreneurship","ceo","boss","leadership","growth","passive","income","productivityhacks","viral","trending","mindset"],
    "instagram": ["business","entrepreneur","smallbusiness","startup","marketing","success","motivation","hustle","branding","leadership"]
  },
  "sports": {
    "tiktok": ["fyp","sports","athlete","training","highlights","goals","sportsedits","football","soccer","basketball","tennis","swimming","running","cycling","boxing","mma","nfl","nba","mlb","esports","viral","trending","sportstok","workout","gains","competition","teamwork","championship","victory","sports"],
    "instagram": ["sports","athlete","training","fitness","goals","football","basketball","tennis","running","champion"]
  },
  "art": {
    "tiktok": ["fyp","art","artist","drawing","painting","digitalart","artprocess","artwork","creative","illustration","sketch","procreate","design","graphicdesign","arttok","satisfying","timelapse","oc","originalart","fanart","animation","3dart","handmade","craft","diy","colorful","viral","trending","arttutorial","painting","creative"],
    "instagram": ["art","artist","drawing","painting","digitalart","illustration","artwork","creative","sketch","procreate"]
  },
  "diy": {
    "tiktok": ["fyp","diy","crafts","handmade","create","tutorial","howto","upcycle","repurpose","makeover","renovation","home","decor","crafting","cricut","sewing","knitting","woodworking","painting","satisfying","viral","trending","diytok","makersoftiktok","crafttok","homemade","creative","build","fix","restore"],
    "instagram": ["diy","crafts","handmade","tutorial","upcycle","makeover","homedecor","crafting","creative","homemade"]
  },
  "nature": {
    "tiktok": ["fyp","nature","outdoors","wildlife","hiking","camping","forest","mountains","ocean","sunset","sunrise","photography","naturephotography","earthday","environment","conservation","sustainable","green","animals","birds","flowers","trees","landscape","adventure","explore","viral","trending","naturelover","wilderness","serene","breathtaking"],
    "instagram": ["nature","outdoors","wildlife","hiking","landscape","photography","naturephotography","sunset","mountains","earthday"]
  },
  "motivation": {
    "tiktok": ["fyp","motivation","inspiration","mindset","success","goalsetting","selfdevelopment","personalgrowth","positivity","dailymotivation","quotes","affirmations","selfimprovement","mentalhealth","wellbeing","confidence","focus","discipline","habits","consistency","grind","hustle","believe","growth","viral","trending","motivationdaily","growthmindset","lifelessons","powerful"],
    "instagram": ["motivation","inspiration","mindset","success","positivity","selfdevelopment","quotes","affirmations","mentalhealth","growthmindset"]
  },
  "vlog": {
    "tiktok": ["fyp","vlog","dailyvlog","dayinmylife","storytime","followmearound","routine","life","reallife","lifestyle","candid","authentic","behindthescenes","viral","trending","videoblog","weekly","monthly","dayinthelife","mylife","vlogger","contentcreator","creator","documenting","moments","realness","grwm","nightout","weekend","adventure"],
    "instagram": ["vlog","dailyvlog","dayinmylife","storytime","lifestyle","behindthescenes","contentcreator","authentic","mylife","creator"]
  },
  "general": {
    "tiktok": ["fyp","foryou","foryoupage","viral","trending","tiktok","explore","blowup","content","creator","video","watch","share","like","follow","fun","cool","amazing","insane","satisfying","awesome","incredible","mindblowing","mustsee","cantmiss","trending2024","viral2024","newvideo","fresh","popular"],
    "instagram": ["reels","explore","instareels","instagood","instagram","content","creator","viral","trending","popular"]
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor"
git add backend/data/hashtag_db.json
git commit -m "feat(social): add curated hashtag database (20 categories)"
```

---

## Task 5: social_service.py + tests

**Files:**
- Create: `backend/services/social_service.py`
- Create: `tests/test_social_service.py`

- [ ] **Step 1: Write failing tests**

Create `tests/test_social_service.py`:

```python
"""Tests for social_service."""
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from backend.services.social_service import (
    _best_category,
    _load_hashtag_db,
    generate_hashtags,
    get_platform_limits,
    get_thumbnail_suggestions,
)


def test_get_platform_limits_returns_all_platforms():
    limits = get_platform_limits()
    assert set(limits.keys()) == {"tiktok", "instagram_reel", "instagram_post", "youtube"}
    for platform, data in limits.items():
        assert "maxFileSizeMB" in data
        assert "maxDurationSeconds" in data
        assert "recommendedWidth" in data
        assert "recommendedHeight" in data


def test_load_hashtag_db_returns_dict_with_categories():
    db = _load_hashtag_db()
    assert isinstance(db, dict)
    assert "travel" in db
    assert "tiktok" in db["travel"]
    assert "instagram" in db["travel"]
    assert len(db["travel"]["tiktok"]) == 30


def test_best_category_matches_keyword():
    db = _load_hashtag_db()
    assert _best_category("travel vlog to Paris", "", db) == "travel"
    assert _best_category("gym workout tips", "", db) == "fitness"
    assert _best_category("funny cat video", "", db) in ("pets", "comedy")


def test_generate_hashtags_no_api_key_uses_local_db():
    results = generate_hashtags(
        title="travel vlog",
        description="exploring Europe",
        platforms=["tiktok", "instagram_reel"],
        api_key=None,
    )
    assert len(results) == 2
    platforms_returned = {r["platform"] for r in results}
    assert platforms_returned == {"tiktok", "instagram_reel"}
    for result in results:
        assert isinstance(result["tags"], list)
        assert len(result["tags"]) > 0
        for tag in result["tags"]:
            assert not tag.startswith("#")  # no # prefix in stored tags


def test_generate_hashtags_respects_max_hashtags_per_platform():
    results = generate_hashtags(
        title="travel vlog",
        description="",
        platforms=["tiktok"],
        api_key=None,
    )
    tiktok_result = next(r for r in results if r["platform"] == "tiktok")
    assert len(tiktok_result["tags"]) <= 30


def test_generate_hashtags_instagram_post_maps_to_instagram_db():
    results = generate_hashtags(
        title="food recipe",
        description="",
        platforms=["instagram_post"],
        api_key=None,
    )
    assert len(results) == 1
    assert results[0]["platform"] == "instagram_post"
    assert len(results[0]["tags"]) > 0


def test_generate_hashtags_api_failure_falls_back_to_local():
    with patch("backend.services.social_service.os.environ.get", return_value=None):
        results = generate_hashtags(
            title="fitness workout",
            description="",
            platforms=["tiktok"],
            api_key=None,
        )
    assert len(results) == 1
    assert len(results[0]["tags"]) > 0
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor"
source .venv/bin/activate
pytest tests/test_social_service.py -v 2>&1 | head -30
```

Expected: `ImportError: cannot import name 'generate_hashtags' from 'backend.services.social_service'` (module does not exist yet).

- [ ] **Step 3: Create social_service.py**

Create `backend/services/social_service.py`:

```python
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


def _load_hashtag_db() -> dict:
    global _hashtag_db
    if _hashtag_db is None:
        with open(_HASHTAG_DB_PATH, encoding="utf-8") as f:
            _hashtag_db = json.load(f)
    return _hashtag_db


def _best_category(title: str, description: str, db: dict) -> str:
    """Find best matching category by keyword overlap with category name."""
    text = f"{title} {description}".lower()
    best_cat = "general"
    best_score = 0
    for cat in db:
        score = sum(1 for word in cat.replace("_", " ").split() if word in text)
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

    preview=True → small JPEG for suggestions UI.
    preview=False → full-resolution PNG, with optional drawtext overlay.
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor"
source .venv/bin/activate
pytest tests/test_social_service.py -v
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/services/social_service.py tests/test_social_service.py
git commit -m "feat(social): add social_service with hashtag generation and thumbnail extraction"
```

---

## Task 6: Social router + register + tests

**Files:**
- Create: `backend/routers/social.py`
- Create: `tests/test_social_router.py`
- Modify: `backend/main.py`

- [ ] **Step 1: Write failing router tests**

Create `tests/test_social_router.py`:

```python
"""Integration tests for /api/social endpoints."""
import pytest
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_hashtags_missing_title_returns_422():
    resp = client.post("/api/social/hashtags", json={"title": "", "platforms": ["tiktok"]})
    assert resp.status_code == 422


def test_hashtags_missing_platforms_returns_422():
    resp = client.post("/api/social/hashtags", json={"title": "travel vlog", "platforms": []})
    assert resp.status_code == 422


def test_hashtags_local_fallback_returns_results():
    resp = client.post("/api/social/hashtags", json={
        "title": "travel vlog adventure",
        "description": "exploring Asia",
        "platforms": ["tiktok", "instagram_reel"],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "results" in data
    assert len(data["results"]) == 2
    for result in data["results"]:
        assert "platform" in result
        assert "tags" in result
        assert len(result["tags"]) > 0


def test_limits_returns_all_platforms():
    resp = client.get("/api/social/limits")
    assert resp.status_code == 200
    data = resp.json()
    assert "tiktok" in data
    assert "instagram_reel" in data
    assert "instagram_post" in data
    assert "youtube" in data


def test_thumbnail_missing_media_returns_404():
    resp = client.get("/api/social/thumbnail/99999?timestamp=1.0")
    assert resp.status_code == 404


def test_multi_export_missing_platforms_returns_422():
    resp = client.post("/api/social/multi-export", json={
        "project_id": "nonexistent", "platforms": []
    })
    assert resp.status_code == 422


def test_multi_export_unknown_platform_returns_422():
    resp = client.post("/api/social/multi-export", json={
        "project_id": "test", "platforms": ["snapchat"]
    })
    assert resp.status_code == 422
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor"
source .venv/bin/activate
pytest tests/test_social_router.py -v 2>&1 | head -20
```

Expected: failures because `/api/social/*` routes don't exist yet.

- [ ] **Step 3: Create social router**

Create `backend/routers/social.py`:

```python
"""Social media optimization router."""
from __future__ import annotations

import asyncio
import base64
from functools import partial
from typing import Optional

import aiosqlite
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.database import get_db
from backend.services.social_service import (
    extract_thumbnail,
    generate_hashtags,
    get_platform_limits,
    get_thumbnail_suggestions,
)

router = APIRouter(prefix="/api/social", tags=["social"])


class HashtagRequest(BaseModel):
    title: str
    description: str = ""
    platforms: list[str]
    api_key: Optional[str] = None


class MultiExportRequest(BaseModel):
    project_id: str
    platforms: list[str]


async def _fetch_media_path(media_id: int) -> str:
    db: aiosqlite.Connection = await get_db()
    try:
        async with db.execute(
            "SELECT stored_path FROM media_files WHERE id = ?", (media_id,)
        ) as cur:
            row = await cur.fetchone()
    finally:
        await db.close()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Media {media_id} not found")
    return row["stored_path"]


@router.post("/hashtags")
async def hashtags_endpoint(body: HashtagRequest) -> dict:
    """Generate hashtag sets for requested platforms."""
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="title is required")
    if not body.platforms:
        raise HTTPException(status_code=422, detail="at least one platform is required")

    loop = asyncio.get_event_loop()
    try:
        results = await loop.run_in_executor(
            None,
            partial(generate_hashtags, body.title, body.description, body.platforms, body.api_key),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"results": results}


@router.get("/thumbnail/{media_id}")
async def thumbnail_endpoint(
    media_id: int,
    timestamp: float = Query(...),
    overlay_text: Optional[str] = Query(None),
    preview: bool = Query(False),
) -> FileResponse:
    """Extract a thumbnail frame. Returns PNG (full-res) or JPEG (preview)."""
    video_path = await _fetch_media_path(media_id)
    loop = asyncio.get_event_loop()
    try:
        output_path = await loop.run_in_executor(
            None,
            partial(extract_thumbnail, video_path, timestamp, overlay_text, preview),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    media_type = "image/jpeg" if preview else "image/png"
    ext = "jpg" if preview else "png"
    filename = f"thumbnail_{int(timestamp)}s.{ext}"
    return FileResponse(output_path, media_type=media_type, filename=filename)


@router.get("/thumbnail/{media_id}/suggestions")
async def thumbnail_suggestions_endpoint(media_id: int) -> dict:
    """Return 4 suggested thumbnail frames as base64 data URIs."""
    video_path = await _fetch_media_path(media_id)
    loop = asyncio.get_event_loop()
    try:
        suggestions = await loop.run_in_executor(
            None, partial(get_thumbnail_suggestions, video_path),
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    result = []
    for s in suggestions:
        with open(s["path"], "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        result.append({"timestamp": s["timestamp"], "url": f"data:image/jpeg;base64,{b64}"})
    return {"suggestions": result}


@router.post("/multi-export")
async def multi_export_endpoint(body: MultiExportRequest) -> dict:
    """Start a sequential export job for each requested platform.

    Delegates to the existing export route handler — each platform uses
    its SOCIAL_PRESET (width, height, fps, codec, bitrate) from export_service.py.
    """
    from backend.services.export_service import SOCIAL_PRESETS
    from backend.routers.export import start_export
    from backend.models.job import ExportRequest

    if not body.platforms:
        raise HTTPException(status_code=422, detail="at least one platform required")

    for platform in body.platforms:
        if platform not in SOCIAL_PRESETS:
            raise HTTPException(status_code=422, detail=f"Unknown platform: {platform}")

    jobs = []
    for platform in body.platforms:
        request = ExportRequest(
            project_id=body.project_id,
            preset=platform,
            container="mp4",
            video_codec="libx264",
            audio_codec="aac",
            fps=30,
            upload_to_drive=False,
        )
        try:
            job = await start_export(request)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        jobs.append({"platform": platform, "job_id": job.id})

    return {"jobs": jobs}


@router.get("/limits")
async def limits_endpoint() -> dict:
    """Return platform limits dict for client-side validation."""
    return get_platform_limits()
```

- [ ] **Step 4: Register router in main.py**

Add after the existing `from backend.routers.ai import router as ai_router` line in `backend/main.py`:

```python
from backend.routers.social import router as social_router
```

Add after `app.include_router(ai_router)`:

```python
app.include_router(social_router)
```

- [ ] **Step 5: Run all router tests**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor"
source .venv/bin/activate
pytest tests/test_social_router.py -v
```

Expected: all 7 tests pass.

- [ ] **Step 6: Run full test suite to check for regressions**

```bash
pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/routers/social.py backend/main.py tests/test_social_router.py
git commit -m "feat(social): add /api/social router with hashtags, thumbnail, multi-export, limits endpoints"
```

---

## Task 7: MetadataPanel

**Files:**
- Create: `frontend/src/components/social/MetadataPanel.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { useSocialStore } from "../../stores/socialStore";
import type { SocialPlatform } from "../../types";

const PLATFORM_CHIPS: { id: SocialPlatform; label: string; color: string }[] = [
  { id: "tiktok",         label: "TikTok",   color: "#fe2c55" },
  { id: "instagram_reel", label: "IG Reel",  color: "#e1306c" },
  { id: "instagram_post", label: "IG Post",  color: "#e1306c" },
  { id: "youtube",        label: "YouTube",  color: "#ff0000" },
];

export function MetadataPanel() {
  const { metadata, setMetadata } = useSocialStore();

  const togglePlatform = (id: SocialPlatform) => {
    const platforms = metadata.platforms.includes(id)
      ? metadata.platforms.filter((p) => p !== id)
      : [...metadata.platforms, id];
    setMetadata({ platforms });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "0 0 3px" }}>Title</p>
        <input
          value={metadata.title}
          onChange={(e) => setMetadata({ title: e.target.value })}
          placeholder="Video title…"
          style={{ width: "100%", padding: "5px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, boxSizing: "border-box" }}
        />
      </div>
      <div>
        <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "0 0 3px" }}>Caption / Description</p>
        <textarea
          value={metadata.description}
          onChange={(e) => setMetadata({ description: e.target.value })}
          placeholder="Caption for Instagram, description for YouTube…"
          rows={3}
          style={{ width: "100%", padding: "5px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
        />
      </div>
      <div>
        <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "0 0 5px" }}>Platforms</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PLATFORM_CHIPS.map((p) => {
            const active = metadata.platforms.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => togglePlatform(p.id)}
                style={{
                  padding: "3px 10px", borderRadius: 12, fontSize: 11, cursor: "pointer",
                  border: `1px solid ${active ? p.color : "var(--border)"}`,
                  background: active ? `${p.color}22` : "transparent",
                  color: active ? p.color : "var(--text-secondary)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor/frontend"
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor"
git add frontend/src/components/social/MetadataPanel.tsx
git commit -m "feat(social): add MetadataPanel with title, description, platform chip toggles"
```

---

## Task 8: ValidationWarnings

**Files:**
- Create: `frontend/src/components/social/ValidationWarnings.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { useSocialStore } from "../../stores/socialStore";
import { useTimelineStore } from "../../stores/timelineStore";
import type { SocialPlatform } from "../../types";

const LIMITS: Record<SocialPlatform, { label: string; maxFileSizeMB: number; maxDurationSeconds: number }> = {
  tiktok:         { label: "TikTok",    maxFileSizeMB: 287,    maxDurationSeconds: 600   },
  instagram_reel: { label: "IG Reel",   maxFileSizeMB: 100,    maxDurationSeconds: 90    },
  instagram_post: { label: "IG Post",   maxFileSizeMB: 100,    maxDurationSeconds: 60    },
  youtube:        { label: "YouTube",   maxFileSizeMB: 262144, maxDurationSeconds: 43200 },
};

function estimateSizeMB(durationSeconds: number, bitrateKbps = 8000): number {
  return (durationSeconds * bitrateKbps) / 8 / 1024;
}

export function ValidationWarnings() {
  const { metadata } = useSocialStore();
  const { clips } = useTimelineStore();

  const totalDuration = clips.reduce((sum, c) => {
    const raw = c.trim_end != null
      ? c.trim_end - c.trim_start
      : (c.duration ?? 0) - c.trim_start;
    return sum + raw / (c.speed || 1);
  }, 0);

  const sizeMB = estimateSizeMB(totalDuration);

  if (metadata.platforms.length === 0) return null;

  const checks = metadata.platforms.map((platform) => {
    const lim = LIMITS[platform];
    const violations: string[] = [];
    const fixes: string[] = [];

    if (totalDuration > lim.maxDurationSeconds) {
      violations.push(`${Math.round(totalDuration)}s exceeds ${lim.maxDurationSeconds}s limit`);
      fixes.push("Trim clips, or use Auto Cut in AI Tools to remove silence");
    }
    if (sizeMB > lim.maxFileSizeMB) {
      violations.push(`~${Math.round(sizeMB)} MB exceeds ${lim.maxFileSizeMB} MB limit`);
      fixes.push("Lower bitrate in Export settings");
    }

    return { label: lim.label, violations, fixes, ok: violations.length === 0 };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {checks.map(({ label, violations, fixes, ok }) => (
        <div key={label}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: ok ? "#22c55e" : "#f59e0b", fontSize: 13 }}>{ok ? "✓" : "⚠"}</span>
            <span style={{ fontSize: 11, color: ok ? "#22c55e" : "#f59e0b", fontWeight: ok ? 400 : 600 }}>
              {label} — {ok ? "looks good" : violations[0]}
            </span>
          </div>
          {fixes.length > 0 && (
            <div style={{ marginLeft: 20, marginTop: 3, padding: "4px 8px", background: "#1a1200", borderRadius: 4, borderLeft: "2px solid #f59e0b" }}>
              <p style={{ fontSize: 10, color: "#d97706", margin: 0 }}>Fix: {fixes[0]}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor/frontend"
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor"
git add frontend/src/components/social/ValidationWarnings.tsx
git commit -m "feat(social): add ValidationWarnings with client-side platform limit checks"
```

---

## Task 9: HashtagPanel

**Files:**
- Create: `frontend/src/components/social/HashtagPanel.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { useState } from "react";
import { useSocialStore } from "../../stores/socialStore";
import { socialHashtags } from "../../api/client";
import type { HashtagResult } from "../../types";

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: "#60a5fa",
  instagram_reel: "#f472b6",
  instagram_post: "#f472b6",
  youtube: "#f87171",
};

export function HashtagPanel() {
  const { metadata, hashtags, setHashtags } = useSocialStore();
  const [keyword, setKeyword] = useState(metadata.title);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!keyword.trim() || metadata.platforms.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await socialHashtags({
        title: keyword,
        description: metadata.description,
        platforms: metadata.platforms,
        api_key: apiKey || undefined,
      });
      setHashtags((res.data as { results: HashtagResult[] }).results);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const copy = (tags: string[]) => {
    navigator.clipboard.writeText(tags.map((t) => `#${t}`).join(" "));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Keyword or topic…"
          style={{ flex: 1, padding: "5px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12 }}
        />
        <button
          onClick={generate}
          disabled={loading || !keyword.trim() || metadata.platforms.length === 0}
          style={{
            padding: "5px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
            background: loading || !keyword.trim() || metadata.platforms.length === 0 ? "var(--bg-tertiary)" : "var(--accent)",
            border: "none", color: loading ? "var(--text-secondary)" : "#fff",
            cursor: loading || !keyword.trim() ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "…" : "✨ Generate"}
        </button>
      </div>

      <div>
        <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "0 0 3px" }}>
          Claude API key <span style={{ color: "#555" }}>(optional — uses local database if empty)</span>
        </p>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-…"
          style={{ width: "100%", padding: "4px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 11, boxSizing: "border-box" }}
        />
      </div>

      {metadata.platforms.length === 0 && (
        <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>Select platforms in Metadata first.</p>
      )}
      {error && <p style={{ fontSize: 11, color: "#ef4444", margin: 0 }}>{error}</p>}

      {hashtags.map(({ platform, tags }) => (
        <div key={platform}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: PLATFORM_COLORS[platform] ?? "var(--accent)" }}>
              {platform.replace(/_/g, " ")} ({tags.length})
            </span>
            <button
              onClick={() => copy(tags)}
              style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-secondary)", cursor: "pointer" }}
            >
              📋 Copy
            </button>
          </div>
          <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: 0, lineHeight: 1.7 }}>
            {tags.slice(0, 15).map((t) => `#${t}`).join(" ")}
            {tags.length > 15 && ` … +${tags.length - 15} more`}
          </p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor/frontend"
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor"
git add frontend/src/components/social/HashtagPanel.tsx
git commit -m "feat(social): add HashtagPanel with Claude API + local fallback generation"
```

---

## Task 10: ThumbnailPicker

**Files:**
- Create: `frontend/src/components/social/ThumbnailPicker.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { useRef, useState, useEffect } from "react";
import { useSocialStore } from "../../stores/socialStore";
import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { getMediaProxyUrl, socialThumbnailSuggest } from "../../api/client";

interface Suggestion { timestamp: number; url: string; }

export function ThumbnailPicker() {
  const { metadata, setMetadata } = useSocialStore();
  const { selectedClipId, clips } = useTimelineStore();
  const { mediaFiles } = useProjectStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayText, setOverlayText] = useState(metadata.title);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const clip = clips.find((c) => c.id === selectedClipId) ?? null;
  const media = clip ? mediaFiles.find((f) => f.id === clip.media_id) ?? null : null;

  useEffect(() => {
    if (!media?.id || clip?.type !== "video") return;
    socialThumbnailSuggest(String(media.id))
      .then((res) => setSuggestions((res.data as { suggestions: Suggestion[] }).suggestions))
      .catch(() => {});
  }, [media?.id, clip?.type]);

  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);
    if (showOverlay && overlayText) {
      const fontSize = Math.round(canvas.width / 22);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, canvas.height - fontSize * 3, canvas.width, fontSize * 3);
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.textAlign = "center";
      ctx.fillText(overlayText, canvas.width / 2, canvas.height - fontSize * 0.8);
    }
  };

  const seekTo = (t: number) => {
    setMetadata({ thumbnailTime: t });
    if (videoRef.current) videoRef.current.currentTime = t;
  };

  if (!clip || !media || clip.type !== "video") {
    return <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>Select a video clip in the Edit tab first.</p>;
  }

  const proxyUrl = getMediaProxyUrl(media.id);
  const duration = media.duration_seconds ?? 100;

  const exportUrl = metadata.thumbnailTime != null
    ? `http://localhost:8000/api/social/thumbnail/${media.id}?timestamp=${metadata.thumbnailTime}${showOverlay && overlayText ? `&overlay_text=${encodeURIComponent(overlayText)}` : ""}`
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <video ref={videoRef} src={proxyUrl} style={{ display: "none" }} onSeeked={captureFrame} />

      {/* Canvas preview */}
      <div style={{ width: "100%", aspectRatio: "16/9", background: "#000", borderRadius: 6, overflow: "hidden", position: "relative" }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        {metadata.thumbnailTime == null && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: 11 }}>
            Scrub below to pick a frame
          </div>
        )}
      </div>

      {/* Scrubber */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="range" min={0} max={duration} step={0.1}
          value={metadata.thumbnailTime ?? 0}
          onChange={(e) => seekTo(Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--accent)" }}
        />
        <span style={{ fontSize: 10, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
          {(metadata.thumbnailTime ?? 0).toFixed(1)}s
        </span>
      </div>

      {/* Auto-suggested frames */}
      {suggestions.length > 0 && (
        <div>
          <p style={{ fontSize: 10, color: "var(--text-secondary)", margin: "0 0 4px" }}>Auto-suggested frames</p>
          <div style={{ display: "flex", gap: 6 }}>
            {suggestions.map(({ timestamp, url }) => (
              <div
                key={timestamp}
                onClick={() => seekTo(timestamp)}
                style={{
                  flex: 1, aspectRatio: "16/9", borderRadius: 4, cursor: "pointer",
                  background: `url(${url}) center/cover no-repeat`,
                  border: metadata.thumbnailTime === timestamp ? "2px solid var(--accent)" : "1px solid var(--border)",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Overlay toggle */}
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}>
        <input
          type="checkbox" checked={showOverlay}
          onChange={(e) => { setShowOverlay(e.target.checked); setTimeout(captureFrame, 0); }}
          style={{ accentColor: "var(--accent)" }}
        />
        Show title overlay
      </label>
      {showOverlay && (
        <input
          value={overlayText}
          onChange={(e) => { setOverlayText(e.target.value); captureFrame(); }}
          placeholder="Overlay text…"
          style={{ padding: "5px 8px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--text-primary)", fontSize: 12 }}
        />
      )}

      {/* Export */}
      <a
        href={exportUrl ?? "#"}
        download={`thumbnail_${Math.round(metadata.thumbnailTime ?? 0)}s.png`}
        onClick={(e) => { if (!exportUrl) e.preventDefault(); }}
        style={{
          display: "block", textAlign: "center", padding: "6px 0", borderRadius: 4, fontSize: 11, fontWeight: 600,
          background: exportUrl ? "var(--accent)" : "var(--bg-tertiary)",
          color: exportUrl ? "#fff" : "var(--text-secondary)",
          textDecoration: "none", cursor: exportUrl ? "pointer" : "not-allowed",
        }}
      >
        📥 Export PNG
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor/frontend"
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor"
git add frontend/src/components/social/ThumbnailPicker.tsx
git commit -m "feat(social): add ThumbnailPicker with canvas frame capture and server-side PNG export"
```

---

## Task 11: FeedPreview

**Files:**
- Create: `frontend/src/components/social/FeedPreview.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { useState } from "react";
import { useSocialStore } from "../../stores/socialStore";
import { useTimelineStore } from "../../stores/timelineStore";
import { useProjectStore } from "../../stores/projectStore";
import { getMediaProxyUrl } from "../../api/client";
import type { SocialPlatform } from "../../types";

const TABS: { id: SocialPlatform; label: string }[] = [
  { id: "tiktok",         label: "TikTok"   },
  { id: "instagram_reel", label: "IG Reel"  },
  { id: "instagram_post", label: "IG Post"  },
  { id: "youtube",        label: "YouTube"  },
];

function VideoOrPlaceholder({ src, style }: { src: string | null; style: React.CSSProperties }) {
  if (!src) {
    return (
      <div style={{ ...style, background: "#111", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: 10 }}>
        Select a clip
      </div>
    );
  }
  return <video src={src} style={style} controls muted loop playsInline />;
}

function TikTokMock({ src, title, caption }: { src: string | null; title: string; caption: string }) {
  return (
    <div style={{ width: 190, background: "#000", borderRadius: 14, overflow: "hidden", border: "1px solid #333", flexShrink: 0 }}>
      <div style={{ position: "relative", aspectRatio: "9/16" }}>
        <VideoOrPlaceholder src={src} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 8px 8px", background: "linear-gradient(transparent, rgba(0,0,0,0.8))" }}>
          <p style={{ color: "#fff", fontSize: 9, fontWeight: 700, margin: "0 0 2px" }}>@username</p>
          <p style={{ color: "#eee", fontSize: 8, margin: "0 0 2px" }}>{title || "Video title"}</p>
          <p style={{ color: "#aaa", fontSize: 7, margin: 0 }}>{(caption || "Caption").slice(0, 40)}</p>
        </div>
        <div style={{ position: "absolute", right: 6, bottom: 50, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
          {["♥", "💬", "↗"].map((icon) => <span key={icon} style={{ color: "#fff", fontSize: 16 }}>{icon}</span>)}
        </div>
      </div>
    </div>
  );
}

function IGReelMock({ src, caption }: { src: string | null; caption: string }) {
  return (
    <div style={{ width: 190, background: "#000", borderRadius: 14, overflow: "hidden", border: "1px solid #333", flexShrink: 0 }}>
      <div style={{ position: "relative", aspectRatio: "9/16" }}>
        <VideoOrPlaceholder src={src} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "6px 8px", display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#444", border: "1px solid #fff", flexShrink: 0 }} />
          <span style={{ color: "#fff", fontSize: 9, fontWeight: 600 }}>username</span>
          <span style={{ color: "#fff", fontSize: 9, marginLeft: "auto" }}>···</span>
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 8px 8px", background: "linear-gradient(transparent, rgba(0,0,0,0.8))" }}>
          <p style={{ color: "#eee", fontSize: 8, margin: "0 0 2px", fontWeight: 600 }}>username</p>
          <p style={{ color: "#aaa", fontSize: 7, margin: 0 }}>{(caption || "Caption").slice(0, 50)}</p>
        </div>
        <div style={{ position: "absolute", right: 6, bottom: 50, display: "flex", flexDirection: "column", gap: 10 }}>
          {["♥", "💬", "➤"].map((icon) => <span key={icon} style={{ color: "#fff", fontSize: 16 }}>{icon}</span>)}
        </div>
      </div>
    </div>
  );
}

function IGPostMock({ src, caption }: { src: string | null; caption: string }) {
  return (
    <div style={{ width: 210, background: "#000", borderRadius: 8, overflow: "hidden", border: "1px solid #333", flexShrink: 0 }}>
      <div style={{ padding: "6px 8px", display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#444", flexShrink: 0 }} />
        <span style={{ color: "#fff", fontSize: 9, fontWeight: 600 }}>username</span>
        <span style={{ color: "#fff", fontSize: 9, marginLeft: "auto" }}>···</span>
      </div>
      <div style={{ aspectRatio: "1/1" }}>
        <VideoOrPlaceholder src={src} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
      <div style={{ padding: "8px" }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 5 }}>
          {["♥", "💬", "➤"].map((icon) => <span key={icon} style={{ color: "#fff", fontSize: 14 }}>{icon}</span>)}
        </div>
        <p style={{ color: "#fff", fontSize: 8, margin: 0, lineHeight: 1.5 }}>
          <strong>username</strong> {(caption || "Caption").slice(0, 70)}
        </p>
      </div>
    </div>
  );
}

function YouTubeMock({ src, title }: { src: string | null; title: string }) {
  return (
    <div style={{ width: 240, background: "#0f0f0f", borderRadius: 8, overflow: "hidden", border: "1px solid #333", flexShrink: 0 }}>
      <div style={{ aspectRatio: "16/9", position: "relative" }}>
        <VideoOrPlaceholder src={src} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <div style={{ position: "absolute", bottom: 4, right: 4, background: "rgba(0,0,0,0.85)", color: "#fff", fontSize: 8, padding: "2px 4px", borderRadius: 2 }}>
          3:42
        </div>
      </div>
      <div style={{ padding: "8px", display: "flex", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#444", flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ color: "#fff", fontSize: 10, fontWeight: 600, margin: "0 0 3px", lineHeight: 1.3 }}>{(title || "Video title").slice(0, 55)}</p>
          <p style={{ color: "#aaa", fontSize: 8, margin: 0 }}>Channel · 1.2K views · 2h ago</p>
        </div>
      </div>
    </div>
  );
}

export function FeedPreview() {
  const { metadata } = useSocialStore();
  const { selectedClipId, clips } = useTimelineStore();
  const { mediaFiles } = useProjectStore();
  const [active, setActive] = useState<SocialPlatform>("tiktok");

  const clip  = clips.find((c) => c.id === selectedClipId) ?? null;
  const media = clip ? mediaFiles.find((f) => f.id === clip.media_id) ?? null : null;
  const src   = media && clip?.type === "video" ? getMediaProxyUrl(media.id) : null;

  const title   = metadata.title || "";
  const caption = metadata.description || "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12 }}>
      {/* Platform switcher */}
      <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border)", flexShrink: 0 }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            style={{
              flex: 1, padding: "7px 4px", fontSize: 10, fontWeight: active === tab.id ? 700 : 400,
              background: active === tab.id ? "var(--accent)" : "var(--bg-secondary)",
              border: "none", color: active === tab.id ? "#fff" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mock */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "auto" }}>
        {active === "tiktok"         && <TikTokMock  src={src} title={title} caption={caption} />}
        {active === "instagram_reel" && <IGReelMock  src={src} caption={caption} />}
        {active === "instagram_post" && <IGPostMock  src={src} caption={caption} />}
        {active === "youtube"        && <YouTubeMock src={src} title={title} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor/frontend"
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor"
git add frontend/src/components/social/FeedPreview.tsx
git commit -m "feat(social): add FeedPreview with TikTok, IG Reel, IG Post, YouTube CSS mocks"
```

---

## Task 12: MultiExportPanel

**Files:**
- Create: `frontend/src/components/social/MultiExportPanel.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { useState } from "react";
import { useSocialStore } from "../../stores/socialStore";
import { useProjectStore } from "../../stores/projectStore";
import { socialMultiExport, getExportStatus } from "../../api/client";
import type { MultiExportJob, SocialPlatform } from "../../types";

const LABELS: Record<SocialPlatform, string> = {
  tiktok:         "TikTok 9:16",
  instagram_reel: "IG Reel 9:16",
  instagram_post: "IG Post 1:1",
  youtube:        "YouTube 16:9",
};

const COLORS: Record<SocialPlatform, string> = {
  tiktok:         "#60a5fa",
  instagram_reel: "#f472b6",
  instagram_post: "#f472b6",
  youtube:        "#f87171",
};

const STATUS_COLOR: Record<MultiExportJob["status"], string> = {
  pending: "#555",
  running: "#f59e0b",
  done:    "#22c55e",
  error:   "#ef4444",
};

const STATUS_LABEL: Record<MultiExportJob["status"], string> = {
  pending: "Queued",
  running: "Running…",
  done:    "Done",
  error:   "Error",
};

export function MultiExportPanel() {
  const { metadata, multiExportJobs, setMultiExportJobs } = useSocialStore();
  const { project } = useProjectStore();
  const [running, setRunning] = useState(false);

  const selected = metadata.platforms;

  const pollJob = (platform: SocialPlatform, jobId: string) => {
    const id = setInterval(async () => {
      try {
        const res = await getExportStatus(jobId);
        const d = res.data;
        const apiStatus = d.status === "completed" ? "done" : d.status === "failed" ? "error" : "running";
        setMultiExportJobs((prev) =>
          prev.map((j) =>
            j.jobId === jobId
              ? { ...j, status: apiStatus as MultiExportJob["status"], outputPath: d.output_path, error: d.error }
              : j
          )
        );
        if (apiStatus === "done" || apiStatus === "error") {
          clearInterval(id);
          setMultiExportJobs((prev) => {
            if (prev.every((j) => j.status === "done" || j.status === "error")) {
              setRunning(false);
            }
            return prev;
          });
        }
      } catch {
        clearInterval(id);
      }
    }, 2000);
  };

  const startExport = async () => {
    if (!project || selected.length === 0) return;
    setRunning(true);
    try {
      const res = await socialMultiExport({ project_id: project.id, platforms: selected });
      const raw = (res.data as { jobs: { platform: SocialPlatform; job_id: string }[] }).jobs;
      const jobs: MultiExportJob[] = raw.map((j) => ({
        platform: j.platform, jobId: j.job_id, status: "pending", outputPath: null, error: null,
      }));
      setMultiExportJobs(jobs);
      jobs.forEach((j) => pollJob(j.platform, j.jobId));
    } catch {
      setRunning(false);
    }
  };

  if (selected.length === 0) {
    return <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>Select platforms in Metadata first.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {selected.map((platform) => {
          const job = multiExportJobs.find((j) => j.platform === platform);
          const status = job?.status ?? "pending";
          return (
            <div key={platform} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 11, color: COLORS[platform] }}>{LABELS[platform]}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: STATUS_COLOR[status] }}>● {STATUS_LABEL[status]}</span>
                {status === "done" && job?.outputPath && (
                  <a
                    href={`http://localhost:8000/api/export/${job.jobId}/status`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 10, color: "var(--accent)" }}
                  >
                    View
                  </a>
                )}
                {status === "error" && job?.error && (
                  <span style={{ fontSize: 9, color: "#ef4444" }} title={job.error}>⚠</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={startExport}
        disabled={running || !project}
        style={{
          padding: "8px 0", borderRadius: 4, fontSize: 12, fontWeight: 600,
          background: running || !project ? "var(--bg-tertiary)" : "var(--accent)",
          border: "none", color: running || !project ? "var(--text-secondary)" : "#fff",
          cursor: running || !project ? "not-allowed" : "pointer",
        }}
      >
        {running ? "Exporting…" : "🚀 Export Selected Platforms"}
      </button>

      {multiExportJobs.length > 0 && (
        <p style={{ fontSize: 9, color: "var(--text-secondary)", margin: 0, textAlign: "center" }}>
          Files saved to data/exports/
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor/frontend"
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor"
git add frontend/src/components/social/MultiExportPanel.tsx
git commit -m "feat(social): add MultiExportPanel with per-platform job queue and status polling"
```

---

## Task 13: SocialPanel + wire TabBar + App

**Files:**
- Create: `frontend/src/components/social/SocialPanel.tsx`
- Modify: `frontend/src/components/layout/TabBar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create SocialPanel (root layout)**

```typescript
import { MetadataPanel }      from "./MetadataPanel";
import { ValidationWarnings } from "./ValidationWarnings";
import { HashtagPanel }       from "./HashtagPanel";
import { ThumbnailPicker }    from "./ThumbnailPicker";
import { MultiExportPanel }   from "./MultiExportPanel";
import { FeedPreview }        from "./FeedPreview";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ padding: "8px 12px", background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{title}</p>
      </div>
      <div style={{ padding: "10px 12px" }}>{children}</div>
    </div>
  );
}

export function SocialPanel() {
  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "var(--bg-primary)" }}>
      {/* Left column — controls */}
      <div style={{ width: 300, flexShrink: 0, borderRight: "1px solid var(--border)", overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <Section title="📝 Metadata">
          <MetadataPanel />
        </Section>
        <Section title="#️⃣ Hashtags">
          <HashtagPanel />
        </Section>
        <Section title="🖼 Thumbnail">
          <ThumbnailPicker />
        </Section>
        <Section title="⚠️ Platform Check">
          <ValidationWarnings />
        </Section>
        <Section title="🚀 Export All Platforms">
          <MultiExportPanel />
        </Section>
      </div>

      {/* Right column — feed preview */}
      <div style={{ flex: 1, padding: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", margin: "0 0 12px" }}>Feed Preview</p>
        <FeedPreview />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Social tab to TabBar**

In `frontend/src/components/layout/TabBar.tsx`, change the TABS array from:

```typescript
const TABS: { id: TabMode; label: string }[] = [
  { id: "edit",   label: "Edit" },
  { id: "batch",  label: "Batch" },
  { id: "export", label: "Export" },
  { id: "ai",     label: "AI Tools" },
  { id: "help",   label: "Help" },
];
```

to:

```typescript
const TABS: { id: TabMode; label: string }[] = [
  { id: "edit",   label: "Edit" },
  { id: "batch",  label: "Batch" },
  { id: "export", label: "Export" },
  { id: "ai",     label: "AI Tools" },
  { id: "social", label: "📱 Social" },
  { id: "help",   label: "Help" },
];
```

- [ ] **Step 3: Wire SocialPanel into App.tsx**

In `frontend/src/App.tsx`, add the import after the AI Tools import:

```typescript
import { SocialPanel } from "./components/social/SocialPanel";
```

Add the render line after `{activeTab === "ai" && <AITools />}`:

```typescript
{activeTab === "social" && <SocialPanel />}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor/frontend"
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Start the dev server and verify the Social tab loads**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor/frontend"
npm run dev
```

Open http://localhost:5173, click **📱 Social** tab. Expected: two-column layout visible — left panel with 5 sections, right panel with platform switcher and feed mock. No console errors.

- [ ] **Step 6: Commit**

```bash
cd "/Users/fighter/Documents/Projects Folder/VideoEditor"
git add frontend/src/components/social/SocialPanel.tsx \
        frontend/src/components/layout/TabBar.tsx \
        frontend/src/App.tsx
git commit -m "feat(social): wire SocialPanel into app — add Social tab to TabBar"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Dedicated Social tab — Task 13
- [x] Metadata panel (title, description, platform chips) — Task 7
- [x] Hashtag suggestions (Claude API + local fallback) — Tasks 5, 9
- [x] Feed mode preview (TikTok, IG Reel, IG Post, YouTube) — Task 11
- [x] Thumbnail picker (scrubber, canvas, overlay, PNG export) — Task 10
- [x] Platform validation warnings (client-side) — Task 8
- [x] Multi-platform batch export — Tasks 6, 12
- [x] Backend router + service — Tasks 5, 6
- [x] Tests for backend service and router — Tasks 5, 6
- [x] Types + store — Tasks 1, 2
- [x] API client helpers — Task 3
- [x] Hashtag database — Task 4

**No placeholders found.** All steps contain complete code or exact shell commands.

**Type consistency verified:** `SocialPlatform`, `SocialMetadata`, `HashtagResult`, `MultiExportJob` defined in Task 1 and used identically in Tasks 2, 7, 8, 9, 10, 11, 12, 13. `getExportStatus` from `api/client.ts` used in Task 12 (already exists in client).
