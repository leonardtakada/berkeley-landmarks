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
};

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
  bldTop: INKS.slip,
  bldLit: INKS.paper,
  bldShade: INKS.blueTint,
  roofLit: INKS.blueTint2,
  roofShade: INKS.blueTint,
  lmTop: INKS.vermilionTint,
  lmLit: INKS.paper,
  lmShade: INKS.vermilion,
  lmRoofLit: INKS.blue,
  lmRoofShade: INKS.blueShade,
  lmWindowLit: INKS.blueTint,
  lmWindowShade: INKS.vermilionTint,
};

/** A terrace's top, alternating papers so each sheet reads against the next. */
export function topColor(level: number | undefined): string {
  return level !== undefined && level % 2 ? INKS.ground2 : INKS.ground;
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

export function paint(ctx: SKRSContext2D, pieces: Piece[], f: Frame, palette = PALETTE) {
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const p of pieces) {
    const color = p.role === "top" ? topColor(p.kind === "poly" ? p.level : undefined) : palette[p.role];
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
