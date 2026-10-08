import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  PhoneAccess,
  SESSION_DAYS,
  Throttle,
  allowedHost,
  cookieHeader,
  cookieOf,
  isLocal,
  newPasscode,
  sameOrigin,
  splitHost,
  tidyPasscode,
} from "../scripts/editor/phone";

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "phone-")), "access.json");

describe("the passcode", () => {
  it("is three groups of four characters a person can read and type", () => {
    for (let i = 0; i < 200; i++) {
      const p = newPasscode();
      expect(p).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      expect(p).not.toMatch(/[ILOU01]/);
    }
  });

  it("is not the same twice", () => {
    expect(new Set(Array.from({ length: 50 }, newPasscode)).size).toBe(50);
  });

  it("is read without regard to dashes, spaces or case", () => {
    expect(tidyPasscode(" abcd-ef23 gh45 ")).toBe("ABCDEF23GH45");
  });
});

describe("who is let in", () => {
  it("makes a passcode and a secret on first use, keeps them in a private file, and starts off", () => {
    const file = tmp();
    const a = new PhoneAccess(file);
    expect(a.enabled).toBe(false);
    expect(fs.statSync(file).mode & 0o077).toBe(0);
    const again = new PhoneAccess(file);
    expect(again.passcode).toBe(a.passcode);
  });

  it("remembers that phones were let in, across restarts", () => {
    const file = tmp();
    new PhoneAccess(file).setEnabled(true);
    expect(new PhoneAccess(file).enabled).toBe(true);
  });

  it("makes a new file if the old one is unreadable", () => {
    const file = tmp();
    fs.writeFileSync(file, "not json");
    expect(new PhoneAccess(file).passcode).toMatch(/^[A-Z2-9-]{14}$/);
  });

  it("checks the passcode however it was typed, and nothing else", () => {
    const a = new PhoneAccess(tmp());
    const lower = a.passcode.toLowerCase().replace(/-/g, " ");
    expect(a.check(a.passcode)).toBe(true);
    expect(a.check(lower)).toBe(true);
    expect(a.check("AAAA-AAAA-AAAA")).toBe(false);
    expect(a.check("")).toBe(false);
    expect(a.check(undefined)).toBe(false);
    expect(a.check(12345)).toBe(false);
    expect(a.check(a.passcode.slice(0, -1))).toBe(false);
  });

  it("signs a cookie that lasts, and refuses one that was changed, expired or made elsewhere", () => {
    const a = new PhoneAccess(tmp());
    const now = 1_800_000_000_000;
    const c = a.issue(now);
    expect(a.valid(c, now + 1000)).toBe(true);
    expect(a.valid(c, now + (SESSION_DAYS - 1) * 86_400_000)).toBe(true);
    expect(a.valid(c, now + (SESSION_DAYS + 1) * 86_400_000)).toBe(false);
    const [expires, mac] = c.split(".");
    expect(a.valid(`${Number(expires) + 86_400_000}.${mac}`, now)).toBe(false);
    expect(a.valid(`${expires}.${"0".repeat(64)}`, now)).toBe(false);
    expect(a.valid(`${expires}.nothex`, now)).toBe(false);
    expect(a.valid("", now)).toBe(false);
    expect(a.valid(undefined, now)).toBe(false);
    expect(new PhoneAccess(tmp()).valid(c, now)).toBe(false); // another editor's secret
  });

  it("signs every phone out when the passcode is renewed, and keeps the on/off switch", () => {
    const file = tmp();
    const a = new PhoneAccess(file);
    a.setEnabled(true);
    const before = a.passcode;
    const cookie = a.issue();
    a.renew();
    expect(a.passcode).not.toBe(before);
    expect(a.valid(cookie)).toBe(false);
    expect(a.enabled).toBe(true);
    expect(new PhoneAccess(file).passcode).toBe(a.passcode);
  });
});

describe("cookies", () => {
  it("are found among others", () => {
    expect(cookieOf("a=1; guide_editor=abc.def; b=2")).toBe("abc.def");
    expect(cookieOf("guide_editor=x")).toBe("x");
    expect(cookieOf("other=1")).toBeUndefined();
    expect(cookieOf(undefined)).toBeUndefined();
    expect(cookieOf("xguide_editor=1")).toBeUndefined();
  });

  it("are set for this site only, out of reach of scripts, and Secure when the connection is", () => {
    const plain = cookieHeader("v", false);
    expect(plain).toContain("HttpOnly");
    expect(plain).toContain("SameSite=Strict");
    expect(plain).not.toContain("Secure");
    expect(cookieHeader("v", true)).toContain("; Secure");
  });
});

describe("guessing", () => {
  it("allows five wrong tries, then makes the sixth wait a minute, doubling each time", () => {
    const t = new Throttle();
    const now = 1000;
    for (let i = 0; i < 4; i++) {
      t.fail("a", now);
      expect(t.wait("a", now)).toBe(0);
    }
    t.fail("a", now);
    expect(t.wait("a", now)).toBe(60_000);
    expect(t.wait("a", now + 61_000)).toBe(0);
    t.fail("a", now + 61_000);
    expect(t.wait("a", now + 61_000)).toBe(120_000);
  });

  it("never asks for more than an hour, and counts each caller on its own", () => {
    const t = new Throttle();
    for (let i = 0; i < 40; i++) t.fail("a", 0);
    expect(t.wait("a", 0)).toBe(3_600_000);
    expect(t.wait("b", 0)).toBe(0);
  });

  it("forgets a caller who gets in", () => {
    const t = new Throttle();
    for (let i = 0; i < 7; i++) t.fail("a", 0);
    t.succeed("a");
    expect(t.wait("a", 0)).toBe(0);
  });
});

describe("hosts", () => {
  it("are read with their ports, and IPv6 without its brackets", () => {
    expect(splitHost("Localhost:4777")).toEqual({ name: "localhost", port: "4777" });
    expect(splitHost("[::1]:4777")).toEqual({ name: "::1", port: "4777" });
    expect(splitHost("mac.ts.net")).toEqual({ name: "mac.ts.net", port: "" });
    expect(splitHost("")).toBeNull();
    expect(splitHost(undefined)).toBeNull();
    expect(splitHost("a b")).toBeNull();
    expect(splitHost("evil.com/path")).toBeNull();
  });

  const mine = new Set(["leonards-mac-studio.tailbfa6ac.ts.net", "leonards-mac-studio-2.local", "192.168.4.29", "100.65.156.28"]);

  it("are answered to only as localhost, on the editor's port, until phones are let in", () => {
    expect(allowedHost("localhost:4777", 4777, false, mine)).toBe(true);
    expect(allowedHost("127.0.0.1:4777", 4777, false, mine)).toBe(true);
    expect(allowedHost("[::1]:4777", 4777, false, mine)).toBe(true);
    expect(allowedHost("localhost:80", 4777, false, mine)).toBe(false);
    expect(allowedHost("localhost", 4777, false, mine)).toBe(false);
    expect(allowedHost("192.168.4.29:4777", 4777, false, mine)).toBe(false);
  });

  it("include this Mac's own names, on the port, once phones are let in", () => {
    expect(allowedHost("192.168.4.29:4777", 4777, true, mine)).toBe(true);
    expect(allowedHost("100.65.156.28:4777", 4777, true, mine)).toBe(true);
    expect(allowedHost("Leonards-Mac-Studio-2.local:4777", 4777, true, mine)).toBe(true);
    expect(allowedHost("leonards-mac-studio.tailbfa6ac.ts.net:4777", 4777, true, mine)).toBe(true);
    // behind a proxy that ends HTTPS there is no port
    expect(allowedHost("leonards-mac-studio.tailbfa6ac.ts.net", 4777, true, mine)).toBe(true);
    expect(allowedHost("192.168.4.29:8080", 4777, true, mine)).toBe(false);
  });

  it("refuse any other name, so a page that points its own domain here can't reach the editor", () => {
    for (const evil of ["evil.example:4777", "evil.example", "192.168.4.30:4777", "app.berkeley-tours.com", "192.168.4.29.evil.example:4777", "ts.net:4777"]) {
      expect(allowedHost(evil, 4777, true, mine)).toBe(false);
    }
    expect(allowedHost(undefined, 4777, true, mine)).toBe(false);
  });

  it("treat a request as local only from this Mac's loopback, for localhost, with nothing in between", () => {
    expect(isLocal("127.0.0.1", "localhost:4777", {})).toBe(true);
    expect(isLocal("::1", "[::1]:4777", {})).toBe(true);
    expect(isLocal("::ffff:127.0.0.1", "127.0.0.1:4777", {})).toBe(true);
    // a LAN machine that sends "Host: localhost"
    expect(isLocal("192.168.4.50", "localhost:4777", {})).toBe(false);
    // a tunnel or proxy on this Mac forwarding someone else's request
    expect(isLocal("127.0.0.1", "localhost:4777", { "x-forwarded-for": "203.0.113.9" })).toBe(false);
    expect(isLocal("127.0.0.1", "localhost:4777", { "cf-connecting-ip": "203.0.113.9" })).toBe(false);
    expect(isLocal("127.0.0.1", "localhost:4777", { forwarded: "for=1.2.3.4" })).toBe(false);
    // a proxy on this Mac asking by the Mac's public name
    expect(isLocal("127.0.0.1", "leonards-mac-studio.tailbfa6ac.ts.net", {})).toBe(false);
    expect(isLocal(undefined, "localhost:4777", {})).toBe(false);
  });

  it("accept a write's Origin only when it is the page's own host", () => {
    expect(sameOrigin(undefined, "localhost:4777")).toBe(true);
    expect(sameOrigin("http://localhost:4777", "localhost:4777")).toBe(true);
    expect(sameOrigin("https://mac.ts.net", "mac.ts.net")).toBe(true);
    expect(sameOrigin("http://evil.example", "localhost:4777")).toBe(false);
    expect(sameOrigin("http://localhost:4778", "localhost:4777")).toBe(false);
    expect(sameOrigin("null", "localhost:4777")).toBe(false);
  });
});
