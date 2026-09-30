// Print every photograph in the guide into the app itself, so an entry's
// plates are there with no signal — in the hills, on a plane, roaming.
//
// For each landmark photograph (the lead plate and the gallery) this fetches
// the picture once, prints it small — 960px wide at most, JPEG through
// mozjpeg — into assets/photos/, and asks Commons who took it and on what
// licence. It writes lib/photos.generated.ts: each photograph's URL → its
// bundled image and its credit. lib/photo-source.ts serves the bundled print
// wherever the URL appears; the URL stays in data/ as the photograph's source.
//
//   node scripts/bundle-photos.mjs          # fetch what's new, rewrite the module
//   node scripts/bundle-photos.mjs --report # sizes and credits, fetch nothing
//
// Originals are kept in scripts/.cache/photos (not committed); re-runs only
// fetch photographs added since.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const WIDTH = 960;
const QUALITY = 62;
const OUT_DIR = "assets/photos";
const CACHE = "scripts/.cache/photos";
const MODULE = "lib/photos.generated.ts";
const CREDITS = "scripts/.cache/photo-credits.json";
const UA = "BerkeleyTours/1.0 (leonardtakada@yahoo.com) photo-bundler";
const report = process.argv.includes("--report");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const landmarks = JSON.parse(fs.readFileSync("data/landmarks.json", "utf8"));
const photos = new Map(); // url → { credit? }
for (const l of landmarks) {
  if (l.photoUrl) photos.set(l.photoUrl, photos.get(l.photoUrl) ?? {});
  for (const p of l.photos ?? []) photos.set(p.url, { credit: p.credit ?? photos.get(p.url)?.credit });
}

const name = (url) => `p-${crypto.createHash("sha1").update(url).digest("hex").slice(0, 12)}.jpg`;

async function get(url, tries = 5) {
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.status !== 429 && res.status < 500) return res;
    } catch {
      /* retry */
    }
    await sleep(2000 * (t + 1));
  }
  throw new Error(`gave up on ${url}`);
}

/** "File:Name.jpg" from a Commons URL (thumb or original), else null. */
function commonsTitle(url) {
  const u = new URL(url);
  if (!/wikimedia\.org$/.test(u.host)) return null;
  const parts = u.pathname.split("/");
  const i = parts.indexOf("thumb");
  const file = i >= 0 ? parts[i + 3] : parts[5];
  return file ? "File:" + decodeURIComponent(file).replace(/_/g, " ") : null;
}

const strip = (html = "") =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** Who and on what licence, from Commons, for photographs that have no credit yet. */
async function commonsCredits(urls) {
  const known = fs.existsSync(CREDITS) ? JSON.parse(fs.readFileSync(CREDITS, "utf8")) : {};
  const want = urls.filter((u) => !known[u] && commonsTitle(u));
  const byTitle = new Map(want.map((u) => [commonsTitle(u), u]));
  const titles = [...byTitle.keys()];
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40);
    const api =
      "https://commons.wikimedia.org/w/api.php?action=query&format=json&redirects=1" +
      "&prop=imageinfo&iiprop=extmetadata&titles=" +
      encodeURIComponent(batch.join("|"));
    const data = await (await get(api)).json();
    const alias = new Map(batch.map((t) => [t, t]));
    for (const n of data.query?.normalized ?? []) alias.set(n.from, n.to);
    for (const r of data.query?.redirects ?? []) for (const [k, v] of alias) if (v === r.from) alias.set(k, r.to);
    const pages = new Map(Object.values(data.query?.pages ?? {}).map((p) => [p.title, p]));
    for (const t of batch) {
      const meta = pages.get(alias.get(t))?.imageinfo?.[0]?.extmetadata;
      if (!meta) continue;
      let artist = strip(meta.Artist?.value);
      // "Own work" and user-page links reduce to the name; keep it short.
      artist = artist.replace(/^User:/, "").replace(/\s*\(talk\)$/, "");
      if (artist.length > 60) artist = artist.slice(0, 57).trim() + "…";
      const licence = strip(meta.LicenseShortName?.value) || "see Commons";
      known[byTitle.get(t)] = [artist || "Unknown photographer", licence, "Wikimedia Commons"].join(" · ");
    }
    await sleep(600);
  }
  fs.mkdirSync(path.dirname(CREDITS), { recursive: true });
  fs.writeFileSync(CREDITS, JSON.stringify(known, null, 2));
  return known;
}

function otherCredit(url) {
  const host = new URL(url).host;
  if (host.endsWith("berkeleyplaques.org")) return "Berkeley Historical Plaque Project";
  if (host.endsWith("calisphere.org")) return "Calisphere, University of California";
  return host;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });

const urls = [...photos.keys()];
const fetched = new Map(); // url → bundled file name
let bytes = 0;
const failed = [];
for (const [i, url] of urls.entries()) {
  const file = name(url);
  const out = path.join(OUT_DIR, file);
  if (!fs.existsSync(out)) {
    if (report) continue;
    const original = path.join(CACHE, file.replace(/\.jpg$/, ""));
    try {
      if (!fs.existsSync(original)) {
        const res = await get(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        fs.writeFileSync(original, Buffer.from(await res.arrayBuffer()));
        await sleep(250);
      }
      await sharp(original)
        .rotate()
        .resize({ width: WIDTH, withoutEnlargement: true })
        .jpeg({ quality: QUALITY, mozjpeg: true })
        .toFile(out);
    } catch (e) {
      failed.push(`${url} — ${e.message}`);
      continue;
    }
    if ((i + 1) % 20 === 0) console.log(`${i + 1}/${urls.length}`);
  }
  fetched.set(url, file);
  bytes += fs.statSync(out).size;
}

const credits = report ? {} : await commonsCredits(urls.filter((u) => !photos.get(u).credit));
/** Credits as a caption sets them: the photographer's name, not their user page or a catalogue's notes. */
function tidy(credit) {
  const [who, ...rest] = credit.split(" · ");
  let name = who.replace(/^User:/, "").replace(/^(Unknown author)+$/i, "Unknown").trim();
  if (/Carol M\. Highsmith/.test(name)) name = "Carol M. Highsmith";
  const assumed = name.match(/^No machine-readable author provided\. (\S+?)~\S* assumed/);
  if (assumed) name = assumed[1];
  if (/^(related names:|unknown( \/ uncredited)? photographer|author$)/i.test(name)) name = "Unknown";
  return [name, ...rest].join(" · ");
}
const creditOf = (u) => tidy(photos.get(u).credit ?? credits[u] ?? otherCredit(u));

// Prints no longer in the guide are dropped.
const keep = new Set(fetched.values());
for (const f of fs.readdirSync(OUT_DIR)) if (f.startsWith("p-") && !keep.has(f)) fs.unlinkSync(path.join(OUT_DIR, f));

if (!report) {
  const lines = [...fetched].map(
    ([url, file]) => `  ${JSON.stringify(url)}: { image: require("../assets/photos/${file}"), credit: ${JSON.stringify(creditOf(url))} },`,
  );
  fs.writeFileSync(
    MODULE,
    `// AUTO-GENERATED by scripts/bundle-photos.mjs — do not edit.\n` +
      `/* eslint-disable @typescript-eslint/no-require-imports */\n` +
      `import type { ImageRequireSource } from "react-native";\n\n` +
      `/** Every photograph in the guide, printed into the app: its URL → the bundled print and its credit. */\n` +
      `export const BUNDLED_PHOTOS: Record<string, { image: ImageRequireSource; credit: string }> = {\n` +
      lines.join("\n") +
      `\n};\n`,
  );
}

console.log(`${fetched.size}/${urls.length} photographs bundled, ${(bytes / 1e6).toFixed(1)} MB`);
if (failed.length) console.log(`failed:\n  ${failed.join("\n  ")}`);
const unlicensed = urls.filter((u) => !commonsTitle(u));
console.log(`${unlicensed.length} not from Commons (check the rights): ${[...new Set(unlicensed.map((u) => new URL(u).host))].join(", ")}`);
