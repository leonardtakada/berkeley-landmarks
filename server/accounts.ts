import fs from "fs";
import path from "path";
import { and, eq, inArray } from "drizzle-orm";
import { loginCodes, photos, proposals, submissions, users, type User } from "../drizzle/schema";
import { getDb } from "./db";
import { UPLOADS_DIR } from "./uploads";

/** Who an approved contribution is credited to once its reader has gone. */
export const DELETED_READER = "deleted";

/** The file under /uploads behind a public path, or null for anything else. */
export function uploadFileOf(publicPath: string): string | null {
  const m = /^\/uploads\/([A-Za-z0-9._-]+)$/.exec(publicPath);
  if (!m || m[1].startsWith(".")) return null;
  return path.join(UPLOADS_DIR, m[1]);
}

function removeUpload(publicPath: string): boolean {
  const file = uploadFileOf(publicPath);
  if (!file) return false;
  try {
    fs.unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes a reader's account: their sign-in and every sign-in code, and all
 * they sent that the editors haven't printed (pending or turned down), with
 * its photographs. What the editors approved is already part of the guide;
 * it stays, credited to no one.
 */
export async function deleteAccount(user: Pick<User, "openId" | "email">): Promise<{ removedFiles: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const who = user.openId;
  const unprinted = ["pending", "rejected"] as ("pending" | "rejected")[];
  let removedFiles = 0;

  const theirPhotos = await db
    .select({ id: photos.id, photoUrl: photos.photoUrl })
    .from(photos)
    .where(and(eq(photos.userId, who), inArray(photos.status, unprinted)));
  for (const p of theirPhotos) if (removeUpload(p.photoUrl)) removedFiles++;
  await db.delete(photos).where(and(eq(photos.userId, who), inArray(photos.status, unprinted)));
  await db.update(photos).set({ userId: DELETED_READER }).where(eq(photos.userId, who));

  const theirProposals = await db
    .select({ id: proposals.id, photoUrls: proposals.photoUrls })
    .from(proposals)
    .where(and(eq(proposals.userId, who), inArray(proposals.status, unprinted)));
  for (const p of theirProposals) for (const u of p.photoUrls ?? []) if (removeUpload(u)) removedFiles++;
  await db.delete(proposals).where(and(eq(proposals.userId, who), inArray(proposals.status, unprinted)));
  await db.update(proposals).set({ userId: DELETED_READER }).where(eq(proposals.userId, who));

  await db.delete(submissions).where(and(eq(submissions.userId, who), inArray(submissions.status, unprinted)));
  await db.update(submissions).set({ userId: DELETED_READER }).where(eq(submissions.userId, who));

  if (user.email) await db.delete(loginCodes).where(eq(loginCodes.email, user.email.trim().toLowerCase()));
  await db.delete(users).where(eq(users.openId, who));
  return { removedFiles };
}
