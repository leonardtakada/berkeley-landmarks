import { publicProcedure, router } from "./_core/trpc";
import { listLandmarks } from "./db";
import { landmarks as staticLandmarks } from "../data/landmarks";

/**
 * Landmarks served from the DB (live, includes approved community edits).
 * Falls back to the bundled static dataset when no DB is configured so the
 * app keeps working in local/offline dev.
 */
export const landmarksRouter = router({
  list: publicProcedure.query(async () => {
    const rows = await listLandmarks();
    if (rows && rows.length > 0) {
      return { source: "db" as const, landmarks: rows };
    }
    return { source: "static" as const, landmarks: staticLandmarks };
  }),
});
