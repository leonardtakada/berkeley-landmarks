import { and, count, desc, eq, isNull } from "drizzle-orm";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";
import { z } from "zod";
import { submissions, type Submission } from "../drizzle/schema";
import { getDb } from "./db";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import {
  EDITABLE_LANDMARK_FIELDS,
  SlidingWindowRateLimiter,
  stripNoOpChanges,
  validateSubmissionPayload,
  type SubmissionChanges,
} from "./submissionsLogic";
import { landmarks } from "../data/landmarks";

/**
 * Rate limit for submission creation: max 5 submissions per user per hour.
 * In-memory, single-process; sufficient for the current deployment shape.
 */
/** Maps editable field names to landmarks DB columns (snake_case). */
const FIELD_TO_COLUMN: Record<string, string> = {
  name: "name",
  address: "address",
  architect: "architect",
  yearBuilt: "year_built",
  style: "style",
  neighborhood: "neighborhood",
  description: "description",
  photoUrl: "photo_url",
};

/**
 * Apply an approved submission's changes to the landmarks DB table and
 * data/landmarks.json (served at /landmarks.json). Throws on failure so the
 * caller can surface it; the submission row itself is not touched here.
 */
export async function applyApprovedChanges(submission: Submission): Promise<void> {
  const validated = validateSubmissionPayload(submission.payload);
  if (!validated.ok) throw new Error(validated.error);
  const changes = validated.changes;
  const entries = Object.entries(changes) as [string, string][];
  if (entries.length === 0) throw new Error("No changes to apply");

  // 1. Update MySQL landmarks table (predates drizzle schema defs — raw SQL, parameterized)
  if (process.env.DATABASE_URL) {
    const conn = await mysql.createConnection(process.env.DATABASE_URL);
    try {
      const updateList = entries.map(([f]) => `\`${FIELD_TO_COLUMN[f]}\` = ?`).join(", ");
      await conn.execute(
        `UPDATE landmarks SET ${updateList}, updatedAt = NOW() WHERE id = ?`,
        [...entries.map(([, v]) => v), submission.landmarkId],
      );
    } finally {
      await conn.end();
    }
  }

  // 2. Mirror into data/landmarks.json (clients read this via /landmarks.json)
  const jsonPath = path.resolve(process.cwd(), "data/landmarks.json");
  const all = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as Array<Record<string, unknown>>;
  const lm = all.find((l) => l.id === submission.landmarkId);
  if (!lm) throw new Error(`Landmark ${submission.landmarkId} missing from landmarks.json`);
  for (const [field, value] of entries) lm[field] = value;
  fs.writeFileSync(jsonPath, JSON.stringify(all, null, 2) + "\n");
}

const submitRateLimiter = new SlidingWindowRateLimiter(5, 60 * 60 * 1000);

/** Max pending submissions per user across all landmarks. */
const MAX_PENDING_PER_USER = 10;

export const submissionInputSchema = z.object({
  landmarkId: z.string().min(1).max(128),
  type: z.enum(["edit", "correction", "photo_suggestion"]).default("edit"),
  /** Proposed field changes, e.g. { architect: "Julia Morgan", yearBuilt: "1911" }. */
  payload: z.record(z.string(), z.string()),
  note: z.string().max(1000).optional(),
});

/**
 * Advisory AI first-pass review. Returns a 0-100 risk score (higher = more
 * likely a bad/duplicate/nonsensical edit) plus flags and a short note.
 * Never throws to the caller path — failures are logged and ignored so the
 * submission flow stays unblocked.
 */
export async function scoreSubmissionWithAI(
  changes: SubmissionChanges,
  note: string | null,
  landmarkName: string
): Promise<{ riskScore: number; flags: string[]; note: string } | null> {
  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are a moderation assistant for a community-edited Berkeley landmarks database. " +
            "Score the risk that a user-suggested edit is bad (spam, vandalism, nonsensical, duplicate of the current value, or factually implausible). " +
            "riskScore: 0 = clearly fine, 100 = almost certainly bad. flags: zero or more of 'spam', 'nonsensical', 'duplicate', 'implausible', 'offensive'.",
        },
        {
          role: "user",
          content: JSON.stringify({
            landmark: landmarkName,
            proposedChanges: changes,
            submitterNote: note,
          }),
        },
      ],
      outputSchema: {
        name: "submission_review",
        schema: {
          type: "object",
          properties: {
            riskScore: { type: "number" },
            flags: { type: "array", items: { type: "string" } },
            note: { type: "string" },
          },
          required: ["riskScore", "flags", "note"],
          additionalProperties: false,
        },
        strict: true,
      },
    });

    const content = result.choices?.[0]?.message?.content;
    const raw = typeof content === "string" ? content : JSON.stringify(content ?? "");
    // Tolerate markdown fences / prose around the JSON object (e.g. glm flash)
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const text = start !== -1 && end > start ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(text) as { riskScore?: unknown; flags?: unknown; note?: unknown };
    const riskScore =
      typeof parsed.riskScore === "number" ? Math.max(0, Math.min(100, Math.round(parsed.riskScore))) : null;
    if (riskScore === null) return null;
    const flags = Array.isArray(parsed.flags) ? parsed.flags.filter((f): f is string => typeof f === "string") : [];
    const aiNote = typeof parsed.note === "string" ? parsed.note.slice(0, 500) : "";
    return { riskScore, flags, note: aiNote };
  } catch (error) {
    console.warn("[Submissions] AI scoring failed (non-blocking):", error);
    return null;
  }
}

/** Persists an advisory AI score onto a submission. Silently no-ops without a DB. */
async function persistAiScore(submissionId: number, score: { riskScore: number; flags: string[]; note: string }) {
  try {
    const db = await getDb();
    if (!db) return;
    await db
      .update(submissions)
      .set({ aiScore: score.riskScore, aiFlags: score.flags, aiNote: score.note })
      .where(eq(submissions.id, submissionId));
  } catch (error) {
    console.warn("[Submissions] Failed to persist AI score:", error);
  }
}

export const submissionsRouter = router({
  /**
   * Submit a proposed landmark edit. Auth required, rate limited, payload
   * validated against the editable landmark fields; no-op changes rejected.
   * An advisory AI score is computed in the background (non-blocking).
   */
  submit: protectedProcedure
    .input(submissionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const landmark = landmarks.find((l) => l.id === input.landmarkId);
      if (!landmark) {
        throw new Error("Unknown landmark");
      }

      const validated = validateSubmissionPayload(input.payload);
      if (!validated.ok) {
        throw new Error(validated.error);
      }

      const changes = stripNoOpChanges(validated.changes, landmark as unknown as Record<string, unknown>);
      if (!changes) {
        throw new Error("No changes: submitted values match the current landmark data");
      }

      if (!submitRateLimiter.allow(ctx.user.openId)) {
        throw new Error("Rate limit reached. Please try again later.");
      }

      const [pending] = await db
        .select({ count: count() })
        .from(submissions)
        .where(and(eq(submissions.userId, ctx.user.openId), eq(submissions.status, "pending")));
      if (pending.count >= MAX_PENDING_PER_USER) {
        throw new Error(`You can have at most ${MAX_PENDING_PER_USER} pending submissions`);
      }

      const [row] = await db
        .insert(submissions)
        .values({
          landmarkId: input.landmarkId,
          userId: ctx.user.openId,
          type: input.type,
          payload: changes,
          note: input.note ?? null,
          status: "pending",
        })
        .$returningId();

      // Advisory AI first pass — fire and forget, never blocks the response.
      void scoreSubmissionWithAI(changes, input.note ?? null, landmark.name).then((score) => {
        if (score) return persistAiScore(row.id, score);
      });

      return { id: row.id, status: "pending" as const };
    }),

  /** List the current user's own submissions, newest first. */
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(submissions)
      .where(eq(submissions.userId, ctx.user.openId))
      .orderBy(desc(submissions.createdAt))
      .limit(50);
  }),

  /** Admin: list submissions, optionally filtered by status. */
  list: adminProcedure
    .input(z.object({ status: z.enum(["pending", "approved", "rejected"]).default("pending") }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(submissions)
        .where(eq(submissions.status, input.status))
        .orderBy(desc(submissions.createdAt))
        .limit(200);
    }),

  /** Admin: approve or reject a submission. */
  review: adminProcedure
    .input(
      z.object({
        submissionId: z.number().int().positive(),
        action: z.enum(["approve", "reject"]),
        reviewerNote: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [row] = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).limit(1);
      if (!row) throw new Error("Submission not found");
      if (row.status !== "pending") throw new Error("Submission already reviewed");

      if (input.action === "approve") {
        await applyApprovedChanges(row);
      }

      await db
        .update(submissions)
        .set({
          status: input.action === "approve" ? "approved" : "rejected",
          reviewedAt: new Date(),
          reviewedBy: ctx.user.openId,
          reviewerNote: input.reviewerNote ?? null,
        })
        .where(eq(submissions.id, input.submissionId));
      return { success: true as const };
    }),

  /**
   * Admin: backfill advisory AI scores for pending submissions that don't
   * have one yet (e.g. scored at submit-time failed, or legacy rows).
   * Processes at most `limit` submissions.
   */
  aiReview: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(25).default(10) }).default({ limit: 10 }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const pending: Submission[] = await db
        .select()
        .from(submissions)
        .where(and(eq(submissions.status, "pending"), isNull(submissions.aiScore)))
        .orderBy(desc(submissions.createdAt))
        .limit(input.limit);

      let scored = 0;
      for (const submission of pending) {
        const landmark = landmarks.find((l) => l.id === submission.landmarkId);
        const changes = validateSubmissionPayload(submission.payload);
        if (!changes.ok) continue;
        const score = await scoreSubmissionWithAI(
          changes.changes,
          submission.note,
          landmark?.name ?? submission.landmarkId
        );
        if (score) {
          await persistAiScore(submission.id, score);
          scored++;
        }
      }
      return { considered: pending.length, scored };
    }),
});

/** Exported for tests / REST admin endpoints. */
export const EDITABLE_FIELDS = EDITABLE_LANDMARK_FIELDS;
