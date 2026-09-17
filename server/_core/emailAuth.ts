import { createHash, randomInt, timingSafeEqual } from "crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { User } from "../../drizzle/schema";
import { loginCodes } from "../../drizzle/schema";
import { ENV } from "./env";
import { getDb, getUserByOpenId, upsertUser } from "../db";

const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_WINDOW = 3;
const RATE_LIMIT_WINDOW_MINUTES = 15;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailToOpenId(email: string): string {
  return `email:${normalizeEmail(email)}`;
}

function hashCode(email: string, code: string): string {
  return createHash("sha256")
    .update(`${code}:${ENV.cookieSecret}:${normalizeEmail(email)}`)
    .digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Dev/test helper: compute the code hash the same way the server does. */
export function _computeCodeHash(email: string, code: string): string {
  return hashCode(email, code);
}

async function sendCodeEmail(email: string, code: string): Promise<void> {
  if (ENV.resendApiKey) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: ENV.emailFrom,
        to: [email],
        subject: `${code} is your Berkeley Tours sign-in code`,
        text: `Your Berkeley Tours sign-in code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Resend email delivery failed (${response.status}): ${body}`);
    }
    return;
  }
  // No mail provider configured — log for development.
  console.log(`[email-auth] code for ${email}: ${code}`);
}

export async function requestCode(rawEmail: string): Promise<{ expiresInMinutes: number }> {
  const email = normalizeEmail(rawEmail);
  if (!EMAIL_RE.test(email) || email.length > 320) {
    throw new Error("Invalid email address");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Rate limit: max 3 codes per email per 15 minutes.
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
  const recent = await db
    .select({ id: loginCodes.id })
    .from(loginCodes)
    .where(and(eq(loginCodes.email, email), gt(loginCodes.createdAt, windowStart)));
  if (recent.length >= MAX_CODES_PER_WINDOW) {
    throw new RateLimitError("Too many codes requested. Try again in a few minutes.");
  }

  // Invalidate prior unconsumed codes for this email.
  await db
    .update(loginCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(loginCodes.email, email), isNull(loginCodes.consumedAt)));

  const code = generateCode();
  await db.insert(loginCodes).values({
    email,
    codeHash: hashCode(email, code),
    expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000),
    attempts: 0,
  });

  await sendCodeEmail(email, code);

  return { expiresInMinutes: CODE_TTL_MINUTES };
}

export async function verifyCode(rawEmail: string, code: string): Promise<User> {
  const email = normalizeEmail(rawEmail);
  if (!EMAIL_RE.test(email) || email.length > 320) {
    throw new Error("Invalid email address");
  }
  const trimmedCode = code.trim();
  if (!/^\d{6}$/.test(trimmedCode)) {
    throw new Error("Invalid code format");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const rows = await db
    .select()
    .from(loginCodes)
    .where(and(eq(loginCodes.email, email), isNull(loginCodes.consumedAt), gt(loginCodes.expiresAt, new Date())))
    .orderBy(desc(loginCodes.id))
    .limit(1);

  const record = rows[0];
  if (!record) {
    throw new Error("Code expired or not found. Request a new code.");
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    throw new Error("Too many attempts. Request a new code.");
  }

  if (!safeEqualHex(record.codeHash, hashCode(email, trimmedCode))) {
    await db
      .update(loginCodes)
      .set({ attempts: record.attempts + 1 })
      .where(eq(loginCodes.id, record.id));
    throw new Error("Incorrect code");
  }

  await db.update(loginCodes).set({ consumedAt: new Date() }).where(eq(loginCodes.id, record.id));

  const name = email.split("@")[0] ?? email;
  const lastSignedIn = new Date();
  await upsertUser({
    openId: emailToOpenId(email),
    name,
    email,
    loginMethod: "email_otp",
    lastSignedIn,
  });

  const user = await getUserByOpenId(emailToOpenId(email));
  if (!user) {
    throw new Error("Failed to create user");
  }
  return user;
}
