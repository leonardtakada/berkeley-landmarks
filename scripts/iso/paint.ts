/**
 * Paints a scene of isometric pieces onto a canvas: the guide's two inks,
 * their tints and the papers, flat, each piece edged in its own colour so
 * no seams show between them.
 */
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";

import { iso } from "../../lib/iso";
import type { P3, Piece, Role } from "./scene";

export const INKS = {
  blue: "#0B2E8C",
  vermilion: "#E4592B",
  blueTint: "#C3CDE6",
  blueTint2: "#DDE3F1",
  vermilionTint: "#F3B69C",
  paper: "#F2F0E6",
  leaf: "#FAF6EC",
  slip: "#FDFAF2",
  charcoal: "#2B2A28",
  sepia: "#6E6252",
  /** The land: a pale tint of the blue, alternate terraces a shade deeper, their risers deeper still. */
  ground: "#DDE3F1",
  ground2: "#D5DCEC",
  terrace: "#9EAED6",
  /** A roof in shade, the blue a little screened. */
  blueShade: "#3A55A4",
  /** Red tile in shade: the vermilion with a little blue over it. */
  vermilionShade: "#BC4520",
  /** An ordinary building's flat roof: a step down from the street's paper. */
  roof: "#ECE8DB",
  /** A house's pitched roof, lit and in shade. */
  houseRoof: "#C9D1EA",
  houseRoofShade: "#AEBBDE",
  /** A building's shadow on the land (and on the alternate terrace, `shadow2`). */
  shadow: "#CBD3E9",
  shadow2: "#C3CBE3",
  /**
   * A touch of green, for the green alone — a sea green, with enough blue in
   * it to sit among the map's blues: a pale tint for lawns (`lawn2` on the
   * alternate terrace), a deeper one for hard courts, and a deep one for the
   * parks' and the wild hills' trees, lit with a lighter one.
   */
  lawn: "#CFE5DA",
  lawn2: "#C7DFD3",
  court: "#AFD3C3",
  green: "#2A7366",
  greenLit: "#4E9A8C",
};

/**
 * The trees as the city map, the walk plates and the icons print them: the
 * streets' and gardens' a soft blue, the green's a soft sea green, each with
 * the lighter tint its lit side takes.
 */
export const SOFT_TREES = { trunk: "#7389C6", crown: "#7389C6", crownLit: "#9DAEDD", greenTrunk: "#4F9A8C", green: "#4F9A8C", greenLit: "#8CC4B6" };

export const PALETTE: Record<Role, string> = {
  water: INKS.blue,
  wave: INKS.blueTint,
  shore: INKS.paper,
  top: INKS.paper,
  wall: INKS.terrace,
  cutSouth: INKS.vermilion,
  cutWest: INKS.blueTint,
  cutLine: INKS.sepia,
  street: INKS.slip,
  path: INKS.blueTint2,
  trunk: INKS.blue,
  crown: INKS.blue,
  crownLit: INKS.blueShade,
  shadow: INKS.shadow,
  // A roof a step darker than the street beside it, so the blocks read; houses' roofs a tint of their own.
  bldTop: INKS.roof,
  bldLit: INKS.paper,
  bldShade: INKS.blueTint,
  roofLit: INKS.houseRoof,
  roofShade: INKS.houseRoofShade,
  lmTop: INKS.vermilionTint,
  lmLit: INKS.paper,
  lmShade: INKS.vermilion,
  // Slate: the screened blue where the light falls, the full blue in shade.
  lmRoofLit: INKS.blueShade,
  lmRoofShade: INKS.blue,
  lmWindowLit: INKS.blueTint,
  lmWindowShade: INKS.vermilionTint,
  lmBrickLit: INKS.vermilionTint,
  lmWindowBrick: INKS.paper,
  lmTileLit: INKS.vermilion,
  lmTileShade: INKS.vermilionShade,
  lmCopperLit: INKS.blueTint,
  lmCopperShade: INKS.terrace,
  lmOpen: INKS.blue,
  lmTrimLit: INKS.slip,
  lmTrimShade: INKS.vermilionTint,
  // Many slate roofs seen as one (over a plan too irregular for a roof of its own): a lighter blue than one slope.
  lmSlateDeck: "#7D90C9",
  lawn: INKS.lawn,
  court: INKS.court,
  chalk: INKS.slip,
  lake: INKS.blue,
  creek: INKS.blueShade,
  greenTrunk: INKS.green,
  green: INKS.green,
  greenLit: INKS.greenLit,
  grassMask: "transparent",
};

/** A lawn, alternating with its terrace's paper. */
export function lawnColor(level: number | undefined): string {
  return level !== undefined && level % 2 ? INKS.lawn2 : INKS.lawn;
}

/** A terrace's top, alternating papers so each sheet reads against the next. */
export function topColor(level: number | undefined): string {
  return level !== undefined && level % 2 ? INKS.ground2 : INKS.ground;
}

/** A shadow on a terrace: a step darker than its paper. */
export function shadowColor(level: number | undefined): string {
  return level !== undefined && level % 2 ? INKS.shadow2 : INKS.shadow;
}

export interface Frame {
  /** Pixels per metre of the drawing, and where the drawing's origin lands. */
  scale: number;
  x0: number;
  y0: number;
}

export const toPx = (f: Frame, [u, v, z]: P3) => {
  const p = iso(u, v, z);
  return [(p.x - f.x0) * f.scale, (f.y0 - p.y) * f.scale] as [number, number];
};

/** The frame that fits every piece into width × height, with a margin. */
export function fit(pieces: Piece[], width: number, height: number, margin = 0): Frame {
  let [xmin, xmax, ymin, ymax] = [Infinity, -Infinity, Infinity, -Infinity];
  const see = (p: P3) => {
    const q = iso(p[0], p[1], p[2]);
    [xmin, xmax, ymin, ymax] = [Math.min(xmin, q.x), Math.max(xmax, q.x), Math.min(ymin, q.y), Math.max(ymax, q.y)];
  };
  for (const p of pieces) {
    if (p.kind === "poly") p.rings.forEach((r) => r.forEach(see));
    else if (p.kind === "line") p.pts.forEach(see);
    else see(p.at);
  }
  const scale = Math.min((width - margin * 2) / (xmax - xmin), (height - margin * 2) / (ymax - ymin));
  return {
    scale,
    x0: xmin - (width / scale - (xmax - xmin)) / 2,
    y0: ymax + (height / scale - (ymax - ymin)) / 2,
  };
}

/** A colour mixed toward another: `w` 0 is the first, 1 the second. */
export function mix(a: string, b: string, w: number): string {
  const [p, q] = [a, b].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  return `#${p.map((x, i) => Math.round(x + (q[i] - x) * w).toString(16).padStart(2, "0")).join("")}`;
}

/** Paints the pieces in order, each in its role's colour — or as `tint` would have it, piece by piece. */
export function paint(ctx: SKRSContext2D, pieces: Piece[], f: Frame, palette = PALETTE, tint?: (p: Piece, color: string) => string) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const p of pieces) {
    // (Where the city map's grass grows: not drawn.)
    if (p.role === "grassMask") continue;
    const level = p.kind === "poly" ? p.level : undefined;
    const plain = p.role === "top" ? topColor(level) : p.role === "shadow" ? shadowColor(level) : p.role === "lawn" ? lawnColor(level) : palette[p.role];
    const color = tint ? tint(p, plain) : plain;
    if (p.kind === "poly") {
      ctx.beginPath();
      for (const r of p.rings) {
        r.forEach((pt, i) => {
          const [x, y] = toPx(f, pt);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.closePath();
      }
      ctx.fillStyle = color;
      ctx.fill("evenodd");
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    } else if (p.kind === "line") {
      ctx.beginPath();
      p.pts.forEach((pt, i) => {
        const [x, y] = toPx(f, pt);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.8, p.width * f.scale * (p.role === "street" ? 0.8 : 1));
      if (p.role === "wave") ctx.lineWidth = Math.max(1, 1.4 * Math.min(2, f.scale));
      ctx.stroke();
    } else if (p.kind === "flat") {
      const [x, y] = toPx(f, p.at);
      ctx.beginPath();
      for (const part of p.parts) {
        part.forEach(([dx, dy], i) => {
          if (i) ctx.lineTo(x + dx * f.scale, y - dy * f.scale);
          else ctx.moveTo(x + dx * f.scale, y - dy * f.scale);
        });
        ctx.closePath();
      }
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    } else {
      const [x, y] = toPx(f, p.at);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.2, p.r * f.scale), 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }
}

export function canvas(width: number, height: number, background?: string) {
  const c = createCanvas(width, height);
  const ctx = c.getContext("2d");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  return { c, ctx };
}
