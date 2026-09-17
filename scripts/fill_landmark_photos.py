#!/usr/bin/env python3
"""Fill missing photoUrl fields in data/landmarks.ts from Wikimedia Commons."""
import json, re, time, urllib.parse, urllib.request, sys

API = "https://commons.wikimedia.org/w/api.php"
HEADERS = {"User-Agent": "BerkeleyToursApp/1.0 (landmark photo research)"}
TS_PATH = "data/landmarks.ts"

def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)

def search_image(query):
    """Return best 800px thumb URL for query, or None."""
    try:
        data = api({
            "action": "query", "format": "json",
            "generator": "search", "gsrsearch": query, "gsrnamespace": 6, "gsrlimit": 10,
            "prop": "imageinfo", "iiprop": "url", "iiurlwidth": 800,
        })
    except Exception as e:
        print(f"  ! api error: {e}", file=sys.stderr)
        return None
    pages = (data.get("query") or {}).get("pages") or {}
    cands = []
    qterms = [t.lower() for t in query.replace(",", " ").split() if len(t) > 3]
    for p in pages.values():
        title = p.get("title", "")
        if not re.search(r"\.(jpe?g|png)$", title, re.I):
            continue
        if any(x in title.lower() for x in ("map", "plan", "plaque", "sign", "logo", "diagram", "drawing")):
            continue
        ii = (p.get("imageinfo") or [{}])[0]
        thumb = ii.get("thumburl") or ii.get("url")
        if not thumb:
            continue
        # score: title term overlap with query
        tl = title.lower()
        score = sum(1 for t in qterms if t in tl)
        # prefer 'berkeley' in title
        if "berkeley" in tl:
            score += 2
        cands.append((score, thumb, title))
    if not cands:
        return None
    cands.sort(reverse=True)
    best = cands[0]
    if best[0] < 2:
        return None  # too weak a match
    return best[1]

def main():
    src = open(TS_PATH).read()
    # Split into landmark blocks: entries start at "  {" line boundaries; find each object with id: 'lm-'
    # Simpler: process sequentially with regex over full objects is risky; instead, find missing entries by
    # scanning blocks separated by "  {\n" ... use brace matching via ids.
    lines = src.split("\n")
    out_lines = []
    n_missing = n_filled = 0
    i = 0
    current = {"id": None, "name": None, "has_photo": False}
    results = {}  # id -> url
    # First pass: collect (id, name) for entries without photoUrl
    entry_id = None
    for ln in lines:
        m = re.search(r"id: '(lm-[^']+)'", ln)
        if m:
            entry_id = m.group(1)
        m = re.search(r"^\s*name: '([^']+)'", ln)
        if m and entry_id and entry_id not in results:
            pass
    # Parse blocks properly: between "id: 'lm-" markers
    blocks = re.split(r"(?=    id: 'lm-)", src)
    missing = []
    for b in blocks[1:]:
        mid = re.search(r"id: '(lm-[^']+)'", b)
        nm = re.search(r"^\s*name: '([^']+)'", b, re.M)
        if mid and nm and "photoUrl" not in b.split("},")[0]:
            missing.append((mid.group(1), nm.group(1)))
    print(f"{len(missing)} landmarks missing photos; querying Commons...")
    for mid, name in missing:
        # Try progressively looser queries
        for q in (f"{name} Berkeley California", name if len(name) > 10 else None):
            if not q:
                continue
            url = search_image(q)
            if url:
                results[mid] = url
                print(f"  ✓ {name} -> {url.rsplit('/',1)[-1][:60]}")
                n_filled += 1
                break
        else:
            print(f"  ✗ {name}")
        n_missing += 1
        time.sleep(0.15)
    # Second pass: inject photoUrl after name line for found ids
    def inject(match):
        b = match.group(0)
        mid = re.search(r"id: '(lm-[^']+)'", b).group(1)
        if mid in results and "photoUrl" not in b:
            # insert after the name line
            return re.sub(r"(\n(\s*)name: '[^']+',)", r"\1\n\2photoUrl: '" + results[mid].replace("'", "\\'") + "',", b, count=1)
        return b
    new_src = re.sub(r"(?=    id: 'lm-).*?(?=\n    \}|\Z)", lambda m: m.group(0), src, flags=re.S)
    # safer manual reconstruction
    parts = re.split(r"(?=    id: 'lm-)", src)
    for idx, part in enumerate(parts):
        if idx == 0:
            continue
        mid = re.search(r"id: '(lm-[^']+)'", part)
        if mid and mid.group(1) in results and "photoUrl" not in part:
            parts[idx] = re.sub(
                r"(\n(\s*)name: '[^']*',)",
                lambda m: m.group(1) + "\n" + m.group(2) + "photoUrl: '" + results[mid.group(1)].replace("'", "\\'") + "',",
                part, count=1)
    open(TS_PATH, "w").write("".join(parts))
    print(f"Filled {n_filled}/{len(missing)}; saved {TS_PATH}")
    json.dump(results, open("scripts/photo_fill_results.json", "w"), indent=1)

if __name__ == "__main__":
    main()
