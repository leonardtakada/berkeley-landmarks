/**
 * Seed (or re-sync) the landmarks table from the bundled dataset.
 * Idempotent: inserts missing rows, updates changed ones. Never deletes.
 * Run with DATABASE_URL set, e.g.:
 *   DATABASE_URL=mysql://... npx tsx server/seedLandmarks.ts
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDb } from "./db";
import { landmarksTable } from "../drizzle/schema";
import type { Landmark } from "../data/landmarks";

type SeedRow = typeof landmarksTable.$inferInsert;

function toRow(l: Landmark): SeedRow {
  return {
    id: l.id,
    name: l.name,
    address: l.address,
    latitude: l.latitude,
    longitude: l.longitude,
    architect: l.architect || null,
    yearBuilt: l.yearBuilt || null,
    category: l.category,
    landmarkNumber: l.landmarkNumber || null,
    description: l.description || null,
    style: l.style || null,
    nationalRegister: Boolean(l.nationalRegister),
    neighborhood: l.neighborhood || null,
    designationType: l.designationType ?? null,
    photoUrl: l.photoUrl ?? null,
  };
}

export async function seedLandmarks(): Promise<{ inserted: number; updated: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available — set DATABASE_URL");

  const raw = await readFile(path.resolve(__dirname, "../data/landmarks.json"), "utf8");
  const data: Landmark[] = JSON.parse(raw);

  let inserted = 0;
  let updated = 0;
  const BATCH = 50;
  for (let i = 0; i < data.length; i += BATCH) {
    const rows = data.slice(i, i + BATCH).map(toRow);
    const res = await db
      .insert(landmarksTable)
      .values(rows)
      .onDuplicateKeyUpdate({
        set: {
          name: sqlExcluded("name"),
          address: sqlExcluded("address"),
          latitude: sqlExcluded("latitude"),
          longitude: sqlExcluded("longitude"),
          architect: sqlExcluded("architect"),
          yearBuilt: sqlExcluded("year_built"),
          category: sqlExcluded("category"),
          landmarkNumber: sqlExcluded("landmark_number"),
          description: sqlExcluded("description"),
          style: sqlExcluded("style"),
          nationalRegister: sqlExcluded("national_register"),
          neighborhood: sqlExcluded("neighborhood"),
          designationType: sqlExcluded("designation_type"),
          photoUrl: sqlExcluded("photo_url"),
        },
      });
    void res;
    inserted += rows.length;
    updated += rows.length; // onDuplicateKeyUpdate doesn't report per-row outcome in mysql2
  }
  return { inserted, updated };
}

// Helper for VALUES(col) references in ON DUPLICATE KEY UPDATE.
import { sql } from "drizzle-orm";
function sqlExcluded(col: string) {
  return sql.raw(`values(${col})`);
}

if (require.main === module) {
  seedLandmarks()
    .then((r) => {
      console.log(`[seedLandmarks] processed ${r.inserted} rows (insert-or-update)`);
      process.exit(0);
    })
    .catch((e) => {
      console.error("[seedLandmarks] failed:", e);
      process.exit(1);
    });
}
