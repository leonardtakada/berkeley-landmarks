/**
 * Pure (DB-free) logic for landmark edit submissions.
 * Kept separate from the router so it can be unit-tested without a database.
 */

/** Landmark fields users are allowed to propose changes to, with validation limits. */
export const EDITABLE_LANDMARK_FIELDS = {
  name: { maxLength: 200 },
  address: { maxLength: 300 },
  architect: { maxLength: 300 },
  yearBuilt: { maxLength: 100 },
  style: { maxLength: 200 },
  neighborhood: { maxLength: 120 },
  description: { maxLength: 5000 },
  photoUrl: { maxLength: 512 },
} as const;

export type EditableField = keyof typeof EDITABLE_LANDMARK_FIELDS;

export type SubmissionChanges = Partial<Record<EditableField, string>>;

export type ValidationResult =
  | { ok: true; changes: SubmissionChanges }
  | { ok: false; error: string };

/**
 * Validates a raw payload (e.g. from an API client) into a clean set of
 * proposed field changes. Rejects unknown fields, empty payloads,
 * non-string values, and over-length values.
 */
export function validateSubmissionPayload(payload: unknown): ValidationResult {
  if (payload == null || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Payload must be an object of field changes" };
  }

  const entries = Object.entries(payload as Record<string, unknown>);
  if (entries.length === 0) {
    return { ok: false, error: "Payload must contain at least one field change" };
  }

  const changes: SubmissionChanges = {};
  for (const [field, value] of entries) {
    const limits = (EDITABLE_LANDMARK_FIELDS as Record<string, { maxLength: number } | undefined>)[field];
    if (!limits) {
      return { ok: false, error: `Field "${field}" is not editable` };
    }
    if (typeof value !== "string") {
      return { ok: false, error: `Value for "${field}" must be a string` };
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return { ok: false, error: `Value for "${field}" must not be empty` };
    }
    if (trimmed.length > limits.maxLength) {
      return { ok: false, error: `Value for "${field}" exceeds ${limits.maxLength} characters` };
    }
    changes[field as EditableField] = trimmed;
  }

  return { ok: true, changes };
}

/**
 * Strips fields whose proposed value is identical to the current value,
 * so no-op changes never reach the review queue. Returns null if nothing
 * meaningful remains.
 */
export function stripNoOpChanges(
  changes: SubmissionChanges,
  current: Record<string, unknown>
): SubmissionChanges | null {
  const meaningful: SubmissionChanges = {};
  for (const [field, value] of Object.entries(changes)) {
    if ((current[field] ?? "").toString().trim() !== value.trim()) {
      meaningful[field as EditableField] = value;
    }
  }
  return Object.keys(meaningful).length > 0 ? meaningful : null;
}

/**
 * Simple in-memory sliding-window rate limiter.
 * Sufficient for a single-process server; resets on restart by design.
 */
export class SlidingWindowRateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number
  ) {}

  /** Returns true and records the hit if allowed; false if the limit is exceeded. */
  allow(key: string, now = Date.now()): boolean {
    const windowStart = now - this.windowMs;
    const prior = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (prior.length >= this.max) {
      this.hits.set(key, prior);
      return false;
    }
    prior.push(now);
    this.hits.set(key, prior);
    return true;
  }

  /** Number of hits inside the current window (for diagnostics/tests). */
  currentCount(key: string, now = Date.now()): number {
    const windowStart = now - this.windowMs;
    return (this.hits.get(key) ?? []).filter((t) => t > windowStart).length;
  }
}
