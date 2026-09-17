import { describe, it, expect, beforeEach } from "vitest";
import {
  EDITABLE_LANDMARK_FIELDS,
  SlidingWindowRateLimiter,
  stripNoOpChanges,
  validateSubmissionPayload,
} from "../server/submissionsLogic";

describe("validateSubmissionPayload", () => {
  it("accepts valid field changes", () => {
    const result = validateSubmissionPayload({ architect: "Julia Morgan", yearBuilt: "1911" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changes).toEqual({ architect: "Julia Morgan", yearBuilt: "1911" });
    }
  });

  it("accepts every declared editable field", () => {
    const payload: Record<string, string> = {};
    for (const field of Object.keys(EDITABLE_LANDMARK_FIELDS)) {
      payload[field] = field === "description" ? "x".repeat(100) : "x".repeat(5);
    }
    const result = validateSubmissionPayload(payload);
    expect(result.ok).toBe(true);
  });

  it("rejects an empty payload", () => {
    expect(validateSubmissionPayload({}).ok).toBe(false);
    expect(validateSubmissionPayload(null).ok).toBe(false);
    expect(validateSubmissionPayload("architect=Me").ok).toBe(false);
    expect(validateSubmissionPayload(["architect"]).ok).toBe(false);
  });

  it("rejects non-editable fields", () => {
    const result = validateSubmissionPayload({ id: "lm-999" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("id");
  });

  it("rejects non-string values", () => {
    expect(validateSubmissionPayload({ yearBuilt: 1911 }).ok).toBe(false);
    expect(validateSubmissionPayload({ name: null }).ok).toBe(false);
  });

  it("rejects empty/whitespace values", () => {
    expect(validateSubmissionPayload({ name: "   " }).ok).toBe(false);
    expect(validateSubmissionPayload({ name: "" }).ok).toBe(false);
  });

  it("rejects over-length values", () => {
    const result = validateSubmissionPayload({ name: "x".repeat(EDITABLE_LANDMARK_FIELDS.name.maxLength + 1) });
    expect(result.ok).toBe(false);
  });

  it("trims surrounding whitespace from values", () => {
    const result = validateSubmissionPayload({ style: "  Craftsman  " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changes.style).toBe("Craftsman");
  });
});

describe("stripNoOpChanges", () => {
  const current = { architect: "Julia Morgan", style: "Craftsman", yearBuilt: "1911" };

  it("keeps only fields that differ from current values", () => {
    const result = stripNoOpChanges({ architect: "Maybeck", style: "Craftsman" }, current);
    expect(result).toEqual({ architect: "Maybeck" });
  });

  it("returns null when nothing changes", () => {
    expect(stripNoOpChanges({ style: "Craftsman" }, current)).toBeNull();
  });

  it("treats a whitespace-only difference as a no-op", () => {
    expect(stripNoOpChanges({ architect: "Julia Morgan " }, current)).toBeNull();
  });
});

describe("SlidingWindowRateLimiter", () => {
  const WINDOW = 60_000;

  it("allows up to the max hits inside the window", () => {
    const limiter = new SlidingWindowRateLimiter(3, WINDOW);
    const t0 = 1_000_000;
    expect(limiter.allow("user-a", t0)).toBe(true);
    expect(limiter.allow("user-a", t0 + 1000)).toBe(true);
    expect(limiter.allow("user-a", t0 + 2000)).toBe(true);
    expect(limiter.allow("user-a", t0 + 3000)).toBe(false);
    expect(limiter.currentCount("user-a", t0 + 3000)).toBe(3);
  });

  it("allows again once hits fall outside the window", () => {
    const limiter = new SlidingWindowRateLimiter(2, WINDOW);
    const t0 = 1_000_000;
    limiter.allow("user-a", t0);
    limiter.allow("user-a", t0 + 1000);
    expect(limiter.allow("user-a", t0 + WINDOW + 2000)).toBe(true);
  });

  it("tracks keys independently", () => {
    const limiter = new SlidingWindowRateLimiter(1, WINDOW);
    const t0 = 1_000_000;
    expect(limiter.allow("user-a", t0)).toBe(true);
    expect(limiter.allow("user-b", t0)).toBe(true);
    expect(limiter.allow("user-a", t0 + 1)).toBe(false);
  });
});
