#!/usr/bin/env python3
"""Fill missing photoUrl fields in data/landmarks.ts from Library of Congress
(HABS/HAER surveys + other collections). Conservative matching only."""
import json, re, sys, time, urllib.parse, urllib.request

HEADERS = {"User-Agent": "BerkeleyToursApp/1.0 (landmark photo research)"}
TS_PATH = "data/landmarks.ts"
MIN_SCORE = 3

def loc_search(query):
    url = "https://www.loc.gov/search/?" + urllib.parse.urlencode({
        "q": query, "fo": "json", "c": 8, "at": "results",
    })
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return (json.load(r).get("results") or [])
    except Exception as e:
        print(f"  ! error {e}", file=sys.stderr)
        return []

def norm_words(s):
    return [w for w in re.findall(r"[a-z]+", s.lower()) if len(w) > 3 and w not in
            ("house", "building", "berkeley", "california", "street", "avenue")]

def pick(name, results):
    nwords = set(norm_words(name))
    best = None
    for r in results:
        title = r.get("title", "") or ""
        desc = (r.get("description") or "")
        if isinstance(desc, list):
            desc = " ".join(desc)
        hay = (title + " " + desc).lower()
        if "san jose" in hay or "oakland" in hay or "san francisco" in hay:
            continue
        hay_words = set(norm_words(title + " " + desc))
        overlap = len(nwords & hay_words)
        score = overlap
        coll = (r.get("partof_timestampt") or "") if isinstance(r.get("partof_timestampt"), str) else ""
        if "berkeley" in hay:
            score += 2
        img = None
        for u in (r.get("image_url") or []):
            if isinstance(u, str) and u.startswith("http"):
                img = u
                break
        if not img:
            continue
        if img.startswith("https://www.loc.gov/resource/"):
            continue  # item page, not direct image
        if best is None or score > best[0]:
            best = (score, img, title)
    if best and best[0] >= MIN_SCORE:
        return best
    return None

def main():
    src = open(TS_PATH).read()
    parts = re.split(r"(?=    id: 'lm-)", src)
    missing = []
    for p in parts[1:]:
        mid = re.search(r"id: '(lm-[^']+)'", p)
        nm = re.search(r"^\s*name: '([^']+)'", p, re.M)
        if mid and nm and "photoUrl" not in p:
            missing.append((mid.group(1), nm.group(1).replace("\\'", "'")))
    print(f"{len(missing)} missing; querying LoC...")
    results = {}
    for i, (mid, name) in enumerate(missing):
        hits = loc_search(f'"{name}" berkeley california')
        best = pick(name, hits)
        if not best:
            hits = loc_search(f"{name} berkeley")
            best = pick(name, hits)
        if best:
            results[mid] = best[1]
            print(f"  ✓ [{i+1}/{len(missing)}] {name} -> {best[2][:50]}")
        else:
            print(f"  ✗ [{i+1}/{len(missing)}] {name}")
        time.sleep(0.2)
    for idx, part in enumerate(parts):
        if idx == 0:
            continue
        m = re.search(r"id: '(lm-[^']+)'", part)
        if m and m.group(1) in results:
            parts[idx] = re.sub(
                r"(\n(\s*)name: '(?:[^'\\]|\\.)*',)",
                lambda mm: mm.group(1) + "\n" + mm.group(2) + "photoUrl: '" + results[m.group(1)].replace("'", "\\'") + "',",
                part, count=1)
    open(TS_PATH, "w").write("".join(parts))
    json.dump(results, open("scripts/photo_fill_loc_results.json", "w"), indent=1)
    print(f"Filled {len(results)}/{len(missing)}")

if __name__ == "__main__":
    main()
