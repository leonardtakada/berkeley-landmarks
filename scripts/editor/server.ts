/**
 * The guide editor: a page for adding and managing landmarks and walks.
 *
 *   pnpm editor        → http://localhost:4777
 *
 * It edits the files the app is built from (data/landmarks.ts, data/tours.ts,
 * and the JSON mirror) and runs the scripts that follow an edit. It runs on
 * this machine only — not part of the live server — and answers only to
 * localhost, so nothing outside can write to the guide.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import { Guide, Refusal } from "./guide";

const ROOT = path.resolve(process.env.EDITOR_ROOT ?? process.cwd());
const PORT = Number(process.env.EDITOR_PORT ?? 4777);
const PAGE = path.join(__dirname, "index.html");
const guide = new Guide(ROOT);

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

function send(res: http.ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : String(body));
}

function body(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 2_000_000) reject(new Refusal("That is too large"));
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

/** Only this page, on localhost, may ask: a page on another site can't write to the guide. */
function fromHere(req: http.IncomingMessage) {
  const host = req.headers.host ?? "";
  if (host !== `localhost:${PORT}` && host !== `127.0.0.1:${PORT}`) return false;
  if (req.method === "GET") return true;
  const origin = req.headers.origin;
  return (!origin || origin === `http://${host}`) && /^application\/json/.test(req.headers["content-type"] ?? "");
}

function busy() {
  if (job?.status === "running") throw new Refusal(`"${job.label}" is running; wait for it to finish`);
}

async function route(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const parts = url.pathname.split("/").filter(Boolean);
  const m = req.method ?? "GET";

  if (m === "GET" && !parts.length) return send(res, 200, fs.readFileSync(PAGE, "utf8"), "text/html");
  if (parts[0] !== "api") return send(res, 404, { error: "Not found" });

  const [, kind, id] = parts;
  if (m === "GET" && kind === "state") {
    return send(res, 200, { ...guide.snapshot(), job: job && { ...job, output: undefined } });
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

const server = http.createServer((req, res) => {
  if (!fromHere(req)) return send(res, 403, { error: "This page answers only to localhost" });
  route(req, res).catch((e) => {
    if (e instanceof Refusal) return send(res, 400, { error: e.message, details: e.details });
    console.error(e);
    send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Guide editor: http://localhost:${PORT}  (editing ${ROOT})`);
});
