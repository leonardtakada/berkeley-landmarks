import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { landmarks } from "../data/landmarks";
import { tours } from "../data/tours";
import {
  applyTour,
  checkLandmark,
  checkTour,
  cleanLandmark,
  cleanTour,
  differences,
  dropBlock,
  dropJson,
  isPlaceholder,
  joinBlocks,
  landmarkBlock,
  nextLandmarkId,
  nextTourId,
  parseJson,
  placeholderRoute,
  printJson,
  putBlock,
  putJson,
  routeProblems,
  splitBlocks,
  tourBlock,
  twinsOf,
} from "../scripts/editor/store";

// The guide editor (scripts/editor) rewrites data/landmarks.ts, data/tours.ts
// and data/landmarks.json as text. These check that it can take those files
// apart and put them back unchanged, and that what it writes reads back as
// the same data.

const LM_MARKER = "export const landmarks: Landmark[] = [\n";
const TOUR_MARKER = "export const tours: Tour[] = [\n";
const lmSrc = fs.readFileSync("data/landmarks.ts", "utf8");
const tourSrc = fs.readFileSync("data/tours.ts", "utf8");
const jsonSrc = fs.readFileSync("data/landmarks.json", "utf8");

const read = (block: string) => new Function(`return (${block})`)();

describe("taking the data files apart", () => {
  it("puts landmarks.ts back byte for byte", () => {
    expect(joinBlocks(splitBlocks(lmSrc, LM_MARKER))).toBe(lmSrc);
  });

  it("puts tours.ts back byte for byte", () => {
    expect(joinBlocks(splitBlocks(tourSrc, TOUR_MARKER))).toBe(tourSrc);
  });

  it("finds every landmark and reads each as the app does", () => {
    const { blocks } = splitBlocks(lmSrc, LM_MARKER);
    expect(blocks.map((b) => b.id)).toEqual(landmarks.map((l) => l.id));
    for (const [i, b] of blocks.entries()) expect(read(b.text), b.id).toEqual(landmarks[i]);
  });

  it("finds every tour", () => {
    const { blocks } = splitBlocks(tourSrc, TOUR_MARKER);
    expect(blocks.map((b) => b.id)).toEqual(tours.map((t) => t.id));
  });

  it("keeps landmarks.json as the export wrote it", () => {
    expect(printJson(parseJson(jsonSrc))).toBe(jsonSrc);
  });
});

describe("writing an entry", () => {
  it("writes every landmark so it reads back the same", () => {
    for (const l of landmarks) expect(read(landmarkBlock(l)), l.id).toEqual(l);
  });

  it("writes every tour exactly as scripts/route-walks.ts leaves it", () => {
    const { blocks } = splitBlocks(tourSrc, TOUR_MARKER);
    for (const [i, t] of tours.entries()) expect(tourBlock(t), t.id).toBe(blocks[i].text);
  });

  it("escapes quotes, backslashes, paragraphs and template syntax", () => {
    const tricky = {
      ...landmarks[0],
      name: "Bob's \"Place\" \\ ${x}",
      description: "One `tick`.\n\nTwo ${y} and \\n.",
    };
    expect(read(landmarkBlock(tricky))).toEqual(tricky);
  });

  it("changes only the entry it is given", () => {
    const parts = splitBlocks(lmSrc, LM_MARKER);
    const edited = { ...landmarks[3], architect: "Someone Else" };
    const out = joinBlocks(putBlock(parts, edited.id, landmarkBlock(edited)));
    const again = splitBlocks(out, LM_MARKER);
    expect(again.blocks.length).toBe(parts.blocks.length);
    again.blocks.forEach((b, i) => {
      if (i === 3) expect(read(b.text).architect).toBe("Someone Else");
      else expect(b.text).toBe(parts.blocks[i].text);
    });
    expect(again.head).toBe(parts.head);
    expect(again.tail).toBe(parts.tail);
  });

  it("adds an entry at the end and takes it out again", () => {
    const parts = splitBlocks(lmSrc, LM_MARKER);
    const added = { ...landmarks[0], id: "lm-9999", name: "A New Place" };
    const out = joinBlocks(putBlock(parts, added.id, landmarkBlock(added)));
    const again = splitBlocks(out, LM_MARKER);
    expect(again.blocks.at(-1)?.id).toBe("lm-9999");
    expect(joinBlocks(dropBlock(again, "lm-9999"))).toBe(lmSrc);
  });

  it("adds a tour after the last, keeping the trailing comma", () => {
    const parts = splitBlocks(tourSrc, TOUR_MARKER);
    const out = joinBlocks(putBlock(parts, "tour-new", tourBlock({ ...tours[0], id: "tour-new" })));
    expect(splitBlocks(out, TOUR_MARKER).blocks.map((b) => b.id).at(-1)).toBe("tour-new");
    expect(out).toContain("  },\n];");
  });

  it("takes out the first entry and the separator before the next", () => {
    const parts = splitBlocks(lmSrc, LM_MARKER);
    const out = joinBlocks(dropBlock(parts, landmarks[0].id));
    expect(splitBlocks(out, LM_MARKER).blocks.map((b) => b.id)).toEqual(landmarks.slice(1).map((l) => l.id));
  });
});

describe("the JSON mirror", () => {
  it("replaces an entry in place and adds a new one in id order", () => {
    const all = parseJson(jsonSrc);
    const edited = { ...landmarks[2], architect: "Someone Else" };
    const replaced = putJson(all, edited);
    expect(replaced.length).toBe(all.length);
    expect(replaced.find((x) => x.id === edited.id)?.architect).toBe("Someone Else");

    const added = putJson(all, { ...landmarks[0], id: "lm-9999" });
    expect(added.length).toBe(all.length + 1);
    expect(added.map((x) => x.id)).toEqual([...added.map((x) => x.id)].sort());
    expect(dropJson(added, "lm-9999")).toEqual(all);
  });

  it("tells which fields differ, counting blank, null and missing as the same", () => {
    const l = landmarks[0];
    expect(differences(l, { ...l })).toEqual([]);
    expect(differences(l, { ...l, photoUrl: undefined, photos: [] , designationType: undefined })).toEqual(
      expect.arrayContaining(["photoUrl"]),
    );
    expect(differences({ ...l, photoUrl: undefined }, { ...l, photoUrl: "" })).toEqual([]);
    expect(differences(l, { ...l, architect: "Someone Else", description: l.description + " " })).toEqual(["architect"]);
  });
});

describe("checking what a reader of the form sends", () => {
  it("accepts every landmark already in the guide", () => {
    for (const l of landmarks) expect(checkLandmark(cleanLandmark(l), landmarks).errors, l.id).toEqual([]);
  });

  it("names what's missing or off", () => {
    const { errors } = checkLandmark(
      cleanLandmark({ id: "x", name: "", latitude: "40", longitude: -122.27, category: "castle", photoUrl: "nope" }),
      landmarks,
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        "The id should look like lm-400",
        "It needs a name",
        "It needs a description",
        "Choose a category",
        "The lead photograph should be a web address",
      ]),
    );
    expect(errors.some((e) => e.startsWith("Latitude"))).toBe(true);
  });

  it("warns when a place repeats a name or an address", () => {
    const twin = cleanLandmark({ ...landmarks[0], id: "lm-9999" });
    expect(checkLandmark(twin, landmarks).warnings.length).toBeGreaterThan(0);
  });

  it("recognises a second copy by name, street address, or spot", () => {
    const l = landmarks.find((x) => /^\d/.test(x.address))!;
    expect(twinsOf({ ...l, id: "lm-9999" }, landmarks).map((t) => t.id)).toContain(l.id);
    expect(twinsOf({ ...l, id: "lm-9999", name: "Another", address: "9 Elsewhere Rd", latitude: 37.86, longitude: -122.25 }, landmarks)).toEqual([]);
    // Stands where another place does, and its name contains that place's.
    const near = twinsOf({ ...l, id: "lm-9999", name: `The ${l.name}`, address: "9 Elsewhere Rd" }, landmarks);
    expect(near.map((t) => t.id)).toContain(l.id);
    // A shared campus address isn't a copy.
    const a = { ...l, id: "lm-9998", name: "A", address: "U.C. Berkeley Campus", latitude: 37.8, longitude: -122.2 };
    expect(twinsOf({ ...a, id: "lm-9999", name: "B" }, [a])).toEqual([]);
  });

  it("drops blank photographs and keeps the rest", () => {
    const l = cleanLandmark({ ...landmarks[0], photos: [{ url: " " }, { url: "https://x.test/a.jpg", credit: " Me " }] });
    expect(l.photos).toEqual([{ url: "https://x.test/a.jpg", credit: "Me" }]);
  });

  it("numbers the next landmark past every id in use", () => {
    expect(nextLandmarkId(["lm-1", "lm-379", "lm-2753bv"])).toBe("lm-380");
  });

  it("slugs a new walk's name and keeps it unique", () => {
    expect(nextTourId("The Hills & Views", [])).toBe("tour-the-hills-views");
    expect(nextTourId("Downtown", ["tour-downtown"])).toBe("tour-downtown-2");
  });
});

describe("tours", () => {
  const input = (t = tours[0]) =>
    cleanTour({ ...t, stops: t.stops.map((s) => ({ landmarkId: s.landmarkId, note: s.note })) });

  it("accepts every walk already in the guide", () => {
    for (const t of tours) expect(checkTour(input(t), landmarks).errors, t.id).toEqual([]);
  });

  it("refuses a walk with too few stops, a stop twice, or a stranger", () => {
    const t = input();
    expect(checkTour({ ...t, stops: t.stops.slice(0, 1) }, landmarks).errors).toContain("A walk needs at least two stops");
    expect(checkTour({ ...t, stops: [t.stops[0], t.stops[0]] }, landmarks).errors.join()).toContain("a stop twice");
    expect(checkTour({ ...t, stops: [t.stops[0], { landmarkId: "lm-nope" }] }, landmarks).errors.join()).toContain(
      "not in the guide",
    );
  });

  it("keeps a walk's drawn route when only a note changes", () => {
    const t = input();
    const edited = { ...t, stops: t.stops.map((s, i) => (i === 0 ? { ...s, note: "A new note" } : s)) };
    const out = applyTour(edited, tours[0], landmarks);
    expect(out.routeCoordinates).toBe(tours[0].routeCoordinates);
    expect(out.distance).toBe(tours[0].distance);
    expect(out.stops[0].note).toBe("A new note");
  });

  it("numbers the stops by their place in the list", () => {
    const t = input();
    const out = applyTour({ ...t, stops: [...t.stops].reverse() }, tours[0], landmarks);
    expect(out.stops.map((s) => s.order)).toEqual(t.stops.map((_, i) => i + 1));
  });

  it("draws a straight line when the stops change, until it's redrawn", () => {
    const t = input();
    const out = applyTour({ ...t, stops: t.stops.slice(0, 4) }, tours[0], landmarks);
    expect(out.routeCoordinates.length).toBe(4);
    expect(isPlaceholder(out, landmarks)).toBe(true);
    expect(routeProblems(out, landmarks)[0]).toMatch(/straight line/);
    // …and its stated length and time follow the line, so the data checks still hold.
    const walk = placeholderRoute(out.stops.map((s) => landmarks.find((l) => l.id === s.landmarkId)!));
    expect(out.distance).toBe(walk.distance);
    expect(out.duration).toMatch(/^\d(\.5)? hrs?$/);
  });

  it("finds nothing wrong with the routes already drawn", () => {
    for (const t of tours) expect(routeProblems(t, landmarks), t.id).toEqual([]);
  });

  it("notices when a stop is moved off its route", () => {
    const stop = tours[0].stops[0].landmarkId;
    const moved = landmarks.map((l) => (l.id === stop ? { ...l, latitude: l.latitude + 0.01 } : l));
    expect(routeProblems(tours[0], moved).join()).toMatch(/misses/);
  });
});
