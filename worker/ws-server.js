#!/usr/bin/env node
/**
 * Mission Control WebSocket Server
 * Broadcasts real-time events to connected clients.
 * 
 * Port 3101, proxied via Traefik at wss://factory.galson.pro/ws
 */

const { WebSocketServer, WebSocket } = require("ws");
const Database = require("better-sqlite3");
const path = require("path");
const http = require("http");

const PORT = 3101;
const DB_PATH = path.resolve(__dirname, "../data/database.sqlite");
const POLL_DB_INTERVAL = 3000; // check DB for changes every 3s

// Track last known state
let lastTaskHash = "";
let lastLogCount = 0;

const server = http.createServer((req, res) => {
  // Health check
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, clients: wss.clients.size }));
    return;
  }
  // REST endpoint to push events from API/worker
  if (req.method === "POST" && req.url === "/emit") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const event = JSON.parse(body);
        broadcast(event);
        res.writeHead(200);
        res.end('{"ok":true}');
      } catch {
        res.writeHead(400);
        res.end('{"error":"invalid json"}');
      }
    });
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, path: "/mcws" });

// Allowed origins (set via ALLOWED_ORIGINS env or allow all in dev)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(",") 
  : null; // null = allow all (dev mode)

wss.on("connection", (ws, req) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  
  // Origin check
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS && !ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
    console.log(`🚫 Rejected connection from ${origin} (${ip})`);
    ws.close(4003, "Origin not allowed");
    return;
  }
  
  console.log(`🔌 Client connected (${ip}), total: ${wss.clients.size}`);

  // Send initial state
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const tasks = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all();
    const agents = db.prepare("SELECT * FROM agent_registry").all();
    db.close();
    
    ws.send(JSON.stringify({ type: "init", tasks, agents }));
  } catch (e) {
    console.error("Init error:", e.message);
  }

  ws.on("close", () => {
    console.log(`🔌 Client disconnected, total: ${wss.clients.size}`);
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      // Client can send task:sendMessage
      if (msg.type === "task:sendMessage" && msg.taskId && msg.message) {
        handleTaskMessage(msg);
      }
    } catch { /* ignore */ }
  });
});

function broadcast(event) {
  const data = JSON.stringify(event);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

async function handleTaskMessage(msg) {
  // Save comment and broadcast
  const crypto = require("crypto");
  const db = new Database(DB_PATH, { readonly: false });
  
  const commentId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO task_comments (id, task_id, author_type, author_id, body, created_at)
    VALUES (?, ?, 'user', 'max', ?, datetime('now'))
  `).run(commentId, msg.taskId, msg.message);
  db.close();

  broadcast({
    type: "task:comment",
    taskId: msg.taskId,
    comment: {
      id: commentId,
      authorType: "user",
      authorId: "max",
      body: msg.message,
      createdAt: new Date().toISOString(),
    },
  });
}

// Poll DB for changes and broadcast
function pollForChanges() {
  if (wss.clients.size === 0) return; // no clients, skip

  try {
    const db = new Database(DB_PATH, { readonly: true });

    // Check tasks hash
    const tasks = db.prepare("SELECT id, status, updated_at FROM tasks ORDER BY id").all();
    const hash = JSON.stringify(tasks);
    if (hash !== lastTaskHash) {
      lastTaskHash = hash;
      const fullTasks = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all();
      broadcast({ type: "tasks:sync", tasks: fullTasks });
    }

    // Check for new logs
    const logCount = db.prepare("SELECT COUNT(*) as c FROM task_logs").get();
    const commentCount = db.prepare("SELECT COUNT(*) as c FROM task_comments").get();
    const totalLogs = (logCount?.c || 0) + (commentCount?.c || 0);
    
    if (totalLogs !== lastLogCount) {
      // Get recent entries
      const recentLogs = db.prepare(`
        SELECT id, task_id, agent_id, message, created_at, 'log' as type FROM task_logs
        ORDER BY created_at DESC LIMIT 5
      `).all();
      const recentComments = db.prepare(`
        SELECT id, task_id, author_type, author_id, body as message, created_at, 'comment' as type FROM task_comments
        ORDER BY created_at DESC LIMIT 5
      `).all();

      broadcast({ 
        type: "logs:update", 
        entries: [...recentLogs, ...recentComments].sort((a, b) => 
          (b.created_at || "").localeCompare(a.created_at || "")
        ).slice(0, 10),
      });
      lastLogCount = totalLogs;
    }

    db.close();
  } catch (e) {
    console.error("Poll error:", e.message);
  }
}

setInterval(pollForChanges, POLL_DB_INTERVAL);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 WebSocket server running on port ${PORT}`);
});


// Graceful shutdown
function shutdown(signal) {
  console.log(`
${signal} received. Closing WebSocket server...`);
  wss.clients.forEach(client => {
    client.close(1001, "Server shutting down");
  });
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
