/**
 * Letting a phone into the editor.
 *
 * Off, the editor answers only to localhost. On, it also answers to this
 * Mac's own names and addresses (its Tailscale name, its .local name, its
 * IPs), but only to a browser that has signed in with the passcode. Nothing
 * here opens the editor to a name it can't vouch for: a page on another site
 * that points its own domain at this Mac still arrives with the wrong Host.
 */
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";

// -- passcode ---------------------------------------------------------------

/** No I, L, O or U, and no 0 or 1: easy to read off a screen and to type on a phone. */
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

/** Twelve of thirty characters, in threes of four: about 59 bits. */
export function newPasscode(): string {
  const pick = () => ALPHABET[crypto.randomInt(ALPHABET.length)];
  return [0, 1, 2].map(() => Array.from({ length: 4 }, pick).join("")).join("-");
}

/** What was typed, without the dashes, spaces or case. */
export const tidyPasscode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

const digest = (s: string) => crypto.createHash("sha256").update(s).digest();

// -- who is signed in -------------------------------------------------------

type Saved = { passcode: string; secret: string; enabled: boolean };

export const SESSION_DAYS = 90;
export const COOKIE = "guide_editor";

/**
 * Whether phones are let in, the passcode, and the secret that signs the
 * cookies a signed-in phone carries. Kept in one file (never in git), so a
 * phone stays signed in across restarts.
 */
export class PhoneAccess {
  private saved: Saved;

  constructor(private file: string) {
    this.saved = this.read() ?? this.fresh(false);
  }

  private read(): Saved | null {
    try {
      const s = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (typeof s.passcode === "string" && typeof s.secret === "string" && s.secret.length >= 32) {
        return { passcode: s.passcode, secret: s.secret, enabled: s.enabled === true };
      }
    } catch {
      /* none yet, or unreadable: a new one is made */
    }
    return null;
  }

  private write(s: Saved) {
    this.saved = s;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
  }

  private fresh(enabled: boolean): Saved {
    this.write({ passcode: newPasscode(), secret: crypto.randomBytes(32).toString("hex"), enabled });
    return this.saved;
  }

  get enabled() {
    return this.saved.enabled;
  }

  get passcode() {
    return this.saved.passcode;
  }

  setEnabled(enabled: boolean) {
    this.write({ ...this.saved, enabled });
  }

  /** A new passcode and a new secret: every phone is signed out. */
  renew() {
    this.fresh(this.saved.enabled);
  }

  check(given: unknown): boolean {
    if (typeof given !== "string") return false;
    return crypto.timingSafeEqual(digest(tidyPasscode(given)), digest(tidyPasscode(this.saved.passcode)));
  }

  private sign(expires: string) {
    return crypto.createHmac("sha256", this.saved.secret).update(expires).digest("hex");
  }

  /** The value of a cookie that says "signed in" until `SESSION_DAYS` from now. */
  issue(now = Date.now()): string {
    const expires = String(now + SESSION_DAYS * 86_400_000);
    return `${expires}.${this.sign(expires)}`;
  }

  valid(cookie: string | undefined, now = Date.now()): boolean {
    if (!cookie) return false;
    const [expires, mac] = cookie.split(".");
    if (!/^\d{10,16}$/.test(expires ?? "") || !/^[0-9a-f]{64}$/.test(mac ?? "")) return false;
    if (Number(expires) < now) return false;
    return crypto.timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(this.sign(expires), "hex"));
  }
}

export function cookieOf(header: string | undefined, name = COOKIE): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

export const cookieHeader = (value: string, secure: boolean) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86_400}${secure ? "; Secure" : ""}`;

/** Wrong guesses: five are free, then each costs a minute, doubling, to an hour. */
export class Throttle {
  private seen = new Map<string, { fails: number; until: number }>();

  constructor(
    private free = 5,
    private base = 60_000,
    private most = 3_600_000,
  ) {}

  /** Milliseconds this caller must wait; 0 if it may try. */
  wait(who: string, now = Date.now()): number {
    return Math.max(0, (this.seen.get(who)?.until ?? 0) - now);
  }

  fail(who: string, now = Date.now()) {
    const fails = (this.seen.get(who)?.fails ?? 0) + 1;
    const over = fails - this.free;
    this.seen.set(who, { fails, until: over >= 0 ? now + Math.min(this.most, this.base * 2 ** over) : 0 });
  }

  succeed(who: string) {
    this.seen.delete(who);
  }
}

// -- which names are this Mac's ---------------------------------------------

export const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

/** "host:4777", "[::1]:4777" → the name, lower-cased and unbracketed, and the port ("" if none). */
export function splitHost(header: string | undefined): { name: string; port: string } | null {
  const m = /^(\[[0-9a-f:.]+\]|[^:/\s]+)(?::(\d{1,5}))?$/i.exec((header ?? "").trim());
  return m ? { name: m[1].toLowerCase().replace(/^\[|\]$/g, ""), port: m[2] ?? "" } : null;
}

/** What a reverse proxy or tunnel adds: a request carrying any of these did not come from this machine's own browser. */
const FORWARDED = ["x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip", "forwarded", "cf-connecting-ip", "cf-ray", "tailscale-user-login"];

const loopbackAddress = (a: string | undefined) => a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";

/** True for a browser on this Mac, asking for localhost, with nothing between. These need no passcode. */
export function isLocal(remote: string | undefined, hostHeader: string | undefined, headers: Record<string, unknown>): boolean {
  const host = splitHost(hostHeader);
  return !!host && LOOPBACK.has(host.name) && loopbackAddress(remote) && !FORWARDED.some((k) => k in headers);
}

type Tailscale = { dns: string; short: string };

function tailscale(): Tailscale | null {
  for (const bin of ["/usr/local/bin/tailscale", "/opt/homebrew/bin/tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"]) {
    try {
      const out = execFileSync(bin, ["status", "--json"], { timeout: 3000, stdio: ["ignore", "pipe", "ignore"] });
      const self = JSON.parse(String(out)).Self;
      const dns = String(self?.DNSName ?? "").replace(/\.$/, "").toLowerCase();
      if (dns) return { dns, short: dns.split(".")[0] };
    } catch {
      /* not here, or not running */
    }
  }
  return null;
}

function bonjour(): string | null {
  try {
    const name = String(execFileSync("scutil", ["--get", "LocalHostName"], { timeout: 2000, stdio: ["ignore", "pipe", "ignore"] })).trim();
    return name ? `${name.toLowerCase()}.local` : null;
  } catch {
    return os.hostname().toLowerCase().endsWith(".local") ? os.hostname().toLowerCase() : null;
  }
}

export type Way = { label: string; host: string };

/** The ways a phone can address this Mac, best first. */
export function ways(): Way[] {
  const out: Way[] = [];
  const ts = tailscale();
  if (ts) out.push({ label: "Anywhere, through Tailscale", host: ts.dns }, { label: "Anywhere, through Tailscale (short name)", host: ts.short });
  const b = bonjour();
  if (b) out.push({ label: "On the same Wi-Fi", host: b });
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.internal || a.family !== "IPv4") continue;
      out.push({ label: a.address.startsWith("100.") ? "Tailscale address" : "Wi-Fi address", host: a.address });
    }
  }
  return out;
}

/** Every name that means this Mac. IPv6 addresses count too, since a phone may use one. */
export function ownNames(extra: string[] = []): Set<string> {
  const names = new Set(ways().map((w) => w.host));
  names.add(os.hostname().toLowerCase());
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) if (!a.internal) names.add(a.address.toLowerCase().replace(/%.*/, ""));
  }
  for (const e of extra) names.add(e.trim().toLowerCase());
  return names;
}

/**
 * Whether a request's Host is one this editor answers to. localhost always
 * (on the editor's own port); with phones let in, this Mac's own names too —
 * on that port, or on none when a proxy that terminates HTTPS sits in front.
 */
export function allowedHost(hostHeader: string | undefined, port: number, phones: boolean, names: Set<string>): boolean {
  const host = splitHost(hostHeader);
  if (!host) return false;
  if (LOOPBACK.has(host.name)) return host.port === String(port);
  if (!phones) return false;
  if (host.port !== "" && host.port !== String(port)) return false;
  return names.has(host.name) || host.name.endsWith(".ts.net");
}

/** Whether a POST's Origin, if it has one, is the page's own host. */
export function sameOrigin(origin: string | undefined, hostHeader: string | undefined): boolean {
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase() === (hostHeader ?? "").toLowerCase();
  } catch {
    return false;
  }
}

// -- the home screen icon ---------------------------------------------------

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" fill="#0B2E8C"/><path d="M45 130V50l45 45 45-45v80" fill="none" stroke="#F2F0E6" stroke-width="16"/></svg>`;
let icon: Buffer | null = null;

/** The icon iOS puts on the Home Screen: a PNG, since it won't take an SVG. */
export async function homeIcon(): Promise<Buffer> {
  icon ??= await sharp(Buffer.from(ICON)).png().toBuffer();
  return icon;
}
