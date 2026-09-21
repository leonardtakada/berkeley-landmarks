#!/usr/bin/env python3
"""Fill missing photo_url in MySQL landmarks from Wikimedia Commons, then regenerate landmarks.json.
Usage: python3 scripts/fill_photos_db.py [--dry-run]
"""
import json, re, subprocess, sys, time, urllib.parse, urllib.request

API = "https://commons.wikimedia.org/w/api.php"
HEADERS = {"User-Agent": "BerkeleyToursApp/1.0 (landmark photo research; app.berkeley-tours.com)"}
DRY = "--dry-run" in sys.argv

def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)

BAD = ("map","plan","plaque","sign","logo","diagram","drawing","blueprint","postcard","sanborn","title page","cover")

def search_image(query):
    try:
        data = api({"action":"query","format":"json","generator":"search",
                    "gsrsearch":query,"gsrnamespace":6,"gsrlimit":10,
                    "prop":"imageinfo","iiprop":"url|mime","iiurlwidth":900})
    except Exception as e:
        print(f"  ! api error: {e}", file=sys.stderr); return None
    pages = (data.get("query") or {}).get("pages") or {}
    cands = []
    qterms = [t.lower() for t in query.replace(","," ").split() if len(t) > 3]
    for p in pages.values():
        title = p.get("title","")
        ii = (p.get("imageinfo") or [{}])[0]
        if ii.get("mime") not in ("image/jpeg","image/png"): continue
        if not re.search(r"\.(jpe?g|png)$", title, re.I): continue
        tl = title.lower()
        if any(x in tl for x in BAD): continue
        thumb = ii.get("thumburl") or ii.get("url")
        if not thumb: continue
        score = sum(1 for t in qterms if t in tl)
        if "berkeley" in tl: score += 2
        cands.append((score, thumb))
    if not cands: return None
    cands.sort(reverse=True)
    return cands[0][1] if cands[0][0] >= 2 else None

q = ("SELECT id,name,photo_url FROM landmarks WHERE photo_url IS NULL OR photo_url='' ORDER BY id;")
out = subprocess.run(["mysql","-uroot","-B","-e",q,"berkeley_landmarks"],capture_output=True,text=True)
rows = [l.split("\t")[:2] for l in out.stdout.strip().split("\n")[1:]]
print(f"{len(rows)} landmarks missing photos; querying Commons...", flush=True)
results, misses = {}, []
for mid, name in rows:
    for qs in (f"{name} Berkeley California",):
        url = search_image(qs)
        if url: break
        time.sleep(0.1)
    if url:
        results[mid] = url
        print(f"  ✓ {mid} {name}", flush=True)
    else:
        misses.append((mid,name))
        print(f"  ✗ {mid} {name}", flush=True)
    time.sleep(1.1)

print(f"\nFilled {len(results)}/{len(rows)}; misses: {len(misses)}")
json.dump(results, open("scripts/photo_fill_db_results.json","w"), indent=1)
json.dump(misses, open("scripts/photo_fill_db_misses.json","w"), indent=1)

if DRY or not results:
    sys.exit(0)
upd = "UPDATE landmarks SET photo_url = CASE id " + " ".join(
    f"WHEN '{mid}' THEN '{url.replace(chr(39),chr(39)*2)}'" for mid,url in results.items()
) + " ELSE photo_url END WHERE id IN (" + ",".join(f"'{m}'" for m in results) + ");"
r = subprocess.run(["mysql","-uroot","berkeley_landmarks","-e",upd],capture_output=True,text=True)
if r.returncode: print("SQL ERR:", r.stderr); sys.exit(1)
subprocess.run([sys.executable,"scripts/export_landmarks_json.py"],check=True)
print("DB updated + landmarks.json regenerated")
