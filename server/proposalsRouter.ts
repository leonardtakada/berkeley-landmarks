import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { landmarks } from "../data/landmarks";
import { proposals } from "../drizzle/schema";
import { adminProcedure, protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { findExisting, proposalInputSchema } from "../shared/proposals";
import { SlidingWindowRateLimiter } from "./submissionsLogic";
import { saveUpload } from "./uploads";

/** At most 3 proposals per reader an hour, and 10 awaiting review at once. */
const rateLimiter = new SlidingWindowRateLimiter(3, 60 * 60 * 1000);
const MAX_PENDING_PER_USER = 10;

/**
 * Readers' proposals of places for the guide: a signed-in reader names a
 * building or place of interest, says why it belongs, and may send up to
 * four photographs. The editors review each one.
 */
export const proposalsRouter = router({
  submit: protectedProcedure.input(proposalInputSchema).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const existing = findExisting(input, landmarks);
    if (existing) {
      throw new Error(`${existing.name} is already in the guide`);
    }

    const [pending] = await db
      .select({ count: count() })
      .from(proposals)
      .where(and(eq(proposals.userId, ctx.user.openId), eq(proposals.status, "pending")));
    if (pending.count >= MAX_PENDING_PER_USER) {
      throw new Error(`You can have at most ${MAX_PENDING_PER_USER} proposals awaiting review`);
    }
    if (!rateLimiter.allow(ctx.user.openId)) {
      throw new Error("Rate limit reached. Please try again later.");
    }

    const photoUrls = input.photos.map((p) => saveUpload(p.base64, p.mimeType, "proposal"));
    const [row] = await db
      .insert(proposals)
      .values({
        userId: ctx.user.openId,
        name: input.name,
        address: input.address,
        why: input.why,
        architect: input.architect ?? null,
        yearBuilt: input.yearBuilt ?? null,
        style: input.style ?? null,
        photoUrls,
        status: "pending",
      })
      .$returningId();
    return { id: row.id, status: "pending" as const };
  }),

  /** The reader's own proposals, newest first. */
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(proposals)
      .where(eq(proposals.userId, ctx.user.openId))
      .orderBy(desc(proposals.createdAt))
      .limit(50);
  }),

  /** Admin: proposals by status. */
  list: adminProcedure
    .input(z.object({ status: z.enum(["pending", "approved", "rejected"]).default("pending") }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(proposals)
        .where(eq(proposals.status, input.status))
        .orderBy(desc(proposals.createdAt))
        .limit(200);
    }),

  /**
   * Admin: accept or decline a proposal. Accepting records the decision;
   * writing the entry into the guide is the editors' work.
   */
  review: adminProcedure
    .input(
      z.object({
        proposalId: z.number().int().positive(),
        action: z.enum(["approve", "reject"]),
        reviewerNote: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [row] = await db.select().from(proposals).where(eq(proposals.id, input.proposalId)).limit(1);
      if (!row) throw new Error("Proposal not found");
      if (row.status !== "pending") throw new Error("Proposal already reviewed");
      await db
        .update(proposals)
        .set({
          status: input.action === "approve" ? "approved" : "rejected",
          reviewedAt: new Date(),
          reviewedBy: ctx.user.openId,
          reviewerNote: input.reviewerNote ?? null,
        })
        .where(eq(proposals.id, input.proposalId));
      return { success: true as const };
    }),
});
