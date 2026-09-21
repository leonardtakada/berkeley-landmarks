#!/usr/bin/env python3
"""Regenerate data/landmarks.json from MySQL (all rows now in DB)."""
import json, subprocess

q = """SELECT id,name,address,latitude,longitude,architect,year_built,category,
landmark_number,description,style,national_register,neighborhood,designation_type,photo_url
FROM landmarks ORDER BY id;"""
out = subprocess.run(["mysql","-uroot","-B","--default-character-set=utf8mb4",
  "-e", q, "berkeley_landmarks"], capture_output=True, text=True)
if out.returncode: raise SystemExit(out.stderr)
lines = out.stdout.strip().split("\n")
hdr = lines[0].split("\t")
data = []
for ln in lines[1:]:
    row = dict(zip(hdr, ln.split("\t")))
    def s(k): return row[k] if row[k] != "NULL" else None
    data.append({
        "id": row["id"], "name": row["name"], "address": row["address"],
        "latitude": float(row["latitude"]), "longitude": float(row["longitude"]),
        "architect": s("architect"), "yearBuilt": s("year_built"),
        "category": row["category"], "landmarkNumber": s("landmark_number"),
        "description": s("description"), "style": s("style"),
        "nationalRegister": bool(int(row["national_register"])) if row["national_register"]!="NULL" else False,
        "neighborhood": s("neighborhood"), "designationType": s("designation_type"),
        "photoUrl": s("photo_url"),
    })
# sanity
assert len(data) == 406, len(data)
sparse = [d["id"] for d in data if not d.get("description")]
assert not sparse, sparse
json.dump(data, open("data/landmarks.json","w"), ensure_ascii=False, indent=2)
print(f"OK: {len(data)} landmarks, all have descriptions")
