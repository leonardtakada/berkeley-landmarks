import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerEmailAuthRoutes } from "./emailAuthRoutes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import path from "path";

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

  // Landmarks data for admin dashboard
  app.get("/landmarks.json", (_req, res) => {
    // Read the landmarks data and return as JSON
    try {
      const fs = require('fs');
      const content = fs.readFileSync(path.resolve(process.cwd(), 'data/landmarks.json'), 'utf8');
      res.json(JSON.parse(content));
    } catch {
      res.json([]);
    }
  });

  // Photo moderation API (REST, simpler than tRPC for admin dashboard)
  app.get("/api/photos", async (req, res) => {
    const status = req.query.status || 'pending';
    try {
      const { getDb } = require('../server/db');
      const { photos } = require('../drizzle/schema');
      const { eq, desc } = require('drizzle-orm');
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
      const { getDb } = require('../server/db');
      const { photos } = require('../drizzle/schema');
      const { eq } = require('drizzle-orm');
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
      const { getDb } = require('../server/db');
      const { photos } = require('../drizzle/schema');
      const { eq } = require('drizzle-orm');
      const db = await getDb();
      if (!db) throw new Error('No DB');
      await db.update(photos).set({ status: 'rejected', reviewedAt: new Date() }).where(eq(photos.id, parseInt(req.params.id)));
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
