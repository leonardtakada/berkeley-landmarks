#!/usr/bin/env python3
"""Fetch landmark photos from Wikimedia Commons into assets/photos/.

For each landmark in data/landmarks.ts:
  1. Query the Commons API (search by name + Berkeley) for the best image.
  2. Download an 800px thumb as assets/photos/<id>.jpg.
  3. Write assets/photos/manifest.json mapping id -> local path + credit.

Resumable: skips ids that already have a file. Polite: 100ms between API hits.
"""
import json
import os
import re
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "landmarks.ts")
OUT_DIR = os.path.join(ROOT, "assets", "photos")
MANIFEST = os.path.join(OUT_DIR, "manifest.json")
UA = {"User-Agent": "BerkeleyToursApp/1.0 (landmark photo fetch; contact: dev)"}
API = "https://commons.wikimedia.org/w/api.php"

os.makedirs(OUT_DIR, exist_ok=True)


def get(url):
    last_err = None
    for i in range(6):
        try:
            req = urllib.request.Request(url, headers=UA)
            return urllib.request.urlopen(req, timeout=30)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = min(60 * (i + 1), 300)
                print(f"429, backing off {wait}s")
                time.sleep(wait)
                continue
            raise
    raise last_err or RuntimeError("retries exhausted")


def api_query(**params):
    params.update(format="json", formatversion=2)
    return json.load(get(API + "?" + urllib.parse.urlencode(params)))


def parse_landmarks():
    src = open(SRC).read()
    block = src[src.index("export const landmarks"): src.index("];", src.index("export const landmarks"))]
    out = []
    # Split on object literals starting with id:
    entries = re.split(r"\n  \{\n", "\n" + block)
    for e in entries[1:]:
        mid = re.search(r"id: '([^']+)'", e)
        mname = re.search(r"name: '([^']+)'", e)
        mphoto = re.search(r"photoUrl: '([^']+)'", e)
        if mid and mname:
            name = mname.group(1).replace("\\'", "'")
            out.append({
                "id": mid.group(1),
                "name": name,
                "photoUrl": mphoto.group(1) if mphoto else None,
            })
    return out


def search_image(name):
    """Return best Commons file title for this landmark, or None."""
    q = f'{name} Berkeley California'
    try:
        res = api_query(action="query", list="search", srsearch=q,
                        srnamespace=6, srlimit=5)
    except Exception:
        return None
    hits = res.get("search", [])
    if not hits:
        return None
    # Prefer titles whose filename mentions the landmark's first words
    key = name.split("(")[0].strip().lower()
    words = [w for w in re.findall(r"[a-z]+", key) if len(w) > 3][:3]
    def score(h):
        t = h["title"].lower()
        s = sum(1 for w in words if w in t)
        ext = t.lower()
        if ext.endswith((".pdf", ".svg", ".tif", ".tiff", ".ogv", ".webm", ".djvu")):
            s -= 5
        return s
    hits.sort(key=score, reverse=True)
    best = hits[0]
    if score(best) <= 0:
        return None
    return best["title"]


def thumb_url(title, width=800):
    try:
        res = api_query(action="query", titles=title, prop="imageinfo",
                        iiprop="url|extmetadata", iiurlwidth=width)
    except Exception:
        return None, None
    pages = res.get("query", {}).get("pages", [])
    if not pages:
        return None, None
    ii = pages[0].get("imageinfo", [])
    if not ii:
        return None, None
    credit = ""
    try:
        credit = pages[0]["imageinfo"][0]["extmetadata"].get("Artist", {}).get("value", "")
        credit = re.sub(r"<[^>]+>", "", credit).strip()[:120]
    except Exception:
        pass
    return ii[0].get("thumburl") or ii[0].get("url"), credit


def download(url, dest):
    data = get(url).read()
    if len(data) < 2000:  # tiny = probably error page
        return False
    with open(dest, "wb") as f:
        f.write(data)
    return True


def main():
    landmarks = parse_landmarks()
    manifest = {}
    if os.path.exists(MANIFEST):
        manifest = json.load(open(MANIFEST))
    stats = {"kept_existing": 0, "fetched": 0, "failed": []}
    for lm in landmarks:
        lid, name = lm["id"], lm["name"]
        dest = os.path.join(OUT_DIR, f"{lid}.jpg")
        if lid in manifest and os.path.exists(dest):
            stats["kept_existing"] += 1
            continue
        title = search_image(name)
        time.sleep(0.7)
        if not title:
            stats["failed"].append(lid)
            continue
        url, credit = thumb_url(title)
        time.sleep(0.7)
        if not url or not url.lower().endswith((".jpg", ".jpeg", ".png")):
            stats["failed"].append(lid)
            continue
        try:
            if download(url, dest):
                manifest[lid] = {"title": title, "credit": credit}
                stats["fetched"] += 1
                print(f"ok {lid}: {title[:60]}")
            else:
                stats["failed"].append(lid)
        except Exception as e:
            print(f"err {lid}: {e}")
            stats["failed"].append(lid)
    json.dump(manifest, open(MANIFEST, "w"), indent=1)
    total_mb = sum(os.path.getsize(OUT_DIR + "/" + f) for f in os.listdir(OUT_DIR) if f.endswith(".jpg")) / 1e6
    print(json.dumps({k: (v if k != "failed" else len(v)) for k, v in stats.items()}, indent=1))
    print(f"failed ids: {','.join(stats['failed'])}")
    print(f"photos dir size: {total_mb:.1f} MB")


if __name__ == "__main__":
    main()
