// More photographs of a landmark, for its gallery: for each landmark whose
// lead photograph comes from Wikimedia Commons, find the Commons category
// that is about that building (it must share a distinctive word with the
// landmark's name), and take up to five more pictures from it, with the
// author and licence for the credit line.
//
//   node scripts/fetch-gallery-photos.mjs candidates.json   → candidates to review
//   node scripts/fetch-gallery-photos.mjs --apply picks.json → writes `photos` into data/landmarks.{ts,json}
//
// Picks are reviewed by eye before they're applied (a category can hold a
// neighbour, a plaque or a floor plan).
import fs from "node:fs";

const UA = "BerkeleyTours/1.0 (landmark guide; gallery photos) node";
const API = "https://commons.wikimedia.org/w/api.php";
const PER_LANDMARK = 5;
const WIDTH = 960; // a thumbnail width Commons serves

const GENERIC = new Set(
  "the and of for at in on a an berkeley california ca house houses building buildings hall home company street avenue way center centre club inc".split(
    " ",
  ),
);
const NOT_PHOTOS = /\b(map|plan|plans|sheet|drawing|elevation|section|diagram|logo|seal|coat of arms)\b|\.(svg|pdf|djvu|ogg|webm)$/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429 || res.status >= 500) {
      await sleep(3000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await sleep(600);
    return res.json();
  }
  throw new Error(`gave up on ${url}`);
}

function fileTitle(photoUrl) {
  const m = photoUrl.split("?")[0].match(/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/);
  return m ? `File:${decodeURIComponent(m[1])}` : null;
}

const tokens = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !GENERIC.has(w));

const strip = (html = "") => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function gather(out) {
  const all = JSON.parse(fs.readFileSync("data/landmarks.json", "utf8"));
  const list = Array.isArray(all) ? all : all.landmarks;
  const results = [];
  for (const lm of list) {
    try {
      await gatherOne(lm, results);
    } catch (e) {
      console.log(`${lm.id} ${lm.name}: skipped (${e.message.slice(0, 80)})`);
    }
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(`wrote ${out}: ${results.length} landmarks, ${results.reduce((n, r) => n + r.photos.length, 0)} photos`);
}

async function gatherOne(lm, results) {
  {
    if (!lm.photoUrl) return;
    // The lead photograph's own Commons file, when it has one.
    const title = fileTitle(lm.photoUrl);
    const want = tokens(lm.name);
    if (!want.length) return;
    const cats = title
      ? await api({ action: "query", prop: "categories", titles: title, clshow: "!hidden", cllimit: "50" })
      : null;
    const names = (cats?.query?.pages?.[0]?.categories ?? []).map((c) => c.title);
    const enough = (text) => tokens(text).filter((t) => want.includes(t)).length >= Math.max(1, Math.ceil(want.length / 2));
    const scored = names
      .map((c) => ({ c, hits: tokens(c.replace(/^Category:/, "")).filter((t) => want.includes(t)).length }))
      .filter((x) => enough(x.c.replace(/^Category:/, "")) && /berkeley/i.test(x.c))
      .sort((a, b) => b.hits - a.hits || a.c.length - b.c.length);
    let files = [];
    let source = "search";
    if (scored.length) {
      source = scored[0].c;
      const members = await api({ action: "query", list: "categorymembers", cmtitle: source, cmtype: "file", cmlimit: "50" });
      files = (members.query?.categorymembers ?? []).map((m) => m.title);
    }
    // And a search of file names: the building's name, in Berkeley.
    const found = await api({
      action: "query",
      list: "search",
      srnamespace: "6",
      srlimit: "15",
      srsearch: `${lm.name.replace(/[()"]/g, " ")} Berkeley`,
    });
    for (const r of found.query?.search ?? []) {
      if (enough(r.title.replace(/^File:/, "")) && !files.includes(r.title)) files.push(r.title);
    }
    files = files.filter((t) => t !== title && !NOT_PHOTOS.test(t)).slice(0, PER_LANDMARK + 3);
    if (!files.length) return;
    const cat = source;
    const info = await api({
      action: "query",
      prop: "imageinfo",
      titles: files.join("|"),
      iiprop: "url|extmetadata|mime",
      iiurlwidth: String(WIDTH),
    });
    const photos = (info.query?.pages ?? [])
      .filter((p) => p.imageinfo?.[0]?.thumburl && /image\/(jpeg|png|tiff)/.test(p.imageinfo[0].mime))
      .map((p) => {
        const ii = p.imageinfo[0];
        const md = ii.extmetadata ?? {};
        const artist = strip(md.Artist?.value).slice(0, 80) || "Unknown";
        const licence = strip(md.LicenseShortName?.value) || "see Commons";
        return { file: p.title, url: ii.thumburl, credit: `${artist} · ${licence} · Wikimedia Commons` };
      })
      .slice(0, PER_LANDMARK);
    if (photos.length) {
      results.push({ id: lm.id, name: lm.name, category: cat, photos });
      console.log(`${lm.id} ${lm.name}: ${photos.length} from ${cat}`);
    }
  }
}

function apply(picksPath) {
  /** picks: { [landmarkId]: [{ url, credit }] } */
  const picks = JSON.parse(fs.readFileSync(picksPath, "utf8"));
  const jsonPath = "data/landmarks.json";
  const all = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const list = Array.isArray(all) ? all : all.landmarks;
  let ts = fs.readFileSync("data/landmarks.ts", "utf8");
  let n = 0;
  for (const lm of list) {
    const p = picks[lm.id];
    delete lm.photos;
    if (p?.length) {
      lm.photos = p.map(({ url, credit }) => ({ url, credit }));
      n += p.length;
    }
  }
  fs.writeFileSync(jsonPath, JSON.stringify(all, null, 2) + "\n");
  // In the TS source, each entry's photos go after its photoUrl line.
  ts = ts.replace(/\n    photos: \[[\s\S]*?\n    \],/g, "");
  for (const [id, p] of Object.entries(picks)) {
    if (!p.length) continue;
    const re = new RegExp(`(id: '${id}',[\\s\\S]*?photoUrl: '[^']*',)`);
    const block =
      "\n    photos: [\n" +
      p.map(({ url, credit }) => `      { url: ${JSON.stringify(url)}, credit: ${JSON.stringify(credit)} },`).join("\n") +
      "\n    ],";
    if (!re.test(ts)) {
      console.log(`  ${id}: not in data/landmarks.ts (only in the JSON) — skipped there`);
      continue;
    }
    ts = ts.replace(re, `$1${block}`);
  }
  fs.writeFileSync("data/landmarks.ts", ts);
  console.log(`applied ${n} gallery photos to ${Object.keys(picks).length} landmarks`);
}

if (process.argv[2] === "--apply") apply(process.argv[3]);
else await gather(process.argv[2] ?? "gallery-candidates.json");
