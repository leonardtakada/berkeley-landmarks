import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/** A photograph ready to send: a JPEG no wider than the guide needs. */
export interface PreparedPhoto {
  uri: string;
  base64: string;
  mimeType: "image/jpeg";
}

const MAX_WIDTH = 1600;

/**
 * Lets the reader pick up to `limit` photographs from their library and
 * readies each one to send — scaled down and saved as JPEG, so a handful
 * of phone photos fits comfortably in one request.
 */
export async function pickPhotos(limit: number): Promise<PreparedPhoto[]> {
  if (limit <= 0) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 1,
  });
  if (result.canceled) return [];
  const out: PreparedPhoto[] = [];
  for (const asset of result.assets.slice(0, limit)) {
    const ctx = ImageManipulator.manipulate(asset.uri);
    if (asset.width > MAX_WIDTH) ctx.resize({ width: MAX_WIDTH });
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.78, base64: true });
    if (saved.base64) out.push({ uri: saved.uri, base64: saved.base64, mimeType: "image/jpeg" });
  }
  return out;
}
