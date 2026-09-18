import { boolean, double, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const photos = mysqlTable("photos", {
  id: int("id").autoincrement().primaryKey(),
  landmarkId: varchar("landmark_id", { length: 128 }).notNull(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  photoUrl: varchar("photo_url", { length: 512 }).notNull(),
  caption: text("caption"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by", { length: 64 }),
});

export type Photo = typeof photos.$inferSelect;
export type InsertPhoto = typeof photos.$inferInsert;

/**
 * Email OTP login codes. One active code per email; prior unconsumed codes
 * are invalidated when a new one is requested. Codes are stored hashed.
 */
export const loginCodes = mysqlTable("login_codes", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  codeHash: varchar("code_hash", { length: 128 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  attempts: int("attempts").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type LoginCode = typeof loginCodes.$inferSelect;
export type InsertLoginCode = typeof loginCodes.$inferInsert;

/**
 * Community-suggested landmark edits. Users propose field changes for a
 * landmark; admins (with advisory AI first-pass scoring) review them.
 * `userId` is the users.openId identity (e.g. `email:<address>`).
 */
export const submissions = mysqlTable("submissions", {
  id: int("id").autoincrement().primaryKey(),
  landmarkId: varchar("landmark_id", { length: 128 }).notNull(),
  userId: varchar("user_id", { length: 64 }).notNull(),
  /** edit = field changes; correction = factual fix; photo_suggestion = new/updated photo URL. */
  type: mysqlEnum("type", ["edit", "correction", "photo_suggestion"]).default("edit").notNull(),
  /** JSON object of proposed field changes: { field: newValue, ... }. */
  payload: json("payload").notNull(),
  /** Optional free-text note from the submitter explaining the change. */
  note: text("note"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  /** Advisory AI first-pass review: 0-100 risk score (higher = more likely bad). Null = not yet scored. */
  aiScore: int("ai_score"),
  /** Advisory AI flags, e.g. ["duplicate", "nonsensical", "spam"]. */
  aiFlags: json("ai_flags"),
  /** Short AI explanation for the score. */
  aiNote: text("ai_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by", { length: 64 }),
  reviewerNote: text("reviewer_note"),
});

export type Submission = typeof submissions.$inferSelect;
export type InsertSubmission = typeof submissions.$inferInsert;

/**
 * DB-backed landmarks. Seeded from data/landmarks.json; approved community
 * edits are applied here so the app serves live data instead of the bundled JSON.
 */
export const landmarksTable = mysqlTable("landmarks", {
  /** Stable slug id from the bundled dataset (e.g. 'lm-1'). */
  id: varchar("id", { length: 128 }).primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  address: varchar("address", { length: 300 }).notNull(),
  latitude: double("latitude").notNull(),
  longitude: double("longitude").notNull(),
  architect: varchar("architect", { length: 300 }),
  yearBuilt: varchar("year_built", { length: 100 }),
  category: varchar("category", { length: 64 }).notNull(),
  landmarkNumber: varchar("landmark_number", { length: 100 }),
  description: text("description"),
  style: varchar("style", { length: 200 }),
  nationalRegister: boolean("national_register").default(false).notNull(),
  neighborhood: varchar("neighborhood", { length: 120 }),
  designationType: varchar("designation_type", { length: 64 }),
  photoUrl: varchar("photo_url", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LandmarkRow = typeof landmarksTable.$inferSelect;
export type InsertLandmarkRow = typeof landmarksTable.$inferInsert;

// TODO: Add your tables here
