import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, landmarksTable, users } from "../drizzle/schema";
import { EDITABLE_LANDMARK_FIELDS, validateSubmissionPayload } from "./submissionsLogic";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

function isOwnerEmail(user: InsertUser): boolean {
  const ownerEmail = ENV.ownerEmail.trim().toLowerCase();
  if (!ownerEmail) return false;
  return user.email?.trim().toLowerCase() === ownerEmail;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId || isOwnerEmail(user)) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/** DB column names for community-editable landmark fields. */
const EDITABLE_LANDMARK_COLUMNS: Record<string, string> = {
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
 * Apply an approved submission payload to the landmarks table.
 * Payload is re-validated against the editable-field whitelist; unknown or
 * invalid fields are skipped. Returns true if any column was updated.
 */
export async function applySubmissionToLandmark(
  landmarkId: string,
  payload: unknown
): Promise<boolean> {
  const validated = validateSubmissionPayload(payload);
  if (!validated.ok) return false;

  const updateSet: Record<string, string> = {};
  for (const [field, value] of Object.entries(validated.changes)) {
    const col = EDITABLE_LANDMARK_COLUMNS[field];
    const maxLen = EDITABLE_LANDMARK_FIELDS[field as keyof typeof EDITABLE_LANDMARK_FIELDS]?.maxLength;
    if (!col || maxLen === undefined) continue;
    if (typeof value !== "string" || value.length > maxLen) continue;
    updateSet[col] = value;
  }
  if (Object.keys(updateSet).length === 0) return false;

  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(landmarksTable)
    .set(updateSet as Record<string, never>)
    .where(eq(landmarksTable.id, landmarkId));
  return true;
}

/** All landmarks, served live from the DB (null if DB unavailable). */
export async function listLandmarks(): Promise<typeof landmarksTable.$inferSelect[] | null> {
  const db = await getDb();
  if (!db) return null;
  return db.select().from(landmarksTable);
}

// TODO: add feature queries here as your schema grows.
