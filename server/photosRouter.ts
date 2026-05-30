import { eq, and, count, desc } from "drizzle-orm";
import { z } from "zod";
import { photos } from "../drizzle/schema";
import { getDb } from "./db";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import path from "path";
import fs from "fs";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export const photosRouter = router({
  submit: protectedProcedure
    .input(
      z.object({
        landmarkId: z.string().min(1),
        photoBase64: z.string().min(1),
        caption: z.string().max(500).optional(),
        mimeType: z.enum(["image/jpeg", "image/png"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Check max 3 pending per landmark per user
      const [existing] = await db
        .select({ count: count() })
        .from(photos)
        .where(
          and(
            eq(photos.landmarkId, input.landmarkId),
            eq(photos.userId, ctx.user.openId),
            eq(photos.status, "pending")
          )
        );
      if (existing.count >= 3) {
        throw new Error("You can have at most 3 pending photo submissions per landmark");
      }

      // Decode and validate size (5MB)
      const buffer = Buffer.from(input.photoBase64, "base64");
      if (buffer.length > 5 * 1024 * 1024) {
        throw new Error("File size must be under 5MB");
      }

      // Save to uploads
      ensureUploadsDir();
      const ext = input.mimeType === "image/png" ? "png" : "jpg";
      const filename = `${input.landmarkId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filepath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(filepath, buffer);

      const photoUrl = `/uploads/${filename}`;

      const [row] = await db.insert(photos).values({
        landmarkId: input.landmarkId,
        userId: ctx.user.openId,
        photoUrl,
        caption: input.caption ?? null,
        status: "pending",
      }).$returningId();

      return { id: row.id, photoUrl, status: "pending" };
    }),

  getForLandmark: publicProcedure
    .input(z.object({ landmarkId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({
          id: photos.id,
          landmarkId: photos.landmarkId,
          photoUrl: photos.photoUrl,
          caption: photos.caption,
          createdAt: photos.createdAt,
        })
        .from(photos)
        .where(and(eq(photos.landmarkId, input.landmarkId), eq(photos.status, "approved")))
        .orderBy(desc(photos.createdAt));
    }),

  getPending: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(photos)
      .where(eq(photos.status, "pending"))
      .orderBy(desc(photos.createdAt));
  }),

  approve: adminProcedure
    .input(z.object({ photoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db
        .update(photos)
        .set({ status: "approved", reviewedAt: new Date(), reviewedBy: ctx.user.openId })
        .where(eq(photos.id, input.photoId));
      return { success: true };
    }),

  reject: adminProcedure
    .input(z.object({ photoId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db
        .update(photos)
        .set({ status: "rejected", reviewedAt: new Date(), reviewedBy: ctx.user.openId })
        .where(eq(photos.id, input.photoId));
      return { success: true };
    }),
});
