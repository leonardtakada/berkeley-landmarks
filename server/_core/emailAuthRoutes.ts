import { COOKIE_NAME, ONE_YEAR_MS } from "../../shared/const.js";
import type { Express, Request, Response } from "express";
import { RateLimitError, requestCode, verifyCode } from "./emailAuth";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { HttpError } from "../../shared/_core/errors.js";

function getUserJson(user: {
  id?: number;
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  role?: string;
}) {
  return {
    id: user.id ?? null,
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    role: user.role ?? "user",
  };
}

type CodeBody = { email?: unknown };

async function handleRequestCode(req: Request, res: Response) {
  const body = req.body as CodeBody | undefined;
  const email = typeof body?.email === "string" ? body.email : "";
  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  try {
    const { expiresInMinutes } = await requestCode(email);
    res.json({ success: true, expiresInMinutes });
  } catch (error) {
    if (error instanceof RateLimitError) {
      res.status(429).json({ error: error.message });
      return;
    }
    console.error("[EmailAuth] request-code failed:", error);
    const message = error instanceof Error ? error.message : "Failed to send code";
    const status = message === "Invalid email address" ? 400 : 500;
    res.status(status).json({ error: message });
  }
}

type VerifyBody = { email?: unknown; code?: unknown };

async function handleVerifyCode(req: Request, res: Response) {
  const body = req.body as VerifyBody | undefined;
  const email = typeof body?.email === "string" ? body.email : "";
  const code = typeof body?.code === "string" ? body.code : "";
  if (!email || !code) {
    res.status(400).json({ error: "email and code are required" });
    return;
  }

  try {
    const user = await verifyCode(email, code);
    const sessionToken = await sdk.createSessionToken(user.openId, {
      name: user.name || user.email || "",
      expiresInMs: ONE_YEAR_MS,
    });
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    // The app on a phone keeps no cookies: it signs each call with this
    // token instead (as the OAuth mobile flow does with app_session_id).
    res.json({ success: true, user: getUserJson(user), sessionToken });
  } catch (error) {
    console.error("[EmailAuth] verify-code failed:", error);
    const message = error instanceof Error ? error.message : "Verification failed";
    const status = message === "Incorrect code" || message.includes("expired") || message.includes("attempts") || message.includes("format") || message.includes("Invalid email") ? 400 : 500;
    res.status(status).json({ error: message });
  }
}

/**
 * Email OTP authentication routes. Sessions reuse the existing JWT cookie
 * mechanism (sdk.createSessionToken + COOKIE_NAME).
 */
export function registerEmailAuthRoutes(app: Express) {
  // Mounted under both /auth and /api/auth so the client can use either base.
  app.post("/auth/request-code", handleRequestCode);
  app.post("/api/auth/request-code", handleRequestCode);
  app.post("/auth/verify-code", handleVerifyCode);
  app.post("/api/auth/verify-code", handleVerifyCode);

  // Logout (clears the session cookie).
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // Current authenticated user (cookie or Bearer token).
  // A 401 means the session is gone (the app then lets it go); any other
  // failure is the server's, and the app keeps its reader signed in.
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ user: getUserJson(user) });
    } catch (error) {
      if (error instanceof HttpError && (error.statusCode === 401 || error.statusCode === 403)) {
        res.status(401).json({ error: "Not authenticated", user: null });
        return;
      }
      console.error("[Auth] /api/auth/me failed:", error);
      res.status(503).json({ error: "Couldn't check the session just now", user: null });
    }
  });
}
