import { describe, expect, it } from "vitest";

import { landmarks } from "../data/landmarks";
import { worksBy } from "../lib/architects";
import { answers, parseQuery, stylesOf, vocabulary, walkMinutes, without, yearOf } from "../lib/registry-index";

const v = vocabulary(landmarks);
const find = (q: string) => landmarks.filter((l) => answers(l, parseQuery(q, v)));

describe("the registry's index", () => {
  it("reads an architect and 'within walking distance'", () => {
    const q = parseQuery("every Maybeck within walking distance of where I'm standing", v);
    expect(q.terms.map((t) => [t.facet, t.value])).toEqual([["architect", "maybeck"]]);
    expect(q.near).not.toBeNull();
    expect(q.words).toEqual([]);
  });

  it("reads a style and a district", () => {
    const q = parseQuery("every Queen Anne in Elmwood", v);
    expect(q.terms.map((t) => [t.facet, t.value])).toEqual([
      ["style", "queen anne"],
      ["district", "elmwood"],
    ]);
    const found = find("Queen Anne in Elmwood");
    expect(found.length).toBeGreaterThan(0);
    for (const l of found) {
      expect(stylesOf(l).some((s) => s.includes("queen anne")), l.name).toBe(true);
      expect(l.neighborhood.toLowerCase(), l.name).toContain("elmwood");
    }
  });

  it("finds every work of an architect, however they're named", () => {
    const all = worksBy("maybeck").map((l) => l.id).sort();
    for (const q of ["Maybeck", "Bernard Maybeck", "maybeck's"]) {
      expect(find(q).map((l) => l.id).sort(), q).toEqual(all);
    }
  });

  it("widens within a kind of term and narrows across kinds", () => {
    const either = find("Maybeck Morgan");
    expect(either.length).toBe(new Set([...find("Maybeck"), ...find("Julia Morgan")].map((l) => l.id)).size);
    const both = find("Maybeck 1910s");
    expect(both.length).toBeGreaterThan(0);
    for (const l of both) expect(Math.floor(yearOf(l)! / 10) * 10).toBe(1910);
  });

  it("reads decades however they're written", () => {
    for (const q of ["1920s", "20s", "the twenties"]) {
      const t = parseQuery(q, v).terms;
      expect(t.map((x) => [x.facet, x.label]), q).toEqual([["era", "1920s"]]);
    }
    for (const l of find("1920s")) expect(yearOf(l)! - 1920).toBeLessThan(10);
  });

  it("looks for words it doesn't know anywhere in an entry", () => {
    const q = parseQuery("church", v);
    expect(q.words.map((w) => w.text)).toEqual(["church"]);
    expect(find("church").length).toBeGreaterThan(0);
  });

  it("takes a term out of the query", () => {
    const q = "Queen Anne in Elmwood";
    const [style, district] = parseQuery(q, v).terms;
    expect(without(q, district)).toBe("Queen Anne");
    expect(without(q, style)).toBe("Elmwood");
  });

  it("times a walk at the guide's pace", () => {
    expect(walkMinutes(0)).toBe(1);
    expect(walkMinutes(850)).toBe(15);
  });
});
