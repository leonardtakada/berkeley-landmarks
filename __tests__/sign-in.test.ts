import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DELETED_READER, uploadFileOf } from "../server/accounts";
import { UPLOADS_DIR } from "../server/uploads";
import { isValidEmail, plainly } from "../lib/sign-in";

describe("signing in", () => {
  it("takes the addresses the server takes", () => {
    expect(isValidEmail("reader@example.com")).toBe(true);
    expect(isValidEmail("  Reader@Example.COM ")).toBe(true);
    expect(isValidEmail("reader@nowhere")).toBe(false);
    expect(isValidEmail("reader example.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail(`${"a".repeat(320)}@example.com`)).toBe(false);
  });

  it("says plainly what went wrong", () => {
    expect(plainly(new TypeError("Network request failed"), "email")).toMatch(/couldn't reach/);
    expect(plainly(new Error("Too many codes requested. Try again in a few minutes."), "email")).toMatch(/three codes/);
    expect(plainly(new Error("Incorrect code"), "code")).toMatch(/doesn't match/);
    expect(plainly(new Error("Code expired or not found. Request a new code."), "code")).toMatch(/run out/);
    expect(plainly(new Error("Too many attempts. Request a new code."), "code")).toMatch(/Too many tries/);
    expect(plainly(new Error("Database not available"), "email")).toMatch(/couldn't be sent/);
    expect(plainly(new Error("Database not available"), "code")).toMatch(/couldn't be checked/);
    // Never the server's own words, which aren't the guide's.
    expect(plainly(new Error("Internal Server Error"), "code")).not.toMatch(/Internal/);
  });
});

describe("deleting an account", () => {
  it("removes only a reader's own uploads", () => {
    expect(uploadFileOf("/uploads/lm-12-1790000000-ab12cd.jpg")).toBe(path.join(UPLOADS_DIR, "lm-12-1790000000-ab12cd.jpg"));
    expect(uploadFileOf("/uploads/../.env")).toBeNull();
    expect(uploadFileOf("/uploads/.env")).toBeNull();
    expect(uploadFileOf("/uploads/a/b.jpg")).toBeNull();
    expect(uploadFileOf("https://upload.wikimedia.org/x.jpg")).toBeNull();
    expect(uploadFileOf("../uploads/x.jpg")).toBeNull();
  });

  it("credits what was printed to no one", () => {
    // (Not an openId any sign-in can have: those are `email:` or OAuth ids.)
    expect(DELETED_READER.startsWith("email:")).toBe(false);
  });
});

describe("App Review's sign-in", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const load = async (email?: string, code?: string) => {
    vi.resetModules();
    vi.stubEnv("REVIEW_EMAIL", email ?? "");
    vi.stubEnv("REVIEW_CODE", code ?? "");
    return (await import("../server/_core/emailAuth")).isReviewEmail;
  };

  it("is off unless both the address and a six-figure code are set", async () => {
    expect((await load())("review@example.com")).toBe(false);
    expect((await load("review@example.com"))("review@example.com")).toBe(false);
    expect((await load("review@example.com", "12345"))("review@example.com")).toBe(false);
    expect((await load("review@example.com", "12ab56"))("review@example.com")).toBe(false);
  });

  it("knows only the one address, in any case", async () => {
    const isReview = await load("Review@Example.com", "246810");
    expect(isReview("review@example.com")).toBe(true);
    expect(isReview(" REVIEW@example.com ")).toBe(true);
    expect(isReview("reader@example.com")).toBe(false);
  });
});
