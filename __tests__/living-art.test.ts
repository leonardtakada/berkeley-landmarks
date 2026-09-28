import { describe, expect, it } from "vitest";

import { PORTRAIT_SVG } from "../components/architect-portraits.generated";
import { LOGO_STREETS } from "../components/logo-streets.generated";
import { WALK_LABEL_SVG } from "../components/print-art.generated";
import { tours } from "../data/tours";
import { ARCHITECTS, type ArchitectKey } from "../lib/architects";
import { drawPath, morphable, parseSvg, pathTemplate, splitSheets, type SvgNode } from "../lib/svg-tree";

const parts = (node: SvgNode, role: string): SvgNode[] => [
  ...(node.attrs["data-anim"] === role ? [node] : []),
  ...node.children.flatMap((c) => parts(c, role)),
];

describe("reading the art", () => {
  it("reads a drawing into its elements, in order", () => {
    const svg = parseSvg(
      '<svg viewBox="0 0 10 10"><defs><clipPath id="f"><path d="M0 0 H10 V10 Z"/></clipPath></defs>' +
        '<g clip-path="url(#f)"><circle data-anim="eye" cx="3" cy="4" r="1"/><path d="M1 1 L2 2"/></g></svg>',
    );
    expect(svg.attrs.viewBox).toBe("0 0 10 10");
    expect(svg.children.map((c) => c.tag)).toEqual(["defs", "g"]);
    expect(svg.children[1].children.map((c) => c.tag)).toEqual(["circle", "path"]);
    expect(parts(svg, "eye")[0].attrs.cx).toBe("3");
  });

  it("tags each number of a path as an x or a y, and draws it back unchanged", () => {
    const tpl = pathTemplate("M80 94 H93 M107 94 C110 93 116 93 120 96 Z");
    expect(tpl.r).toBe("cxycxcxycxyxyxyc");
    expect(drawPath(tpl, null, 0, 0, 0, 1)).toBe("M 80 94 H 93 M 107 94 C 110 93 116 93 120 96 Z");
  });

  it("shifts, squashes about the middle, and morphs", () => {
    const eye = pathTemplate("M82 100 Q87 96 92 100");
    expect(drawPath(eye, null, 0, 2, 0, 1)).toBe("M 84 100 Q 89 96 94 100");
    // closed to a line through the middle of its y's
    expect(drawPath(eye, null, 0, 0, 0, 0)).toBe("M 82 98.67 Q 87 98.67 92 98.67");
    const smile = pathTemplate("M80 100 Q87 110 94 100");
    expect(drawPath(eye, smile, 0.5, 0, 0, 1)).toBe("M 81 100 Q 87 103 93 100");
  });
});

describe("printing in sheets", () => {
  const leaves = (n: SvgNode): SvgNode[] =>
    n.tag === "defs"
      ? []
      : (n.tag === "g" || n.tag === "svg") && !n.attrs["data-anim"]
        ? n.children.flatMap(leaves)
        : [n];
  const drawings = [...Object.values(PORTRAIT_SVG), ...tours.map((t) => WALK_LABEL_SVG[t.id])];

  it("stacks back into the whole drawing, each moving part on a sheet of its own", () => {
    for (const xml of drawings) {
      const sheets = splitSheets(xml);
      expect(sheets.flatMap((s) => leaves(s.root))).toEqual(leaves(parseSvg(xml)));
      for (const s of sheets) {
        const roles = new Set(leaves(s.root).map((l) => l.attrs["data-anim"] ?? null));
        expect([...roles]).toEqual([s.role]);
        // every sheet keeps the clip paths its elements are drawn through
        expect(s.root.children[0].tag).toBe("defs");
      }
    }
  });

  it("prints a pair of eyes small, and a sun on the whole sky it crosses", () => {
    const eyes = splitSheets(PORTRAIT_SVG.howard).find((s) => s.role === "eye")!;
    expect(eyes.box[2]).toBeLessThan(40);
    expect(eyes.box[3]).toBeLessThan(15);
    const sun = splitSheets(WALK_LABEL_SVG["tour-downtown"]).find((s) => s.role === "sky")!;
    expect(sun.box).toEqual([0, 0, 200, 240]);
  });

  it("gives a mouth room for its smile", () => {
    const mouth = splitSheets(PORTRAIT_SVG.plachek).find((s) => s.role === "mouth")!;
    const [, y, , h] = mouth.box;
    expect(y + h).toBeGreaterThan(148); // the smile dips to ~149.5
  });
});

describe("the architects come alive", () => {
  for (const key of Object.keys(ARCHITECTS) as ArchitectKey[]) {
    it(`${key} has eyes to blink and a mouth that can smile`, () => {
      const svg = parseSvg(PORTRAIT_SVG[key]);
      const eyes = parts(svg, "eye");
      expect(eyes.length).toBeGreaterThan(0);
      for (const e of eyes) expect(e.tag === "circle" ? e.attrs.r : e.attrs.d).toBeTruthy();
      const [mouth] = parts(svg, "mouth");
      expect(mouth?.attrs["data-smile"]).toBeTruthy();
      expect(morphable(pathTemplate(mouth.attrs.d), pathTemplate(mouth.attrs["data-smile"]))).toBe(true);
    });
  }
});

describe("the walk labels' skies", () => {
  it("every walk has a sun, a moon or clouds to move", () => {
    for (const t of tours) {
      const svg = parseSvg(WALK_LABEL_SVG[t.id]);
      expect(parts(svg, "sky").length + parts(svg, "cloud").length, t.id).toBeGreaterThan(0);
    }
  });
});

describe("the streets of the cover's device", () => {
  const { nodes, links, edge, tower, size } = LOGO_STREETS;

  it("are all joined up, with ways on and off at the rim", () => {
    const seen = new Set([0]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const [a, b] of links)
        if (seen.has(a) !== seen.has(b)) {
          seen.add(a);
          seen.add(b);
          grew = true;
        }
    }
    expect(seen.size).toBe(nodes.length);
    expect(edge.filter(Boolean).length).toBeGreaterThan(8);
  });

  it("lie on the slab, and never run under the tower's foot", () => {
    for (const [x, y] of nodes) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(size[0]);
      expect(y).toBeLessThanOrEqual(size[1]);
    }
    const [, front] = tower.foot;
    for (const [a, b] of links) {
      const mid = [(nodes[a][0] + nodes[b][0]) / 2, (nodes[a][1] + nodes[b][1]) / 2];
      const underFoot = Math.abs(mid[0] - front[0]) < 20 && Math.abs(mid[1] - (front[1] - 45)) < 20;
      expect(underFoot).toBe(false);
    }
  });
});
