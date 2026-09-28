import fs from "fs";
import path from "path";

/** Where readers' photographs are kept; served at /uploads. */
export const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

/** Largest photograph accepted, decoded. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type UploadMime = "image/jpeg" | "image/png";

/**
 * Decodes a base64 photograph, checks its size, and saves it under
 * /uploads with a name starting `prefix`. Returns its public path.
 */
export function saveUpload(base64: string, mimeType: UploadMime, prefix: string): string {
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) throw new Error("The photograph is empty");
  if (buffer.length > MAX_UPLOAD_BYTES) throw new Error("File size must be under 5MB");
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const ext = mimeType === "image/png" ? "png" : "jpg";
  const safe = prefix.replace(/[^a-z0-9-]/gi, "").slice(0, 64) || "photo";
  const filename = `${safe}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return `/uploads/${filename}`;
}
