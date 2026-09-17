import express from "express";
import jwt from "jsonwebtoken";
import { db, previewFlagQuery, runFlagUpdate } from "./db";
import { cache, CACHE_MODE } from "./cache";

const app = express();
app.use(express.json());

const JWT_SECRET = "practice-secret-do-not-use-in-real-life";
const PORT = process.env.PORT || 3000;

// Simulates realistic DB latency so load tests have something to measure.
// Bump this up if you want to find a breaking point faster.
const ARTIFICIAL_DB_DELAY_MS = 15;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Auth ---
app.post("/login", (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "1h" });
  res.json({ token });
});

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "missing token" });
  try {
    jwt.verify(authHeader.replace("Bearer ", ""), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "invalid token" });
  }
}

// --- Users (list, no cache - good baseline load test target) ---
app.get("/users", async (req, res) => {
  await delay(ARTIFICIAL_DB_DELAY_MS);
  const users = db.prepare("SELECT * FROM users").all();
  res.json(users);
});

// --- Single user (cached - good target to see cache-hit vs cache-miss latency) ---
app.get("/users/:id", async (req, res) => {
  const key = `user:${req.params.id}`;
  const cached = await cache.get(key);
  if (cached) {
    res.setHeader("X-Cache", "HIT");
    return res.json(JSON.parse(cached));
  }

  await delay(ARTIFICIAL_DB_DELAY_MS);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!user) return res.status(404).json({ error: "not found" });

  await cache.set(key, JSON.stringify(user), 30); // 30s TTL - watch it expire
  res.setHeader("X-Cache", "MISS");
  res.json(user);
});

// --- Authenticated endpoint (for the login -> token -> request chained scenario) ---
app.get("/profile", authMiddleware, async (req, res) => {
  await delay(ARTIFICIAL_DB_DELAY_MS);
  res.json({ message: "authenticated profile data" });
});

// --- Orders (stateful write, decent target for POST load testing) ---
app.post("/orders", async (req, res) => {
  const { userId, total } = req.body;
  if (!userId || total == null) {
    return res.status(400).json({ error: "userId and total required" });
  }
  await delay(ARTIFICIAL_DB_DELAY_MS);
  const result = db
    .prepare("INSERT INTO orders (id, user_id, total, status) VALUES ((SELECT COALESCE(MAX(id),0)+1 FROM orders), ?, ?, 'pending')")
    .run(userId, total);
  res.status(201).json({ orderId: result.lastInsertRowid });
});

// --- SQL practice endpoints: JOIN + UPDATE with preview, mirroring what
// you'd do validating a dev's query before it ships ---
app.get("/admin/preview-flag-orders", (req, res) => {
  res.json({ wouldAffect: previewFlagQuery() });
});

app.post("/admin/run-flag-orders", (req, res) => {
  const changed = runFlagUpdate();
  res.json({ rowsUpdated: changed });
});

// --- Cache invalidation demo: update a user and clear their cache key ---
app.put("/users/:id", async (req, res) => {
  const { email } = req.body;
  await delay(ARTIFICIAL_DB_DELAY_MS);
  db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, req.params.id);
  await cache.del(`user:${req.params.id}`); // <- comment this out to reproduce the stale-cache bug on purpose
  res.json({ message: "updated" });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT} (cache mode: ${CACHE_MODE})`);
});
