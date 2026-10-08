/**
 * An uploaded photograph, printed the way scripts/bundle-photos.mjs prints
 * the guide's others: turned upright by its EXIF, 960px wide at most (never
 * enlarged), JPEG through mozjpeg. The print is named for its own bytes, so
 * the same photograph uploaded twice is one file.
 */
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sharp, { type Metadata, type OutputInfo } from "sharp";

export const PRINT_WIDTH = 960;
const QUALITY = 62;
/** Below this the print would be too small to be worth having. */
const MIN_WIDTH = 240;
/** Below this it prints, but softly. */
const SOFT_WIDTH = 800;
export const MAX_UPLOAD_BYTES = 30_000_000;

export type Print = { file: string; buffer: Buffer; width: number; height: number; warning?: string };

/** The `ftyp` brands an iPhone's HEIC photographs carry. */
function isHeic(b: Buffer) {
  return b.length > 12 && b.toString("latin1", 4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|mif1|msf1)/.test(b.toString("latin1", 8, 12));
}

const NO_HEIC = "That is a HEIC photograph, which the editor couldn't read. In Photos, export it as a JPEG (File → Export) and upload that.";

/** An iPhone's own format. sharp here can't read it, but macOS can: its sips turns it into a JPEG, keeping the orientation. */
async function fromHeic(input: Buffer): Promise<Buffer> {
  if (process.platform !== "darwin") throw new Error(NO_HEIC);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "heic-"));
  const [from, to] = [path.join(dir, "in.heic"), path.join(dir, "out.jpg")];
  try {
    await fs.writeFile(from, input);
    await new Promise<void>((resolve, reject) =>
      execFile("/usr/bin/sips", ["-s", "format", "jpeg", "-s", "formatOptions", "95", from, "--out", to], { timeout: 60_000 }, (e) => (e ? reject(e) : resolve())),
    );
    return await fs.readFile(to);
  } catch {
    throw new Error(NO_HEIC);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

export async function makePrint(original: Buffer): Promise<Print> {
  const input = isHeic(original) ? await fromHeic(original) : original;
  let out: { data: Buffer; info: OutputInfo };
  let source: Metadata;
  try {
    source = await sharp(input).metadata();
    out = await sharp(input)
      .rotate()
      // A transparent PNG would print black.
      .flatten({ background: "#ffffff" })
      .resize({ width: PRINT_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new Error("That file couldn't be read as a photograph. JPEG, PNG, WebP and AVIF work.");
  }
  const { width, height } = out.info;
  // Orientation 5-8 turns the picture on its side; the print is upright, so measure that.
  const sideways = (source.orientation ?? 1) >= 5;
  const shown = (sideways ? source.height : source.width) ?? width;
  if (shown < MIN_WIDTH) throw new Error(`That photograph is only ${shown} px wide; it needs to be at least ${MIN_WIDTH}.`);
  const file = `u-${crypto.createHash("sha1").update(out.data).digest("hex").slice(0, 12)}.jpg`;
  return {
    file,
    buffer: out.data,
    width,
    height,
    ...(shown < SOFT_WIDTH ? { warning: `It is small (${shown} px wide) and will look soft; ${PRINT_WIDTH} px is best.` } : {}),
  };
}
