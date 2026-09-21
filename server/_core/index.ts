import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerEmailAuthRoutes } from "./emailAuthRoutes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import fs from "fs";
import path from "path";
import { eq, desc } from "drizzle-orm";
import { submissions } from "../../drizzle/schema";
import { photos } from "../../drizzle/schema";
import { getDb } from "../db";
import { applyApprovedChanges } from "../submissionsRouter";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Serve uploaded photos
  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

  // Admin dashboard
  app.get("/admin", (_req, res) => {
    res.sendFile(path.resolve(process.cwd(), "server/admin.html"));
  });

  // Privacy policy (public URL for App Store)
  app.get("/privacy", (_req, res) => {
    try {
      const md = fs.readFileSync(path.resolve(process.cwd(), "PRIVACY.md"), "utf8");
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const body = md
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/^###### (.*)$/gm, "<h6>$1</h6>").replace(/^##### (.*)$/gm, "<h5>$1</h5>")
        .replace(/^#### (.*)$/gm, "<h4>$1</h4>").replace(/^### (.*)$/gm, "<h3>$1</h3>")
        .replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>")
        .replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>")
        .replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(?<!<strong>[^<]*)\*([^*]+)\*/g, "<em>$1</em>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/\n{2,}/g, "\n<p>\n").replace(/\n(?!<)/g, "<br>\n");
      res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Privacy Policy — Berkeley Landmarks</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F7F3EC;color:#2A2520;max-width:720px;margin:0 auto;padding:32px 20px;line-height:1.6}h1,h2,h3{color:#1E3F32}a{color:#3D6B5C}</style></head><body>${body}</body></html>`);
    } catch (e: any) {
      res.status(500).send("Privacy policy unavailable");
    }
  });

  // Landmarks data for admin dashboard
  app.get("/landmarks.json", (_req, res) => {
    // Read the landmarks data and return as JSON
    try {
      const content = fs.readFileSync(path.resolve(process.cwd(), 'data/landmarks.json'), 'utf8');
      res.json(JSON.parse(content));
    } catch (e: any) {
      console.error('[landmarks.json] failed:', e?.message);

      res.json([]);
    }
  });

  // Photo moderation API (REST, simpler than tRPC for admin dashboard)
  app.get("/api/photos", async (req, res) => {
    const status = (String(req.query.status) || 'pending') as 'pending' | 'approved' | 'rejected';
    try {

      const db = await getDb();
      if (!db) return res.json([]);
      const result = await db.select().from(photos).where(eq(photos.status, status)).orderBy(desc(photos.createdAt));
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/photos/:id/approve", async (req, res) => {
    try {

      const db = await getDb();
      if (!db) throw new Error('No DB');
      await db.update(photos).set({ status: 'approved', reviewedAt: new Date() }).where(eq(photos.id, parseInt(req.params.id)));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/photos/:id/reject", async (req, res) => {
    try {

      const db = await getDb();
      if (!db) throw new Error('No DB');
      await db.update(photos).set({ status: 'rejected', reviewedAt: new Date() }).where(eq(photos.id, parseInt(req.params.id)));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Submission moderation API (REST, mirrors the tRPC submissions router for the admin dashboard)
  app.get("/api/submissions", async (req, res) => {
    const status = (String(req.query.status) || 'pending') as 'pending' | 'approved' | 'rejected';
    try {
      const db = await getDb();
      if (!db) return res.json([]);
      const result = await db.select().from(submissions).where(eq(submissions.status, status)).orderBy(desc(submissions.createdAt));
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/submissions/:id/approve", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) throw new Error('No DB');
      const id = parseInt(req.params.id);
      const [row] = await db.select().from(submissions).where(eq(submissions.id, id)).limit(1);
      if (row && row.status === 'pending') await applyApprovedChanges(row);
      await db.update(submissions).set({ status: 'approved', reviewedAt: new Date() }).where(eq(submissions.id, id));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/submissions/:id/reject", async (req, res) => {
    try {
      const db = await getDb();
      if (!db) throw new Error('No DB');
      await db.update(submissions).set({ status: 'rejected', reviewedAt: new Date() }).where(eq(submissions.id, parseInt(req.params.id)));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  registerEmailAuthRoutes(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}

startServer().catch(console.error);
