import { describe, expect, it } from "vitest";

import { landmarks } from "../data/landmarks";
import { MAX_PROPOSAL_PHOTOS, findExisting, proposalError, proposalInputSchema } from "../shared/proposals";

const good = {
  name: "The Hillside Club",
  address: "2286 Cedar Street",
  why: "A shingled clubhouse at the heart of the Arts & Crafts movement in the hills.",
};

describe("landmark proposals", () => {
  it("accepts a proposal with a name, an address and a reason, and tidies the optional fields", () => {
    const parsed = proposalInputSchema.parse({ ...good, architect: "  Bernard Maybeck ", yearBuilt: "   " });
    expect(parsed.architect).toBe("Bernard Maybeck");
    expect(parsed.yearBuilt).toBeUndefined();
    expect(parsed.photos).toEqual([]);
  });

  it("explains what's missing in plain words", () => {
    expect(proposalError({ ...good, name: "" })).toBe("Give the place a name");
    expect(proposalError({ ...good, why: "Nice." })).toBe("Say a little about why it belongs in the guide");
    expect(proposalError(good)).toBeNull();
  });

  it(`takes at most ${MAX_PROPOSAL_PHOTOS} photographs`, () => {
    const photo = { base64: "AAAA", mimeType: "image/jpeg" as const };
    expect(proposalError({ ...good, photos: Array(MAX_PROPOSAL_PHOTOS).fill(photo) })).toBeNull();
    expect(proposalError({ ...good, photos: Array(MAX_PROPOSAL_PHOTOS + 1).fill(photo) })).toBe(
      `At most ${MAX_PROPOSAL_PHOTOS} photographs`,
    );
  });

  it("recognises a place already in the guide, by name or by address", () => {
    const library = landmarks.find((l) => l.name === "Berkeley Public Library")!;
    expect(findExisting({ name: "berkeley public library", address: "somewhere" }, landmarks)).toBe(library);
    expect(findExisting({ name: "The library", address: `${library.address}, Berkeley, CA` }, landmarks)).toBe(library);
    expect(findExisting({ name: "A garage on my street", address: "1 Nowhere Lane" }, landmarks)).toBeUndefined();
  });
});
