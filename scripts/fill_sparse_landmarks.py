#!/usr/bin/env python3
"""Fill the 14 sparse (json-only) landmark entries: insert into MySQL + enrich data/landmarks.json.
Run from repo root: python3 scripts/fill_sparse_landmarks.py
"""
import json, subprocess, sys

# id: (name, lat, lng, architect, year, style, nr, neighborhood, designation, lmnum, category, description)
L = {
"lm-314": ("Bowles Hall", 37.8742, -122.2573, "George W. Kelham", "1928", "Collegiate Gothic", 1,
  "UC Campus", "Landmark", "#369", "educational",
  "A gift of Phoebe Apperson Hearst, Bowles Hall opened in 1928 as the first residential college in the University of California system. George W. Kelham designed the Norman Gothic stone pile, whose grand dining hall and storied traditions have made it a campus icon. It is listed on the National Register of Historic Places."),
"lm-316": ("California Hall", 37.8734, -122.2595, "John Galen Howard", "1905", "Beaux-Arts", 1,
  "UC Campus", "Landmark", "#371", "educational",
  "One of John Galen Howard's earliest campus buildings, California Hall (1905) anchors the Classical core of the university with its Beaux-Arts limestone facade and columned entry. Built to house administration and classrooms, it remains in academic use and is listed on the National Register of Historic Places."),
"lm-318": ("Doe Memorial Library", 37.8722, -122.2595, "John Galen Howard", "1911", "Classical Revival", 1,
  "UC Campus", "Landmark", "#373", "educational",
  "The campus's main library, named for benefactor Charles Franklin Doe, opened in 1911 from John Galen Howard's neoclassical design and was completed with later wings. Its grand reading room and ornate vestibule anchor the heart of the university; the building is listed on the National Register of Historic Places."),
"lm-321": ("Giannini Hall", 37.8737, -122.2630, "William C. Hays", "1930", "Moderne / Classical", 0,
  "UC Campus", "Landmark", "#376", "educational",
  "Dedicated in 1930 and named for A. P. Giannini, founder of the Bank of America, Giannini Hall was designed by William C. Hays to house the university's agricultural economics programs. Its restrained moderne-classical styling completes the agricultural complex at the east end of campus."),
"lm-323": ("Hearst Gymnasium for Women", 37.8727, -122.2620, "Bernard Maybeck & Julia Morgan", "1927", "Classical Revival", 0,
  "UC Campus", "Landmark", "#378", "educational",
  "Completed in 1927 from designs by Bernard Maybeck in association with Julia Morgan, Hearst Gymnasium replaced the women's gymnasium lost to the 1922 fire. Its brick walls, tiled roofs, and sheltered loggia pool remain among the campus's most distinctive recreational buildings."),
"lm-325": ("Hilgard Hall", 37.8738, -122.2626, "John Galen Howard", "1917", "Beaux-Arts", 1,
  "UC Campus", "Landmark", "#380", "educational",
  "Completed in 1917 for the College of Agriculture and named for pioneering soil scientist Eugene W. Hilgard, this Beaux-Arts building pairs Howard's Northern Italian Renaissance detailing with laboratories that long served agricultural chemistry. It is listed on the National Register of Historic Places."),
"lm-327": ("South Hall", 37.8728, -122.2598, "Farley & Harness", "1873", "Second Empire", 1,
  "UC Campus", "Landmark", "#382", "educational",
  "The oldest building on campus, South Hall (1873) is the sole survivor of the original university complex. Its Second Empire silhouette with mansard roof and ornate brackets, designed by Farley & Harness, now houses the School of Information. It is listed on the National Register of Historic Places."),
"lm-328": ("University House", 37.8741, -122.2578, "John Galen Howard", "1911", "Classical Revival", 0,
  "UC Campus", "Landmark", "#383", "educational",
  "Designed by John Galen Howard and completed in 1911, University House has served as the residence of the university's presidents for over a century. Set in gardens at the north edge of campus, its classical portico and lawn host commencement-season receptions."),
"lm-329": ("Wellman Hall", 37.8736, -122.2628, "John Galen Howard", "1912", "Classical Revival", 1,
  "UC Campus", "Landmark", "#384", "educational",
  "Originally built in 1912 as Agriculture Hall and renamed for agricultural economist Harry B. Wellman, this Classical Revival building by John Galen Howard anchors the agricultural quad. It is listed on the National Register of Historic Places."),
"lm-330": ("Wheeler Hall", 37.8718, -122.2594, "John Galen Howard", "1917", "Classical Revival", 0,
  "UC Campus", "Landmark", "#385", "educational",
  "Named for president Benjamin Ide Wheeler and completed in 1917, Wheeler Hall houses the university's largest lecture halls and the English department. Howard's hillside design turns its colonnaded facade toward the campus core, with Maude a dormer-lit auditorium beloved of generations of students."),
"lm-332": ("Founders Rock", 37.8753, -122.2569, None, "1860", "N/A", 0,
  "UC Campus", "Landmark", "#387", "structure_of_merit",
  "On April 16, 1860, trustees of the College of California stood on this outcrop at the corner of Hearst Avenue and Gayley Road and chose the site for their new campus. The glacial erratic, set in a small plaza, commemorates the founding of what became the University of California."),
"lm-334": ("Edwards Stadium", 37.8724, -122.2644, "Warren C. Perry & George W. Kelham", "1932", "Moderne", 1,
  "UC Campus", "Landmark", "#389", "educational",
  "Opened in 1932 and designed by Warren C. Perry with George W. Kelham, Edwards Stadium was the first stadium in the world built specifically for track and field. The reinforced-concrete grandstands along Bancroft Way have hosted Olympic trials and generations of Cal track stars; it is listed on the National Register of Historic Places."),
"lm-342": ("Fox Court", 37.8699, -122.2827, "Carl Fox", "1927", "Mediterranean Revival", 1,
  "Downtown", "Landmark", "#398", "residential",
  "Built between 1927 and 1930 by developer-architect Carl Fox, Fox Court is a garden-apartment complex arranged around a quiet landscaped courtyard off University Avenue. Its sister complex Fox Commons adjoins it; both are listed on the National Register of Historic Places as fine examples of Berkeley's courtyard housing movement."),
"lm-379": ("City Hall", 37.8692, -122.2733, "Bakewell & Brown", "1909", "Beaux-Arts", 1,
  "Civic Center Historic District", "Historic District", "#249", "civic",
  "Berkeley's Old City Hall (1909), designed by John Bakewell Jr. and Arthur Brown Jr. — the architects of San Francisco City Hall — served as the seat of city government until 1977. Its Beaux-Arts facade with Ionic columns and 60-foot lantern dome defines the city's Civic Center Historic District and is listed on the National Register of Historic Places."),
}

def sql_esc(v):
    return "NULL" if v is None else "'" + str(v).replace("\\", "\\\\").replace("'", "''") + "'"

rows = []
for i,(name,lat,lng,arch,yr,style,nr,hud,desig,lmnum,cat,desc) in L.items():
    rows.append(f"({sql_esc(i)},{sql_esc(name)},'U.C. Berkeley Campus' if False else NULL, {lat},{lng},{sql_esc(arch)},{sql_esc(yr)},{sql_esc(cat)},{sql_esc(lmnum)},{sql_esc(desc)},{sql_esc(style)},{int(nr)},{sql_esc(hud)},{sql_esc(desig)},NULL,NOW(),NOW())")

# build inserts with address taken from json
import json as _j
addr = {x['id']:x.get('address') for x in _j.load(open('data/landmarks.json'))}
final_rows=[]
for i,(name,lat,lng,arch,yr,style,nr,hud,desig,lmnum,cat,desc) in L.items():
    final_rows.append(f"({sql_esc(i)},{sql_esc(name)},{sql_esc(addr[i])},{lat},{lng},{sql_esc(arch)},{sql_esc(yr)},{sql_esc(cat)},{sql_esc(lmnum)},{sql_esc(desc)},{sql_esc(style)},{int(nr)},{sql_esc(hud)},{sql_esc(desig)},NULL,NOW(),NOW())")

cols = "id,name,address,latitude,longitude,architect,year_built,category,landmark_number,description,style,national_register,neighborhood,designation_type,photo_url,createdAt,updatedAt"
stmt = "INSERT INTO landmarks ("+cols+") VALUES\n" + ",\n".join(final_rows) + "\nON DUPLICATE KEY UPDATE description=VALUES(description), architect=VALUES(architect), updatedAt=NOW();"
open('/tmp/fill_sparse.sql','w').write(stmt)
print("SQL written, rows:", len(final_rows))
