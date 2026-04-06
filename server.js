import express from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "data.json");
const PORT = process.env.PORT || 3000;
const { Pool } = pg;
const hasPostgres = Boolean(process.env.DATABASE_URL);
const pool = hasPostgres
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    })
  : null;

const app = express();
app.use(express.json());

// Login endpoint
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required." });
    
    if (hasPostgres) {
      const result = await pool.query("SELECT id, username FROM users WHERE username = $1 AND password_hash = $2", [username, hashPassword(password)]);
      if (!result.rowCount) return res.status(401).json({ error: "Invalid credentials." });
      return res.json({ user: result.rows[0], token: `token_${result.rows[0].id}` });
    }
    
    // Demo: allow any username/password (for local testing)
    res.json({ user: { id: createId(), username }, token: `token_${Date.now()}` });
  } catch (err) {
    res.status(500).json({ error: err.message || "Login failed." });
  }
});

// Signup endpoint (creates user or returns existing)
app.post("/api/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required." });
    
    const userId = createId();
    const user = { id: userId, username };
    
    if (hasPostgres) {
      await pool.query("INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING", [userId, username, hashPassword(password)]);
      const result = await pool.query("SELECT id, username FROM users WHERE username = $1", [username]);
      if (!result.rowCount) return res.status(400).json({ error: "Username taken." });
      return res.status(201).json({ user: result.rows[0], token: `token_${result.rows[0].id}` });
    }
    
    res.status(201).json({ user, token: `token_${userId}` });
  } catch (err) {
    res.status(500).json({ error: err.message || "Signup failed." });
  }
});

async function ensureDb() {
  if (hasPostgres) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS members (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        priority TEXT NOT NULL DEFAULT 'normal',
        due TEXT NOT NULL DEFAULT '',
        follow_up TEXT NOT NULL DEFAULT '',
        assignees JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pending_tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'todo',
        priority TEXT NOT NULL DEFAULT 'normal',
        due TEXT NOT NULL DEFAULT '',
        follow_up TEXT NOT NULL DEFAULT '',
        assignees JSONB NOT NULL DEFAULT '[]'::jsonb,
        requester TEXT NOT NULL DEFAULT 'Member',
        requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    return;
  }
  try {
    await fs.access(DB_PATH);
  } catch {
    const seed = {
      members: [],
      tasks: [],
      pendingTasks: [],
    };
    await fs.writeFile(DB_PATH, JSON.stringify(seed, null, 2), "utf8");
  }
}

async function readDb() {
  await ensureDb();
  if (hasPostgres) {
    const [membersRes, tasksRes, pendingRes] = await Promise.all([
      pool.query("SELECT id, name FROM members ORDER BY created_at DESC"),
      pool.query(
        "SELECT id, title, description, status, priority, due, follow_up AS \"followUp\", assignees FROM tasks ORDER BY created_at DESC"
      ),
      pool.query(
        "SELECT id, title, description, status, priority, due, follow_up AS \"followUp\", assignees, requester, requested_at AS \"requestedAt\" FROM pending_tasks ORDER BY requested_at DESC"
      ),
    ]);
    return {
      members: membersRes.rows,
      tasks: tasksRes.rows,
      pendingTasks: pendingRes.rows,
    };
  }
  const raw = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeDb(data) {
  if (hasPostgres) {
    throw new Error("writeDb is not used for Postgres mode");
  }
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

function createId() {
  return Math.random().toString(36).slice(2, 10);
}

// Simple password hashing (for demo - use bcrypt in production)
function hashPassword(pwd) {
  return Buffer.from(pwd).toString('base64');
}

function verifyPassword(pwd, hash) {
  return hashPassword(pwd) === hash;
}

app.get("/api/state", async (_req, res) => {
  const db = await readDb();
  res.json(db);
});

app.post("/api/members", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const role = String(req.body?.role || "member").trim() || "member";
    if (!name) return res.status(400).json({ error: "Name is required." });

    const member = { id: createId(), name, role };
    if (hasPostgres) {
      await pool.query("INSERT INTO members (id, name, role) VALUES ($1, $2, $3)", [member.id, member.name, member.role]);
    } else {
      const db = await readDb();
      db.members.push(member);
      await writeDb(db);
    }
    res.status(201).json(member);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to add member." });
  }
});

app.patch("/api/members/:id/role", async (req, res) => {
  try {
    const { id } = req.params;
    const role = String(req.body?.role || "member").trim() || "member";
    if (!id) return res.status(400).json({ error: "Member id is required." });
    if (hasPostgres) {
      await pool.query("UPDATE members SET role=$1 WHERE id=$2", [role, id]);
      const result = await pool.query("SELECT id, name, role FROM members WHERE id=$1", [id]);
      if (!result.rowCount) return res.status(404).json({ error: "Member not found." });
      return res.json(result.rows[0]);
    }

    const db = await readDb();
    const idx = db.members.findIndex((m) => m.id === id);
    if (idx === -1) return res.status(404).json({ error: "Member not found." });
    db.members[idx].role = role;
    await writeDb(db);
    res.json(db.members[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to update member role." });
  }
});

app.delete("/api/members/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (hasPostgres) {
      await pool.query("DELETE FROM members WHERE id = $1", [id]);
      await pool.query("UPDATE tasks SET assignees = (SELECT COALESCE(jsonb_agg(v), '[]'::jsonb) FROM jsonb_array_elements_text(assignees) AS v WHERE v <> $1)", [id]);
      await pool.query("UPDATE pending_tasks SET assignees = (SELECT COALESCE(jsonb_agg(v), '[]'::jsonb) FROM jsonb_array_elements_text(assignees) AS v WHERE v <> $1)", [id]);
    } else {
      const db = await readDb();
      db.members = db.members.filter((m) => m.id !== id);
      db.tasks = db.tasks.map((t) => ({ ...t, assignees: t.assignees.filter((mId) => mId !== id) }));
      db.pendingTasks = db.pendingTasks.map((t) => ({ ...t, assignees: t.assignees.filter((mId) => mId !== id) }));
      await writeDb(db);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to remove member." });
  }
});

app.post("/api/tasks/request", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ error: "Task title is required." });

    const pending = {
      id: createId(),
      title,
      description: String(req.body?.description || "").trim(),
      status: String(req.body?.status || "todo"),
      priority: String(req.body?.priority || "normal"),
      due: String(req.body?.due || ""),
      followUp: String(req.body?.followUp || ""),
      assignees: Array.isArray(req.body?.assignees) ? req.body.assignees : [],
      requester: String(req.body?.requester || "Member"),
      requestedAt: new Date().toISOString(),
    };
    if (hasPostgres) {
      await pool.query(
        "INSERT INTO pending_tasks (id, title, description, status, priority, due, follow_up, assignees, requester, requested_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)",
        [
          pending.id,
          pending.title,
          pending.description,
          pending.status,
          pending.priority,
          pending.due,
          pending.followUp,
          JSON.stringify(pending.assignees),
          pending.requester,
          pending.requestedAt,
        ]
      );
    } else {
      const db = await readDb();
      db.pendingTasks.unshift(pending);
      await writeDb(db);
    }
    res.status(201).json(pending);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to create request." });
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ error: "Task title is required." });

    const task = {
      id: createId(),
      title,
      description: String(req.body?.description || "").trim(),
      status: String(req.body?.status || "todo"),
      priority: String(req.body?.priority || "normal"),
      due: String(req.body?.due || ""),
      followUp: String(req.body?.followUp || ""),
      assignees: Array.isArray(req.body?.assignees) ? req.body.assignees : [],
    };
    if (hasPostgres) {
      await pool.query(
        "INSERT INTO tasks (id, title, description, status, priority, due, follow_up, assignees) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",
        [task.id, task.title, task.description, task.status, task.priority, task.due, task.followUp, JSON.stringify(task.assignees)]
      );
    } else {
      const db = await readDb();
      db.tasks.unshift(task);
      await writeDb(db);
    }
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to create task." });
  }
});

app.post("/api/tasks/approve/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (hasPostgres) {
      const result = await pool.query(
        "SELECT id, title, description, status, priority, due, follow_up AS \"followUp\", assignees FROM pending_tasks WHERE id = $1",
        [id]
      );
      if (!result.rowCount) return res.status(404).json({ error: "Pending task not found." });
      const pending = result.rows[0];
      const approvedTask = { ...pending, id: createId() };
      await pool.query(
        "INSERT INTO tasks (id, title, description, status, priority, due, follow_up, assignees) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",
        [
          approvedTask.id,
          approvedTask.title,
          approvedTask.description,
          approvedTask.status,
          approvedTask.priority,
          approvedTask.due,
          approvedTask.followUp,
          JSON.stringify(approvedTask.assignees || []),
        ]
      );
      await pool.query("DELETE FROM pending_tasks WHERE id = $1", [id]);
      return res.json(approvedTask);
    }

    const db = await readDb();
    const idx = db.pendingTasks.findIndex((t) => t.id === id);
    if (idx === -1) return res.status(404).json({ error: "Pending task not found." });
    const pending = db.pendingTasks[idx];
    const approvedTask = { ...pending, id: createId() };
    delete approvedTask.requester;
    delete approvedTask.requestedAt;
    db.pendingTasks.splice(idx, 1);
    db.tasks.unshift(approvedTask);
    await writeDb(db);
    res.json(approvedTask);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to approve task." });
  }
});

app.delete("/api/tasks/reject/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (hasPostgres) {
      await pool.query("DELETE FROM pending_tasks WHERE id = $1", [id]);
    } else {
      const db = await readDb();
      db.pendingTasks = db.pendingTasks.filter((t) => t.id !== id);
      await writeDb(db);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to reject task." });
  }
});

app.patch("/api/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (hasPostgres) {
      const existing = await pool.query(
        "SELECT id, title, description, status, priority, due, follow_up AS \"followUp\", assignees FROM tasks WHERE id = $1",
        [id]
      );
      if (!existing.rowCount) return res.status(404).json({ error: "Task not found." });
      const current = existing.rows[0];
      const updated = {
        ...current,
        title: String(req.body?.title || current.title).trim(),
        description: String(req.body?.description ?? current.description),
        status: String(req.body?.status || current.status),
        priority: String(req.body?.priority || current.priority),
        due: String(req.body?.due ?? current.due),
        followUp: String(req.body?.followUp ?? current.followUp),
        assignees: Array.isArray(req.body?.assignees) ? req.body.assignees : current.assignees,
      };
      await pool.query(
        "UPDATE tasks SET title=$1, description=$2, status=$3, priority=$4, due=$5, follow_up=$6, assignees=$7::jsonb WHERE id=$8",
        [
          updated.title,
          updated.description,
          updated.status,
          updated.priority,
          updated.due,
          updated.followUp,
          JSON.stringify(updated.assignees || []),
          id,
        ]
      );
      return res.json(updated);
    }

    const db = await readDb();
    const idx = db.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return res.status(404).json({ error: "Task not found." });
    db.tasks[idx] = {
      ...db.tasks[idx],
      title: String(req.body?.title || db.tasks[idx].title).trim(),
      description: String(req.body?.description ?? db.tasks[idx].description),
      status: String(req.body?.status || db.tasks[idx].status),
      priority: String(req.body?.priority || db.tasks[idx].priority),
      due: String(req.body?.due ?? db.tasks[idx].due),
      followUp: String(req.body?.followUp ?? db.tasks[idx].followUp),
      assignees: Array.isArray(req.body?.assignees) ? req.body.assignees : db.tasks[idx].assignees,
    };
    await writeDb(db);
    res.json(db.tasks[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to update task." });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (hasPostgres) {
      await pool.query("DELETE FROM tasks WHERE id = $1", [id]);
    } else {
      const db = await readDb();
      db.tasks = db.tasks.filter((t) => t.id !== id);
      await writeDb(db);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to delete task." });
  }
});

app.use(express.static(__dirname));
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

await ensureDb();
app.listen(PORT, "0.0.0.0", () => {
  const nets = os.networkInterfaces();
  const lanIps = [];
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === "IPv4" && !ni.internal) lanIps.push(ni.address);
    }
  }
  console.log(`Dashboard server running at http://localhost:${PORT}`);
  if (lanIps.length) {
    console.log(`LAN access: ${lanIps.map((ip) => `http://${ip}:${PORT}`).join(" | ")}`);
  }
});
