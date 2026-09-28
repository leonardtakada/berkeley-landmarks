// A drawing kit for the book's flat, cut-paper prints after Showa Modern:
// shapes as SVG markup in the two inks, their tints, charcoal and the paper.
// Pure string-building, shared by the baked art (scripts/build-print-art.ts)
// and the plates drawn at run time (lib/building-plate.ts).

/** The press: two inks, their tints, charcoal, and the paper. */
export const B = "#0B2E8C";
export const BT = "#C9D0E4";
export const V = "#E4592B";
export const VT = "#F4CDB9";
export const C = "#2E2A27";
export const P = "#FDFAF2";

export const n = (v: number) => +v.toFixed(2);

export const rect = (x: number, y: number, w: number, h: number) =>
  `M${n(x)} ${n(y)} H${n(x + w)} V${n(y + h)} H${n(x)} Z `;

export const fill = (d: string, color: string) => `<path d="${d.trim()}" fill="${color}"/>`;

export const stroke = (d: string, color: string, w: number, cap: "butt" | "round" = "butt") =>
  `<path d="${d.trim()}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="${cap}" stroke-linejoin="round"/>`;

export const disc = (cx: number, cy: number, r: number, color: string) =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${color}"/>`;

export const oval = (cx: number, cy: number, rx: number, ry: number, color: string) =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${color}"/>`;

/** A grid of window lights as one path. */
export function grid(x0: number, y0: number, cols: number, rows: number, w: number, h: number, dx: number, dy: number) {
  let d = "";
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) d += rect(x0 + i * dx, y0 + j * dy, w, h);
  return d;
}

/** A round-headed opening (no arcs: the wobble would break their flags). */
export function archD(x: number, y: number, w: number, h: number) {
  const r = w / 2;
  const k = 0.5523 * r;
  return (
    `M${n(x)} ${n(y + h)} V${n(y + r)} C${n(x)} ${n(y + r - k)} ${n(x + r - k)} ${n(y)} ${n(x + r)} ${n(y)} ` +
    `C${n(x + r + k)} ${n(y)} ${n(x + w)} ${n(y + r - k)} ${n(x + w)} ${n(y + r)} V${n(y + h)} Z `
  );
}

/** A pointed (lancet) opening. */
export function lancetD(x: number, y: number, w: number, h: number) {
  return (
    `M${n(x)} ${n(y + h)} V${n(y + w * 0.9)} C${n(x)} ${n(y + w * 0.35)} ${n(x + w * 0.3)} ${n(y + w * 0.1)} ${n(x + w / 2)} ${n(y)} ` +
    `C${n(x + w * 0.7)} ${n(y + w * 0.1)} ${n(x + w)} ${n(y + w * 0.35)} ${n(x + w)} ${n(y + w * 0.9)} V${n(y + h)} Z `
  );
}

/** Rows of short dashes: water, furrows, shingles. */
export function dashes(
  x0: number,
  x1: number,
  y0: number,
  rows: number,
  dy: number,
  len: number,
  gap: number,
  stagger = true,
) {
  let d = "";
  for (let j = 0; j < rows; j++) {
    const off = stagger && j % 2 ? (len + gap) / 2 : 0;
    for (let x = x0 + off; x + len <= x1; x += len + gap) d += `M${n(x)} ${n(y0 + j * dy)} h${len} `;
  }
  return d;
}

/** A tree as the labels cut them: a round crown on a straight trunk. */
export function roundTree(cx: number, base: number, r: number, crown: string, trunk: string) {
  return fill(rect(cx - 1.6, base - r * 1.6, 3.2, r * 1.6), trunk) + disc(cx, base - r * 1.7, r, crown);
}

/** An oak: a cloud of three crowns on a short trunk. */
export function oakTree(cx: number, base: number, r: number, crown: string, trunk: string) {
  return (
    fill(rect(cx - 2.2, base - r * 1.4, 4.4, r * 1.4), trunk) +
    disc(cx - r * 0.7, base - r * 1.5, r * 0.8, crown) +
    disc(cx + r * 0.75, base - r * 1.55, r * 0.75, crown) +
    disc(cx, base - r * 2.1, r, crown)
  );
}

/** A cypress: a tall pointed flame. */
export function cypressD(cx: number, base: number, h: number, w: number) {
  return (
    `M${n(cx)} ${n(base - h)} C${n(cx + w * 0.62)} ${n(base - h * 0.62)} ${n(cx + w * 0.55)} ${n(base - h * 0.08)} ${n(cx + w * 0.18)} ${n(base)} ` +
    `H${n(cx - w * 0.18)} C${n(cx - w * 0.55)} ${n(base - h * 0.08)} ${n(cx - w * 0.62)} ${n(base - h * 0.62)} ${n(cx)} ${n(base - h)} Z `
  );
}

/** A redwood: a straight trunk hung with drooping tiers. */
export function redwood(cx: number, base: number, h: number, span: number, trunkColor: string, foliage: string) {
  const out = fill(rect(cx - 3, base - h, 6, h), trunkColor);
  let d = "";
  const tiers = 6;
  for (let i = 0; i < tiers; i++) {
    const y = base - h + 10 + i * ((h * 0.72) / tiers);
    const s = span * (0.35 + (0.65 * i) / (tiers - 1));
    d +=
      `M${n(cx)} ${n(y - 6)} C${n(cx + s * 0.5)} ${n(y - 4)} ${n(cx + s)} ${n(y + 4)} ${n(cx + s)} ${n(y + 9)} ` +
      `C${n(cx + s * 0.6)} ${n(y + 6)} ${n(cx + s * 0.3)} ${n(y + 6)} ${n(cx)} ${n(y + 6)} ` +
      `C${n(cx - s * 0.3)} ${n(y + 6)} ${n(cx - s * 0.6)} ${n(y + 6)} ${n(cx - s)} ${n(y + 9)} ` +
      `C${n(cx - s)} ${n(y + 4)} ${n(cx - s * 0.5)} ${n(y - 4)} ${n(cx)} ${n(y - 6)} Z `;
  }
  return out + fill(d, foliage);
}

/** A palm: a leaning trunk and a spray of cut-leaf fronds. */
export function palm(cx: number, base: number, h: number, color: string) {
  const tx = cx + h * 0.12;
  const ty = base - h;
  const frond = (dx: number, dy: number) => {
    const lift = Math.abs(dx) * 0.3 + 4;
    return (
      `M${n(tx)} ${n(ty - 2)} C${n(tx + dx * 0.35)} ${n(ty - lift - 3)} ${n(tx + dx * 0.8)} ${n(ty + dy * 0.1 - 4)} ${n(tx + dx)} ${n(ty + dy)} ` +
      `C${n(tx + dx * 0.7)} ${n(ty + dy * 0.2 + 1)} ${n(tx + dx * 0.35)} ${n(ty - lift * 0.5 + 3)} ${n(tx)} ${n(ty + 3)} Z `
    );
  };
  return (
    stroke(`M${n(cx)} ${n(base)} C${n(cx + h * 0.02)} ${n(base - h * 0.5)} ${n(tx - h * 0.02)} ${n(ty + h * 0.3)} ${n(tx)} ${n(ty)}`, color, 3.4) +
    fill(
      frond(-h * 0.36, h * 0.16) + frond(h * 0.38, h * 0.18) + frond(-h * 0.24, h * 0.32) + frond(h * 0.26, h * 0.32) + frond(-h * 0.06, -h * 0.16) + frond(h * 0.12, -h * 0.14),
      color,
    )
  );
}

/** A seeded generator (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable seed from a string. */
export function seedOf(s: string, salt = 7) {
  let h = salt;
  for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return h >>> 0;
}

/**
 * The slight irregularity of a hand-cut edge on every path coordinate.
 * (Path data only — circles and ellipses stay true.)
 */
export function wobble(svg: string, r: () => number, amount = 0.45) {
  return svg.replace(/ d="([^"]+)"/g, (_, d: string) => {
    const wobbled = d.replace(/-?\d+(\.\d+)?/g, (v) =>
      (parseFloat(v) + (r() - 0.5) * amount).toFixed(2).replace(/\.?0+$/, ""),
    );
    return ` d="${wobbled}"`;
  });
}
