/**
 * The guide on disk: reads data/landmarks.ts, data/tours.ts and
 * data/landmarks.json, and saves an edit to them.
 *
 * Every save backs up the files it changes (scripts/.cache/editor-backups),
 * writes each through a temporary file, then reads the data back the way the
 * app does and checks the edit is what's there — if not, the backup goes
 * back and the save fails. The app's data is the source: the JSON follows it.
 */
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import { CATEGORY_COLORS, CATEGORY_LABELS, type Landmark } from "../../data/landmarks";
import type { Tour } from "../../data/tours";
import {
  CATEGORIES,
  DESIGNATIONS,
  applyTour,
  checkLandmark,
  checkTour,
  cleanLandmark,
  cleanTour,
  differences,
  dropBlock,
  dropJson,
  fromJson,
  highestNumber,
  isUpload,
  joinBlocks,
  landmarkBlock,
  nextLandmarkId,
  nextTourId,
  parseJson,
  printJson,
  printUploads,
  putBlock,
  putJson,
  routeProblems,
  splitBlocks,
  twinsOf,
  tourBlock,
  uploadFile,
  uploadUrl,
  type Blocks,
  type JsonEntry,
  type Twin,
  type UploadFacts,
  type Uploads,
} from "./store";
import { MAX_UPLOAD_BYTES, makePrint } from "./photos";

const LANDMARKS_TS = "data/landmarks.ts";
const LANDMARKS_JSON = "data/landmarks.json";
const TOURS_TS = "data/tours.ts";
const PHOTOS_MODULE = "lib/photos.generated.ts";
const UPLOADS_JSON = "data/photo-uploads.json";
const PRINTS = "assets/photos";
/** Uploaded prints wait here until the landmark they're for is saved. */
const STAGING = "scripts/.cache/editor-uploads";
/** Originals are kept where scripts/bundle-photos.mjs keeps what it fetched. */
const ORIGINALS = "scripts/.cache/photos";
const BACKUPS = "scripts/.cache/editor-backups";
const KEEP_BACKUPS = 40;

const LM_MARKER = "export const landmarks: Landmark[] = [\n";
const TOUR_MARKER = "export const tours: Tour[] = [\n";

/** Something the person editing can put right: shown to them as it is. */
export class Refusal extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

// The files are TypeScript; the editor runs under tsx, which loads them.
function load<T>(file: string): T {
  const key = require.resolve(file);
  delete require.cache[key];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(file) as T;
}

export type TourView = Tour & { problems: string[] };

export type Snapshot = {
  landmarks: Landmark[];
  /** In landmarks.json but not in the app's data, and the places in the app they may be copies of. */
  jsonOnly: (Landmark & { twins: Twin[] })[];
  /** In both, but not the same. `json` is the JSON's entry. */
  drift: { id: string; fields: string[]; json: Landmark }[];
  tours: TourView[];
  /** Photographs the app doesn't carry yet (scripts/bundle-photos.mjs prints them in). */
  unbundled: { landmarkId: string; url: string }[];
  categories: { key: string; label: string; color: string }[];
  designations: readonly string[];
  nextId: string;
  /** Who took each uploaded photograph. */
  uploads: Uploads;
  /** The highest city landmark number in the guide, for the hint beside the field. */
  highestNumber: number;
};

type Disk = {
  landmarks: Landmark[];
  tours: Tour[];
  lmParts: Blocks;
  tourParts: Blocks;
  json: JsonEntry[];
};

export class Guide {
  constructor(readonly root: string) {}

  private path = (rel: string) => path.join(this.root, rel);
  private read = (rel: string) => fs.readFileSync(this.path(rel), "utf8");

  /** The three files as they are now, checked to be laid out as the editor expects. */
  private disk(): Disk {
    const landmarks = load<{ landmarks: Landmark[] }>(this.path(LANDMARKS_TS)).landmarks;
    const tours = load<{ tours: Tour[] }>(this.path(TOURS_TS)).tours;
    const lmParts = splitBlocks(this.read(LANDMARKS_TS), LM_MARKER);
    const tourParts = splitBlocks(this.read(TOURS_TS), TOUR_MARKER);
    const same = (a: { id: string }[], b: { id: string }[]) => isDeepStrictEqual(a.map((x) => x.id), b.map((x) => x.id));
    if (!same(lmParts.blocks, landmarks) || !same(tourParts.blocks, tours)) {
      throw new Refusal(
        "The data files aren't laid out as the editor expects, so it won't change them. Run the data checks, or edit them by hand.",
      );
    }
    return { landmarks, tours, lmParts, tourParts, json: parseJson(this.read(LANDMARKS_JSON)) };
  }

  snapshot(): Snapshot {
    const d = this.disk();
    const json = d.json.map(fromJson);
    const inApp = new Set(d.landmarks.map((l) => l.id));
    const drift = d.landmarks.flatMap((l) => {
      const j = json.find((x) => x.id === l.id);
      const fields = j ? differences(l, j) : [];
      return j && fields.length ? [{ id: l.id, fields, json: j }] : [];
    });

    const bundled = new Set<string>();
    try {
      for (const m of this.read(PHOTOS_MODULE).matchAll(/^ {2}"(.+?)": \{ image:/gm)) bundled.add(m[1]);
    } catch {
      /* no module yet: nothing is bundled */
    }
    const unbundled = d.landmarks.flatMap((l) =>
      [l.photoUrl, ...(l.photos ?? []).map((p) => p.url)]
        .filter((u): u is string => !!u && !bundled.has(u))
        .map((url) => ({ landmarkId: l.id, url })),
    );

    return {
      landmarks: d.landmarks,
      jsonOnly: json.filter((l) => !inApp.has(l.id)).map((l) => ({ ...l, twins: twinsOf(l, d.landmarks) })),
      drift,
      tours: d.tours.map((t) => ({ ...t, problems: routeProblems(t, d.landmarks) })),
      unbundled,
      categories: CATEGORIES.map((key) => ({ key, label: CATEGORY_LABELS[key], color: CATEGORY_COLORS[key] })),
      designations: DESIGNATIONS,
      nextId: nextLandmarkId([...d.landmarks.map((l) => l.id), ...d.json.map((e) => e.id)]),
      uploads: this.uploads(),
      highestNumber: highestNumber(d.landmarks),
    };
  }

  // -- photographs ----------------------------------------------------------

  private uploads(): Uploads {
    try {
      return JSON.parse(this.read(UPLOADS_JSON));
    } catch {
      return {};
    }
  }

  /** Where an uploaded print is: in the app's prints, or waiting to be. */
  photoPath(file: string): string | undefined {
    if (!/^[up]-[0-9a-f]{12}\.jpg$/.test(file)) return undefined;
    return [PRINTS, STAGING].map((dir) => this.path(path.join(dir, file))).find((f) => fs.existsSync(f));
  }

  /** Prints an uploaded photograph and holds it until its landmark is saved. */
  async stageUpload(base64: string) {
    const original = Buffer.from(base64, "base64");
    if (!original.length) throw new Refusal("That file was empty");
    if (original.length > MAX_UPLOAD_BYTES) throw new Refusal(`That file is ${(original.length / 1e6).toFixed(0)} MB; the most is ${MAX_UPLOAD_BYTES / 1e6} MB`);
    let print;
    try {
      print = await makePrint(original);
    } catch (e) {
      throw new Refusal(e instanceof Error ? e.message : String(e));
    }
    if (!this.photoPath(print.file)) {
      fs.mkdirSync(this.path(STAGING), { recursive: true });
      fs.writeFileSync(this.path(path.join(STAGING, print.file)), print.buffer);
    }
    const kept = this.path(path.join(ORIGINALS, print.file.replace(/\.jpg$/, "")));
    if (!fs.existsSync(kept)) {
      fs.mkdirSync(path.dirname(kept), { recursive: true });
      fs.writeFileSync(kept, original);
    }
    return { url: uploadUrl(print.file), width: print.width, height: print.height, bytes: print.buffer.length, ...(print.warning ? { warning: print.warning } : {}) };
  }

  // -- landmarks ------------------------------------------------------------

  saveLandmark(raw: unknown, mode: "create" | "update") {
    const d = this.disk();
    const l = cleanLandmark(raw);
    // Credits for uploaded photographs: a gallery row's own, else what the form sent for the lead.
    const sent = ((raw as { credits?: Record<string, unknown> } | null)?.credits ?? {}) as Record<string, unknown>;
    const stored = this.uploads();
    const credit = (url: string) =>
      ((l.photos ?? []).find((p) => p.url === url)?.credit || (typeof sent[url] === "string" ? (sent[url] as string).trim() : "") || stored[url]?.credit || "").trim() || undefined;
    const facts: UploadFacts = { has: (file) => !!this.photoPath(file), credit };
    const known = d.landmarks.some((x) => x.id === l.id);
    if (mode === "create") {
      // A place that's only in the JSON keeps its id when it's added to the app.
      if (!l.id) l.id = nextLandmarkId([...d.landmarks.map((x) => x.id), ...d.json.map((e) => e.id)]);
      if (known) throw new Refusal(`${l.id} is already in use`);
    } else if (!known) {
      throw new Refusal(`${l.id} isn't in the guide`);
    }
    const { errors, warnings } = checkLandmark(l, d.landmarks, facts);
    if (errors.length) throw new Refusal("That can't be saved yet", errors);

    // Uploaded prints join the app's, with who took them.
    const photoUrls = [l.photoUrl, ...(l.photos ?? []).map((p) => p.url)].filter((u): u is string => !!u && isUpload(u));
    const uploads: Uploads = { ...stored };
    const copies: [string, string][] = [];
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    for (const url of photoUrls) {
      const file = uploadFile(url)!;
      uploads[url] = { credit: credit(url)!, added: stored[url]?.added ?? today };
      const waiting = this.path(path.join(STAGING, file));
      if (fs.existsSync(waiting) && !fs.existsSync(this.path(path.join(PRINTS, file)))) copies.push([waiting, this.path(path.join(PRINTS, file))]);
    }
    const uploadsChanged = !isDeepStrictEqual(uploads, stored);

    const before = d.landmarks.find((x) => x.id === l.id);
    const photoFields = (x?: Landmark) => [x?.photoUrl, x?.photos ?? []];
    const photosChanged = uploadsChanged || !isDeepStrictEqual(photoFields(before), photoFields(l));

    this.commit(
      {
        [LANDMARKS_TS]: joinBlocks(putBlock(d.lmParts, l.id, landmarkBlock(l))),
        [LANDMARKS_JSON]: printJson(putJson(d.json, l)),
        ...(uploadsChanged ? { [UPLOADS_JSON]: printUploads(uploads) } : {}),
      },
      () => {
        const back = this.disk().landmarks.find((x) => x.id === l.id);
        if (!back || !isDeepStrictEqual(cleanLandmark(back), l)) throw new Error("It didn't read back the same");
      },
      copies,
    );
    for (const [from] of copies) fs.rmSync(from, { force: true });
    return { landmark: l, warnings, photosChanged };
  }

  deleteLandmark(id: string) {
    const d = this.disk();
    if (!d.landmarks.some((l) => l.id === id)) throw new Refusal(`${id} isn't in the guide`);
    const used = d.tours.filter((t) => t.stops.some((s) => s.landmarkId === id)).map((t) => t.name);
    if (used.length) throw new Refusal(`It is a stop on ${used.join(", ")}. Take it out of ${used.length > 1 ? "those walks" : "that walk"} first.`);
    this.commit(
      {
        [LANDMARKS_TS]: joinBlocks(dropBlock(d.lmParts, id)),
        [LANDMARKS_JSON]: printJson(dropJson(d.json, id)),
      },
      () => {
        if (this.disk().landmarks.some((x) => x.id === id)) throw new Error("It's still there");
      },
    );
  }

  /** Brings entries that are only in landmarks.json into the app's data. */
  importLandmarks(ids: string[]) {
    const d = this.disk();
    const inApp = new Set(d.landmarks.map((l) => l.id));
    let parts = d.lmParts;
    const added: Landmark[] = [];
    const skipped: string[] = [];
    for (const id of ids) {
      const entry = d.json.find((e) => e.id === id);
      if (!entry || inApp.has(id)) continue;
      const l = fromJson(entry);
      const { errors } = checkLandmark(l, d.landmarks);
      if (errors.length) {
        skipped.push(`${l.name || id}: ${errors.join("; ")}`);
        continue;
      }
      parts = putBlock(parts, l.id, landmarkBlock(l));
      added.push(l);
    }
    if (!added.length) throw new Refusal("Nothing could be added", skipped);
    this.commit({ [LANDMARKS_TS]: joinBlocks(parts) }, () => {
      const back = this.disk().landmarks;
      for (const l of added) {
        const got = back.find((x) => x.id === l.id);
        if (!got || !isDeepStrictEqual(cleanLandmark(got), l)) throw new Error(`${l.id} didn't read back the same`);
      }
    });
    return { added: added.map((l) => l.id), skipped };
  }

  // -- tours ----------------------------------------------------------------

  saveTour(raw: unknown, mode: "create" | "update") {
    const d = this.disk();
    const input = cleanTour(raw);
    const old = d.tours.find((t) => t.id === input.id);
    if (mode === "create") {
      input.id = nextTourId(input.name, d.tours.map((t) => t.id));
    } else if (!old) {
      throw new Refusal(`${input.id} isn't in the guide`);
    }
    const { errors } = checkTour(input, d.landmarks);
    if (errors.length) throw new Refusal("That can't be saved yet", errors);

    const tour = applyTour(input, mode === "update" ? old : undefined, d.landmarks);
    this.commit({ [TOURS_TS]: joinBlocks(putBlock(d.tourParts, tour.id, tourBlock(tour))) }, () => {
      const back = this.disk().tours.find((t) => t.id === tour.id);
      if (!back || !isDeepStrictEqual(back, tour)) throw new Error("It didn't read back the same");
    });
    return { tour };
  }

  deleteTour(id: string) {
    const d = this.disk();
    if (!d.tours.some((t) => t.id === id)) throw new Refusal(`${id} isn't in the guide`);
    this.commit({ [TOURS_TS]: joinBlocks(dropBlock(d.tourParts, id)) }, () => {
      if (this.disk().tours.some((t) => t.id === id)) throw new Error("It's still there");
    });
  }

  // -- writing --------------------------------------------------------------

  /** Writes the new text of each file, undoing it all if the data doesn't read back as intended. */
  private commit(files: Record<string, string>, verify: () => void, copies: [from: string, to: string][] = []) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backup = this.path(path.join(BACKUPS, stamp));
    // A file this save creates has nothing to back up; undoing the save removes it.
    const existed = new Set(Object.keys(files).filter((rel) => fs.existsSync(this.path(rel))));
    for (const rel of existed) {
      fs.mkdirSync(path.dirname(path.join(backup, rel)), { recursive: true });
      fs.copyFileSync(this.path(rel), path.join(backup, rel));
    }
    try {
      for (const [from, to] of copies) {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
      }
      for (const [rel, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(this.path(rel)), { recursive: true });
        const tmp = `${this.path(rel)}.editing`;
        fs.writeFileSync(tmp, content);
        fs.renameSync(tmp, this.path(rel));
      }
      verify();
    } catch (e) {
      for (const rel of Object.keys(files)) {
        if (existed.has(rel)) fs.copyFileSync(path.join(backup, rel), this.path(rel));
        else fs.rmSync(this.path(rel), { force: true });
      }
      for (const [, to] of copies) fs.rmSync(to, { force: true });
      throw new Refusal(`Nothing was saved: ${e instanceof Error ? e.message : String(e)}`);
    }
    this.prune();
  }

  private prune() {
    const dir = this.path(BACKUPS);
    const all = fs.readdirSync(dir).sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) fs.rmSync(path.join(dir, old), { recursive: true, force: true });
  }
}
