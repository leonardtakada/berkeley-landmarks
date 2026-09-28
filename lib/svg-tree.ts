/**
 * A small reader for the guide's printed art (the baked SVG strings in
 * components/*.generated.ts), so that single parts of a drawing can move:
 * an architect's eyes and mouth, a walk label's sun. Parts that move are
 * marked in the art with `data-anim="…"`; everything else is drawn as it is.
 *
 * Paths that move are kept as templates — their numbers, each tagged as an x
 * or a y — so a worklet can shift, squash or morph them every frame without
 * parsing anything.
 */

export interface SvgNode {
  tag: string;
  attrs: Record<string, string>;
  children: SvgNode[];
}

const parsed = new Map<string, SvgNode>();

/** The drawing as a tree of elements (cached: the art is a fixed set of strings). */
export function parseSvg(xml: string): SvgNode {
  const hit = parsed.get(xml);
  if (hit) return hit;
  const root: SvgNode = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const tagRe = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  for (let m = tagRe.exec(xml); m; m = tagRe.exec(xml)) {
    const [whole, closing, tag, rawAttrs, selfClosing] = m;
    if (whole.startsWith("<!--")) continue;
    if (closing) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of (rawAttrs ?? "").matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const node: SvgNode = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  const svg = root.children.find((c) => c.tag === "svg") ?? root;
  parsed.set(xml, svg);
  return svg;
}

/**
 * A path's numbers, each tagged: `x`/`y` absolute coordinates, `X`/`Y`
 * relative ones, `c` a command letter. `cy` is the middle of its y's (the line
 * an eye closes onto).
 */
export interface PathTemplate {
  t: (string | number)[];
  r: string;
  cy: number;
}

// What each command's arguments are, in order (arcs aren't used in the art:
// the hand-cut wobble would break their flags).
const ARGS: Record<string, string> = { M: "xy", L: "xy", T: "xy", H: "x", V: "y", C: "xyxyxy", S: "xyxy", Q: "xyxy", Z: "" };

const templates = new Map<string, PathTemplate>();

export function pathTemplate(d: string): PathTemplate {
  const hit = templates.get(d);
  if (hit) return hit;
  const t: (string | number)[] = [];
  let r = "";
  let args = "";
  let rel = false;
  let at = 0;
  for (const m of d.matchAll(/([MmLlHhVvCcSsQqTtZzAa])|(-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?)/g)) {
    if (m[1]) {
      const cmd = m[1].toUpperCase();
      if (cmd === "A") throw new Error("pathTemplate: arcs aren't supported");
      t.push(m[1]);
      r += "c";
      args = ARGS[cmd];
      rel = m[1] !== cmd;
      at = 0;
      continue;
    }
    if (!args) throw new Error(`pathTemplate: a number with no command in "${d}"`);
    const role = args[at % args.length];
    t.push(parseFloat(m[2]));
    r += rel ? role.toUpperCase() : role;
    at++;
  }
  const ys = t.filter((_, i) => r[i] === "y") as number[];
  const tpl = { t, r, cy: ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0 };
  templates.set(d, tpl);
  return tpl;
}

/** Whether two paths can be morphed into each other, number for number. */
export function morphable(a: PathTemplate, b: PathTemplate) {
  return a.r === b.r && a.t.every((v, i) => typeof v === "number" || v === b.t[i]);
}

/**
 * Draws a template, optionally part-way (`k`) to another of the same shape,
 * shifted by (dx, dy) and squashed vertically by `sy` about its middle.
 */
export function drawPath(
  a: PathTemplate,
  b: PathTemplate | null,
  k: number,
  dx: number,
  dy: number,
  sy: number,
): string {
  "worklet";
  let out = "";
  for (let i = 0; i < a.t.length; i++) {
    const role = a.r[i];
    const v = a.t[i];
    if (i) out += " ";
    if (role === "c") {
      out += v;
      continue;
    }
    let n = v as number;
    if (b && k !== 0) n += ((b.t[i] as number) - n) * k;
    if (role === "x") n += dx;
    else if (role === "y") n = a.cy + (n - a.cy) * sy + dy;
    else if (role === "Y") n *= sy;
    out += Math.round(n * 100) / 100;
  }
  return out;
}

/**
 * How far past its drawn smile a mouth goes (components/architect-portrait.tsx
 * shows the smile at this reach).
 */
export const SMILE_REACH = 1.5;

/**
 * One sheet of a drawing printed as a stack: the elements of one stretch of
 * the drawing, in their groups (clip paths) and with the drawing's defs.
 * `role` is the moving part it holds, or null for scenery. `box` is the part
 * of the drawing it covers ([x, y, width, height] in the drawing's units), so
 * a small sheet — a pair of eyes — prints small.
 */
export interface Sheet {
  role: string | null;
  root: SvgNode;
  box: [number, number, number, number];
}

const stacked = new Map<string, Sheet[]>();

/**
 * A drawing split into sheets that stack back into it: each run of moving
 * parts of one kind (both eyes, the brows, the mouth, a sun) on a sheet of
 * its own, and the scenery between them on sheets of their own. A moving
 * sheet can then be moved as a whole — slid, squashed, faded — without
 * drawing anything again. Parts in `roam` move within their sheet (a sun
 * across the sky) and so are given the whole drawing's box.
 */
export function splitSheets(xml: string, roam: string[] = ["sky", "cloud"]): Sheet[] {
  const cacheKey = `${roam.join(",")}|${xml}`;
  const hit = stacked.get(cacheKey);
  if (hit) return hit;
  const root = parseSvg(xml);
  const [vx, vy, vw, vh] = (root.attrs.viewBox ?? "0 0 200 240").split(/[\s,]+/).map(Number);
  const whole: Sheet["box"] = [vx, vy, vw, vh];
  const defs: SvgNode[] = [];
  const leaves: { node: SvgNode; groups: SvgNode[] }[] = [];
  const walk = (node: SvgNode, groups: SvgNode[]) => {
    for (const c of node.children) {
      if (c.tag === "defs") defs.push(c);
      else if (c.tag === "g" && !c.attrs["data-anim"]) walk(c, [...groups, c]);
      else leaves.push({ node: c, groups });
    }
  };
  walk(root, []);

  const sheets: Sheet[] = [];
  let run: typeof leaves = [];
  let runRole: string | null = null;
  const flush = () => {
    if (!run.length) return;
    const top: SvgNode = { tag: root.tag, attrs: root.attrs, children: [...defs] };
    const copies = new Map<SvgNode, SvgNode>();
    for (const { node, groups } of run) {
      let parent = top;
      for (const g of groups) {
        let copy = copies.get(g);
        if (!copy || parent.children[parent.children.length - 1] !== copy) {
          copy = { tag: g.tag, attrs: g.attrs, children: [] };
          parent.children.push(copy);
          copies.set(g, copy);
        }
        parent = copy;
      }
      parent.children.push(node);
    }
    const box = runRole && roam.includes(runRole) ? whole : boundsOf(run.map((l) => l.node), whole);
    sheets.push({ role: runRole, root: top, box });
    run = [];
  };
  for (const leaf of leaves) {
    const role = leaf.node.attrs["data-anim"] ?? null;
    if (role !== runRole) flush();
    runRole = role;
    run.push(leaf);
  }
  flush();
  stacked.set(cacheKey, sheets);
  return sheets;
}

/** The box a few elements cover (with room for their strokes), or `whole` if it can't be told. */
function boundsOf(nodes: SvgNode[], whole: Sheet["box"]): Sheet["box"] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const take = (x: number, y: number, pad: number) => {
    x0 = Math.min(x0, x - pad);
    y0 = Math.min(y0, y - pad);
    x1 = Math.max(x1, x + pad);
    y1 = Math.max(y1, y + pad);
  };
  const visit = (n: SvgNode): boolean => {
    const a = n.attrs;
    const pad = (parseFloat(a["stroke-width"] ?? "0") || 0) / 2 + 1.5;
    if (n.tag === "g") return n.children.every(visit);
    if (n.tag === "circle" || n.tag === "ellipse") {
      const rx = parseFloat(a.rx ?? a.r);
      const ry = parseFloat(a.ry ?? a.r);
      take(parseFloat(a.cx) - rx, parseFloat(a.cy) - ry, pad);
      take(parseFloat(a.cx) + rx, parseFloat(a.cy) + ry, pad);
      return true;
    }
    if (n.tag === "rect") {
      take(parseFloat(a.x), parseFloat(a.y), pad);
      take(parseFloat(a.x) + parseFloat(a.width), parseFloat(a.y) + parseFloat(a.height), pad);
      return true;
    }
    if (n.tag === "path" && a.d) {
      const shapes = [pathTemplate(a.d)];
      if (a["data-smile"]) {
        const rest = shapes[0];
        const smile = pathTemplate(a["data-smile"]);
        shapes.push({ ...rest, t: rest.t.map((v, i) => (typeof v === "number" ? v + ((smile.t[i] as number) - v) * SMILE_REACH : v)) });
      }
      for (const tpl of shapes) {
        if (/[XY]/.test(tpl.r)) return false; // relative moves: not worth following
        // Every point and control point (the curve lies within them); H and V
        // move one coordinate and keep the other.
        let x = 0;
        let y = 0;
        for (let i = 0; i < tpl.t.length; i++) {
          if (tpl.r[i] === "x") {
            x = tpl.t[i] as number;
            if (tpl.r[i + 1] === "y") y = tpl.t[++i] as number;
            take(x, y, pad);
          } else if (tpl.r[i] === "y") {
            y = tpl.t[i] as number;
            take(x, y, pad);
          }
        }
      }
      return true;
    }
    return false;
  };
  if (!nodes.every(visit) || x0 === Infinity) return whole;
  const bx = Math.max(whole[0], Math.floor(x0));
  const by = Math.max(whole[1], Math.floor(y0));
  return [bx, by, Math.min(whole[0] + whole[2], Math.ceil(x1)) - bx, Math.min(whole[1] + whole[3], Math.ceil(y1)) - by];
}

/** A sheet's drawing with its mouths drawn part-way (`k`) to their smiles. */
export function smiling(root: SvgNode, k: number): SvgNode {
  const map = (n: SvgNode): SvgNode =>
    n.attrs["data-smile"]
      ? { ...n, attrs: { ...n.attrs, d: drawPath(pathTemplate(n.attrs.d), pathTemplate(n.attrs["data-smile"]), k, 0, 0, 1) } }
      : { ...n, children: n.children.map(map) };
  return map(root);
}
