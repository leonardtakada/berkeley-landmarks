import { describe, expect, it } from "vitest";

import { BIOGRAPHIES, citations } from "../lib/architect-bios";
import { ARCHITECTS, type ArchitectKey } from "../lib/architects";

describe("the architects' lives", () => {
  it("splits a paragraph into its text and its notes", () => {
    expect(citations("Born in 1862.[1] Taught at Berkeley.[1][2]")).toEqual([
      { text: "Born in 1862." },
      { notes: [1] },
      { text: " Taught at Berkeley." },
      { notes: [1, 2] },
    ]);
  });

  for (const key of Object.keys(ARCHITECTS) as ArchitectKey[]) {
    it(`${key}: every note points at a source, and every source is cited`, () => {
      const bio = BIOGRAPHIES[key];
      expect(bio.text.length).toBeGreaterThanOrEqual(3);
      const cited = new Set(bio.text.flatMap((p) => citations(p).flatMap((r) => r.notes ?? [])));
      for (const n of cited) expect(n >= 1 && n <= bio.sources.length, `note ${n}`).toBe(true);
      expect([...cited].sort((a, b) => a - b)).toEqual(bio.sources.map((_, i) => i + 1));
      // Its dates agree with the architect's own line in the guide.
      const [born, died] = ARCHITECTS[key].years.split("–");
      const all = bio.text.join(" ");
      expect(all).toContain(born);
      expect(all).toContain(died);
    });
  }
});
