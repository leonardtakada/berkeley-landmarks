// Re-resolve every Wikimedia Commons landmark photo to a thumbnail size
// Wikimedia actually serves.
//
// Wikimedia only generates thumbnails at standard widths (…, 500, 960, 1280…);
// older links requested other widths (e.g. 800px) and now fail with HTTP 400.
// This asks the Commons API for each file's 960px thumbnail (following file
// renames), rewrites the URL in data/landmarks.ts and data/landmarks.json,
// and checks every result — slowly, one request at a time, to stay inside
// Wikimedia's rate limits.
//
//   node scripts/fix-photo-urls.mjs          # rewrite and verify
//   node scripts/fix-photo-urls.mjs --check  # verify only
import fs from "node:fs";

const FILES = ["data/landmarks.ts", "data/landmarks.json"];
const WIDTH = 960;
const UA = "BerkeleyTours/1.0 (https://github.com/; leonardtakada@yahoo.com) photo-link-check";
const checkOnly = process.argv.includes("--check");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ts = fs.readFileSync(FILES[0], "utf8");
const urls = [...new Set([...ts.matchAll(/photoUrl: '([^']+)'/g)].map((m) => m[1]))];
const commons = urls.filter((u) => u.startsWith("https://upload.wikimedia.org/wikipedia/commons/"));

/** "File:Name.jpg" from an upload.wikimedia.org URL (thumb or original). */
function fileTitle(url) {
  const path = new URL(url).pathname.split("/");
  // /wikipedia/commons/thumb/a/ab/<file>/<w>px-<file>  or  /wikipedia/commons/a/ab/<file>
  const i = path.indexOf("thumb");
  const name = i >= 0 ? path[i + 3] : path[5];
  return "File:" + decodeURIComponent(name).replace(/_/g, " ");
}

async function get(url, tries = 4) {
  for (let t = 0; t < tries; t++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status !== 429) return res;
    await sleep(2000 * (t + 1));
  }
  return fetch(url, { headers: { "User-Agent": UA } });
}

const replacements = new Map();
const missing = [];

if (!checkOnly) {
  const byTitle = new Map(commons.map((u) => [fileTitle(u), u]));
  const titles = [...byTitle.keys()];
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40);
    const api =
      "https://commons.wikimedia.org/w/api.php?action=query&format=json&redirects=1" +
      `&prop=imageinfo&iiprop=url&iiurlwidth=${WIDTH}&titles=` +
      encodeURIComponent(batch.join("|"));
    const data = await (await get(api)).json();
    // Map each requested title through normalisation and redirects to its page.
    const alias = new Map(batch.map((t) => [t, t]));
    for (const n of data.query?.normalized ?? []) alias.set(n.from, n.to);
    for (const r of data.query?.redirects ?? [])
      for (const [k, v] of alias) if (v === r.from) alias.set(k, r.to);
    const pages = new Map(Object.values(data.query?.pages ?? {}).map((p) => [p.title, p]));
    for (const t of batch) {
      const page = pages.get(alias.get(t));
      const info = page?.imageinfo?.[0];
      const next = info?.thumburl ?? info?.url;
      if (next) replacements.set(byTitle.get(t), next);
      else missing.push(byTitle.get(t));
    }
    await sleep(500);
  }

  for (const file of FILES) {
    let text = fs.readFileSync(file, "utf8");
    for (const [from, to] of replacements) {
      if (from === to) continue;
      // landmarks.json stores the same strings, possibly with escaped slashes.
      text = text.split(from).join(to).split(from.replace(/\//g, "\\/")).join(to.replace(/\//g, "\\/"));
    }
    fs.writeFileSync(file, text);
  }
  const changed = [...replacements].filter(([a, b]) => a !== b).length;
  console.log(`resolved ${replacements.size} Commons files, rewrote ${changed} URLs, ${missing.length} not found`);
  for (const m of missing) console.log("  not on Commons:", m);
}

// Verify every photo URL now in the data, one at a time.
const now = [...new Set([...fs.readFileSync(FILES[0], "utf8").matchAll(/photoUrl: '([^']+)'/g)].map((m) => m[1]))];
const bad = [];
for (const u of now) {
  const res = await get(u);
  if (res.status !== 200) bad.push(`${res.status} ${u}`);
  await sleep(u.includes("wikimedia") ? 350 : 50);
}
console.log(`checked ${now.length} photo URLs: ${now.length - bad.length} ok, ${bad.length} failing`);
for (const b of bad) console.log("  " + b);
