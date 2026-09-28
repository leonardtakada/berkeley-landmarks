/**
 * Readers' proposals of new landmarks — buildings and places of interest
 * not yet in the guide. Shared by the proposal form (to check before
 * sending) and the server (to validate what arrives); no database here.
 */
import { z } from "zod";

/** Photographs a single proposal may carry. */
export const MAX_PROPOSAL_PHOTOS = 4;

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => (v?.trim() ? v.trim() : undefined));

export const proposalPhotoSchema = z.object({
  base64: z.string().min(1),
  mimeType: z.enum(["image/jpeg", "image/png"]),
});

export const proposalInputSchema = z.object({
  name: z.string().trim().min(2, "Give the place a name").max(200),
  address: z.string().trim().min(4, "Give an address or a location").max(300),
  why: z.string().trim().min(20, "Say a little about why it belongs in the guide").max(3000),
  architect: optionalText(300),
  yearBuilt: optionalText(100),
  style: optionalText(200),
  photos: z.array(proposalPhotoSchema).max(MAX_PROPOSAL_PHOTOS).default([]),
});

export type ProposalInput = z.infer<typeof proposalInputSchema>;

/** Plain words for a proposal that fails validation. */
export function proposalError(input: unknown): string | null {
  const parsed = proposalInputSchema.safeParse(input);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  if (issue.path[0] === "photos" && issue.code === "too_big") {
    return `At most ${MAX_PROPOSAL_PHOTOS} photographs`;
  }
  return issue.message;
}

/**
 * A proposal that repeats a landmark already in the guide (same name, or
 * the same address), so readers can be told rather than filed twice.
 */
export function findExisting<T extends { name: string; address: string }>(
  proposal: Pick<ProposalInput, "name" | "address">,
  landmarks: T[],
): T | undefined {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(the|house|building|berkeley|ca|california)\b/g, "")
      .replace(/[^a-z0-9]/g, "");
  const street = (s: string) => norm(s.split(",")[0]);
  const name = norm(proposal.name);
  const address = street(proposal.address);
  return landmarks.find(
    (l) => (name.length > 3 && norm(l.name) === name) || (address.length > 4 && street(l.address) === address),
  );
}
