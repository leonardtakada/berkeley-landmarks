/**
 * The guide editor: a page for adding and managing landmarks and walks.
 *
 *   pnpm editor        → http://localhost:4777
 *
 * It edits the files the app is built from (data/landmarks.ts, data/tours.ts,
 * and the JSON mirror) and runs the scripts that follow an edit. It runs on
 * this machine only — not part of the live server — and answers only to
 * localhost, so nothing outside can write to the guide. Phone access, when
 * switched on from the page, adds this Mac's own names behind a passcode.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import QRCode from "qrcode";

import { Guide, Refusal } from "./guide";
import {
  PhoneAccess,
  Throttle,
  allowedHost,
  cookieHeader,
  cookieOf,
  homeIcon,
  isLocal,
  ownNames,
  sameOrigin,
  ways,
} from "./phone";

const ROOT = path.resolve(process.env.EDITOR_ROOT ?? process.cwd());
const PORT = Number(process.env.EDITOR_PORT ?? 4777);
const PAGE = path.join(__dirname, "index.html");
const LOGIN = path.join(__dirname, "login.html");
const guide = new Guide(ROOT);
const access = new PhoneAccess(path.join(ROOT, "scripts/.cache/editor-phone.json"));
const throttle = new Throttle();
/** Hosts the page may also be reached by, beyond this Mac's own names (comma-separated). */
const EXTRA_HOSTS = (process.env.EDITOR_HOSTS ?? "").split(",").filter(Boolean);

// ---------------------------------------------------------------------------
// Scripts the page may run. Fixed commands; the only argument is a walk's id.
// ---------------------------------------------------------------------------

type Step = [command: string, ...args: string[]];
type Task = { label: string; steps: Step[] };

const tsx = (...args: string[]): Step => [path.join(ROOT, "node_modules/.bin/tsx"), ...args];

function task(name: string, arg: string): Task {
  const tours = guide.snapshot().tours.map((t) => t.id);
  const walk = () => {
    if (!tours.includes(arg)) throw new Refusal(`${arg} isn't a walk in the guide`);
    return arg;
  };
  switch (name) {
    case "photos":
      return { label: "Print new photographs into the app", steps: [[process.execPath, "scripts/bundle-photos.mjs"]] };
    case "checks":
      return {
        label: "Check the data",
        steps: [[path.join(ROOT, "node_modules/.bin/vitest"), "run", "__tests__/data.test.ts", "__tests__/walk-routes.test.ts", "__tests__/editor.test.ts"]],
      };
    case "route":
      return {
        label: "Draw the route along the streets",
        steps: [tsx("scripts/route-walks.ts", `--tour=${walk()}`), tsx("scripts/bake-walk-streets.ts")],
      };
    case "plate":
      return { label: "Print the fold-out map", steps: [tsx("scripts/iso/plates.ts", walk())] };
    default:
      throw new Refusal(`Unknown task ${name}`);
  }
}

type Job = { id: number; label: string; status: "running" | "ok" | "failed"; output: string; startedAt: number; endedAt?: number };
let job: Job | null = null;
let jobs = 0;
const MAX_OUTPUT = 60_000;

function run(t: Task): Job {
  if (job?.status === "running") throw new Refusal(`"${job.label}" is still running`);
  const j: Job = { id: ++jobs, label: t.label, status: "running", output: "", startedAt: Date.now() };
  job = j;
  const add = (s: string) => {
    j.output = (j.output + s).slice(-MAX_OUTPUT);
  };
  const next = (i: number) => {
    if (i >= t.steps.length) {
      j.status = "ok";
      j.endedAt = Date.now();
      return;
    }
    const [cmd, ...args] = t.steps[i];
    add(`$ ${[path.basename(cmd), ...args].join(" ")}\n`);
    const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" } });
    child.stdout.on("data", (b) => add(String(b)));
    child.stderr.on("data", (b) => add(String(b)));
    child.on("error", (e) => {
      add(`\n${e.message}\n`);
      j.status = "failed";
      j.endedAt = Date.now();
    });
    child.on("close", (code) => {
      if (j.status !== "running") return;
      if (code === 0) return next(i + 1);
      add(`\nStopped: exit code ${code}\n`);
      j.status = "failed";
      j.endedAt = Date.now();
    });
  };
  next(0);
  return j;
}

// ---------------------------------------------------------------------------
// Where an address is. OpenStreetMap's Nominatim, asked from here rather than
// from the page so it gets a proper User-Agent and no more than a request a
// second, as its usage policy asks.
// ---------------------------------------------------------------------------

type Place = { latitude: number; longitude: number; name: string; building: boolean };
const places = new Map<string, Place[]>();
let lastLookup = 0;
/** The data checks' bounds, so a hit outside Berkeley is dropped. */
const BERKELEY = { south: 37.84, north: 37.91, west: -122.31, east: -122.23 };

async function geocode(q: string): Promise<Place[]> {
  const key = q.trim().toLowerCase();
  if (!key) return [];
  const known = places.get(key);
  if (known) return known;
  const wait = lastLookup + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastLookup = Date.now();
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    format: "jsonv2",
    limit: "3",
    countrycodes: "us",
    viewbox: `${BERKELEY.west - 0.02},${BERKELEY.north + 0.02},${BERKELEY.east + 0.02},${BERKELEY.south - 0.02}`,
    bounded: "1",
    q: /berkeley/i.test(q) ? q : `${q}, Berkeley, CA`,
  }).toString();
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": "BerkeleyTours-guide-editor/1.0" }, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Refusal("Couldn't reach the address lookup. Place the pin by hand.");
  }
  if (!res.ok) throw new Refusal(`The address lookup answered ${res.status}. Place the pin by hand.`);
  const hits = (await res.json()) as { lat: string; lon: string; display_name: string; addresstype?: string; type?: string }[];
  const found = hits
    .map((h) => ({
      latitude: Number(h.lat),
      longitude: Number(h.lon),
      name: h.display_name,
      building: ["house", "building", "place", "amenity", "tourism", "shop", "office", "man_made", "historic"].includes(h.addresstype ?? h.type ?? ""),
    }))
    .filter((h) => h.latitude > BERKELEY.south && h.latitude < BERKELEY.north && h.longitude > BERKELEY.west && h.longitude < BERKELEY.east);
  places.set(key, found);
  return found;
}

// ---------------------------------------------------------------------------

function send(res: http.ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : String(body));
}

function body(req: http.IncomingMessage, limit = 2_000_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > limit) {
        reject(new Refusal("That is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Refusal("That wasn't understood"));
      }
    });
  });
}

/** Names that mean this Mac. Looking them up asks Tailscale and macOS, so it is done at most every half minute. */
let names: { at: number; set: Set<string> } = { at: 0, set: new Set() };
function ownHosts() {
  if (Date.now() - names.at > 30_000) names = { at: Date.now(), set: ownNames(EXTRA_HOSTS) };
  return names.set;
}

/** A write must come from the editor's own page: the right Origin, and JSON, which a page on another site can't send without asking first. */
function fromThisPage(req: http.IncomingMessage) {
  return sameOrigin(req.headers.origin, req.headers.host) && /^application\/json/.test(req.headers["content-type"] ?? "");
}

const isHttps = (req: http.IncomingMessage) => req.headers["x-forwarded-proto"] === "https" || "encrypted" in req.socket;

/** What a phone that hasn't signed in gets: the passcode page, or, for the editor's own calls, a 401 that sends the page back to it. */
async function signIn(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const who = req.socket.remoteAddress ?? "?";
  if (req.method === "GET" && url.pathname === "/icon.png") {
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" });
    return void res.end(await homeIcon());
  }
  if (req.method === "POST" && url.pathname === "/login") {
    const wait = throttle.wait(who);
    if (wait) return send(res, 429, { error: `Too many tries. Wait ${Math.ceil(wait / 1000)} seconds, then try again.` });
    const { passcode } = (await body(req, 2_000)) as { passcode?: unknown };
    if (!access.check(passcode)) {
      throttle.fail(who);
      return send(res, 401, { error: "That isn't the passcode." });
    }
    throttle.succeed(who);
    res.setHeader("Set-Cookie", cookieHeader(access.issue(), isHttps(req)));
    return send(res, 200, { ok: true });
  }
  if (req.method === "GET" && !url.pathname.startsWith("/api/")) return send(res, 200, fs.readFileSync(LOGIN, "utf8"), "text/html");
  return send(res, 401, { error: "Sign in again" });
}

function busy() {
  if (job?.status === "running") throw new Refusal(`"${job.label}" is running; wait for it to finish`);
}

async function route(req: http.IncomingMessage, res: http.ServerResponse, local: boolean) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);
  const m = req.method ?? "GET";

  if (m === "GET" && !parts.length) return send(res, 200, fs.readFileSync(PAGE, "utf8"), "text/html");
  if (m === "GET" && parts[0] === "icon.png") {
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" });
    return void res.end(await homeIcon());
  }
  if (m === "GET" && parts[0] === "photo" && parts[1]) {
    // A print, to preview an upload in the form (the page can't read upload: addresses).
    const file = guide.photoPath(parts[1]);
    if (!file) return send(res, 404, { error: "Not found" });
    res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "no-store" });
    return void fs.createReadStream(file).pipe(res);
  }
  if (parts[0] !== "api") return send(res, 404, { error: "Not found" });

  const [, kind, id] = parts;
  if (m === "GET" && kind === "geocode") return send(res, 200, { results: await geocode(url.searchParams.get("q") ?? "") });
  if (m === "POST" && kind === "photos") {
    // A photograph as base64: up to 30 MB of file is about 40 MB of text.
    const { data } = (await body(req, 42_000_000)) as { data?: string };
    return send(res, 200, await guide.stageUpload(typeof data === "string" ? data : ""));
  }
  if (m === "GET" && kind === "state") {
    return send(res, 200, { ...guide.snapshot(), local, phones: access.enabled, job: job && { ...job, output: undefined } });
  }
  if (kind === "phone") {
    // The switch and the passcode are for the person at this Mac, not for a phone.
    if (!local) return send(res, 403, { error: "Phone access is set from the Mac" });
    if (m === "POST") {
      const { enabled, renew } = (await body(req)) as { enabled?: unknown; renew?: unknown };
      if (typeof enabled === "boolean") access.setEnabled(enabled);
      if (renew === true) access.renew();
      // The answer goes first; then the editor moves between localhost-only and every interface.
      res.on("finish", () => setTimeout(rebind, 50));
    }
    names = { at: 0, set: names.set };
    return send(res, 200, {
      enabled: access.enabled,
      passcode: access.passcode,
      port: PORT,
      // Only the best way gets a code to scan; the others are listed.
      urls: await Promise.all(ways().map(async (w, i) => ({ ...w, url: `http://${w.host}:${PORT}`, ...(i === 0 ? { qr: await QRCode.toString(`http://${w.host}:${PORT}`, { type: "svg", margin: 1, width: 168 }) } : {}) }))),
    });
  }
  if (m === "GET" && kind === "job") return send(res, 200, { job });

  if (kind === "landmarks") {
    if (m === "POST" && id === "import") {
      busy();
      const { ids } = (await body(req)) as { ids?: string[] };
      return send(res, 200, guide.importLandmarks(Array.isArray(ids) ? ids : []));
    }
    if (m === "POST" && !id) return busy(), send(res, 200, guide.saveLandmark(await body(req), "create"));
    if (m === "PUT" && id) {
      busy();
      return send(res, 200, guide.saveLandmark({ ...((await body(req)) as object), id }, "update"));
    }
    if (m === "DELETE" && id) return busy(), guide.deleteLandmark(id), send(res, 200, { ok: true });
  }
  if (kind === "tours") {
    if (m === "POST" && !id) return busy(), send(res, 200, guide.saveTour(await body(req), "create"));
    if (m === "PUT" && id) {
      busy();
      return send(res, 200, guide.saveTour({ ...((await body(req)) as object), id }, "update"));
    }
    if (m === "DELETE" && id) return busy(), guide.deleteTour(id), send(res, 200, { ok: true });
  }
  if (m === "POST" && kind === "run") {
    const { task: name, arg } = (await body(req)) as { task?: string; arg?: string };
    return send(res, 200, { job: { ...run(task(String(name), String(arg ?? ""))), output: undefined } });
  }
  return send(res, 404, { error: "Not found" });
}

function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!allowedHost(req.headers.host, PORT, access.enabled, access.enabled ? ownHosts() : new Set())) {
    return send(res, 403, { error: "This page answers only to localhost" });
  }
  const local = isLocal(req.socket.remoteAddress, req.headers.host, req.headers);
  const fail = (e: unknown) => {
    if (e instanceof Refusal) return send(res, 400, { error: e.message, details: e.details });
    console.error(e);
    send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  };
  if (req.method !== "GET" && !fromThisPage(req)) return send(res, 403, { error: "This page answers only to localhost" });
  // Anything not at this Mac's own browser needs the passcode, and was let in only because phones are on.
  if (!local && !(access.enabled && access.valid(cookieOf(req.headers.cookie)))) {
    if (!access.enabled) return send(res, 403, { error: "This page answers only to localhost" });
    return void signIn(req, res).catch(fail);
  }
  route(req, res, local).catch(fail);
}

/** On localhost only, or, with phones let in, on every interface (the passcode and the Host check do the guarding). */
const hostToBind = () => (access.enabled ? "0.0.0.0" : "127.0.0.1");

let server: http.Server | undefined;
let bound = "";

function serve(host: string) {
  const first = !server;
  let tries = 0;
  const s = http.createServer(handle);
  s.on("error", (e: NodeJS.ErrnoException) => {
    // The old listener is still letting go of the port.
    if (!first && e.code === "EADDRINUSE" && tries++ < 20) return void setTimeout(() => s.listen(PORT, host), 100);
    console.error(`Couldn't listen on ${host}:${PORT}: ${e.message}`);
    if (first) process.exit(1);
    // Moving between interfaces failed: stay on this Mac only.
    access.setEnabled(false);
    bound = "";
    rebind();
  });
  s.listen(PORT, host, () => {
    console.log(`Guide editor: http://localhost:${PORT}  (editing ${ROOT})${host === "0.0.0.0" ? "  Phones may sign in." : ""}`);
  });
  bound = host;
  return s;
}

function rebind() {
  const want = hostToBind();
  if (server && bound === want) return;
  const old = server;
  if (old) {
    old.close();
    old.closeIdleConnections();
  }
  server = serve(want);
}

rebind();
