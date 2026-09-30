import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { landmarks } from "../data/landmarks";

// The guide works with no signal: its photographs are printed into the app
// (scripts/bundle-photos.mjs) and its map is bundled. These check nothing of
// the guide's own is left to the network.

const root = path.join(__dirname, "..");
const generated = fs.readFileSync(path.join(root, "lib/photos.generated.ts"), "utf8");
const bundled = new Map(
  [...generated.matchAll(/^ {2}("[^\n]+?"): \{ image: require\("\.\.\/(assets\/photos\/[^"]+)"\), credit: ("[^\n]*?") \},$/gm)].map(
    (m) => [JSON.parse(m[1]) as string, { file: m[2], credit: JSON.parse(m[3]) as string }],
  ),
);

describe("offline", () => {
  it("prints every photograph of the guide into the app, credited", () => {
    const missing: string[] = [];
    for (const l of landmarks) {
      for (const url of [l.photoUrl, ...(l.photos ?? []).map((p) => p.url)]) {
        if (!url) continue;
        const b = bundled.get(url);
        if (!b) missing.push(`${l.id} ${url}`);
        else {
          expect(fs.existsSync(path.join(root, b.file)), b.file).toBe(true);
          expect(b.credit.trim(), url).not.toBe("");
        }
      }
    }
    expect(missing, "run node scripts/bundle-photos.mjs").toEqual([]);
  });

  it("keeps the prints small", () => {
    let bytes = 0;
    for (const { file } of bundled.values()) bytes += fs.statSync(path.join(root, file)).size;
    expect(bytes / bundled.size).toBeLessThan(150_000);
  });

  it("draws the maps from bundled tiles and type", () => {
    // The isometric city: its own bundled tiles, and the bundled glyphs.
    const isoStyle = fs.readFileSync(path.join(root, "lib/iso-style.ts"), "utf8");
    expect(isoStyle).toMatch(/url: source\.pmtilesUri/);
    expect(isoStyle).toMatch(/glyphs: source\.glyphsUrl/);
    expect(isoStyle).not.toMatch(/https?:\/\//);
    expect(fs.existsSync(path.join(root, "assets/map/iso.pmtiles"))).toBe(true);
    const view = fs.readFileSync(path.join(root, "components/maplibre-view.tsx"), "utf8");
    // The style's placeholder sources are swapped for the files in the app.
    expect(view).toMatch(/glyphs: uris\.glyphsUrl/);
    expect(view).toMatch(/pmtiles/);
    for (const style of ["paper-light.json", "paper-dark.json"]) {
      const json = JSON.parse(fs.readFileSync(path.join(root, "assets/map", style), "utf8"));
      expect(json.sprite, style).toBeUndefined();
      for (const [name, source] of Object.entries<{ url?: string; tiles?: string[] }>(json.sources)) {
        for (const u of [source.url, ...(source.tiles ?? [])].filter(Boolean)) {
          expect(u, `${style} ${name}`).toMatch(/^pmtiles:\/\//);
        }
      }
    }
  });
});
