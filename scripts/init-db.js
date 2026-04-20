#!/usr/bin/env node
/**
 * Инициализация БД — создаёт таблицы, агентов и админа.
 * Запускается при первом старте на сервере.
 */
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const DB_PATH = path.join(process.cwd(), "data", "database.sqlite");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Таблицы
db.exec(`
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT NOT NULL,
  role TEXT NOT NULL, description TEXT,
  position_x INTEGER DEFAULT 0, position_y INTEGER DEFAULT 0,
  current_status TEXT DEFAULT 'offline',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS agent_status_history (
  id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, status TEXT NOT NULL,
  status_text TEXT, started_at TEXT DEFAULT CURRENT_TIMESTAMP, ended_at TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  action TEXT NOT NULL, details TEXT, user_id TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, role TEXT DEFAULT 'viewer',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
  status TEXT DEFAULT 'backlog', priority TEXT DEFAULT 'medium',
  assigned_to TEXT, created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_to) REFERENCES agents(id) ON DELETE SET NULL
);
`);

// Агенты
const agents = [
  ["garik", "Стик", "📊", "Аналитик рынка 3D-печати", "Мониторит тренды и пишет ежедневные отчёты"],
  ["vanya", "Советник", "🧠", "Бизнес-советник", "Анализирует отчёты, отбирает идеи в белый список"],
  ["pushkin", "Дейви", "📞", "Секретарь-переводчик", "Звонит на русском и английском"],
  ["tema", "Блогер", "🎬", "TikTok блогер", "Создаёт видео про 3D-печать"],
  ["stoyanov", "Надзиратель", "👁️", "Менеджер задач", "Принимает указания, распределяет задания"],
  ["volodya", "Девелопер", "💻", "Разработчик", "Читает код, редактирует файлы, деплоит"],
  ["scriptwriter", "Сценарист", "✍️", "Контент-сценарист", "Создаёт TikTok сценарии про 3D-печать на базе Claude"],
];

const insert = db.prepare("INSERT OR IGNORE INTO agents (id, name, emoji, role, description, current_status) VALUES (?, ?, ?, ?, ?, 'idle')");
for (const a of agents) insert.run(...a);

// Админ
const bcrypt = require("bcryptjs");
const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
if (!adminExists) {
  const hash = bcrypt.hashSync("admin123", 10);
  db.prepare("INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, 'admin')")
    .run(crypto.randomUUID(), "admin", hash);
  console.log("Admin created: admin / admin123");
}

// JWT secret
const envPath = path.join(process.cwd(), ".env");
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, `JWT_SECRET=${crypto.randomBytes(32).toString("hex")}\n`);
  console.log(".env created");
}

// Config
const configDir = path.join(process.cwd(), "config");
fs.mkdirSync(configDir, { recursive: true });
const configPath = path.join(configDir, "office.json");
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify({
    officeName: "AI Office",
    domain: "localhost",
    agents: agents.map(([id, name, emoji, role]) => ({id, name, emoji, role, description: "", position: {x: 150, y: 280}})),
    openclaw: { sessionsBase: "~/.openclaw/agents", agentMapping: {} },
    sync: { idleThresholdMin: 5, offlineThresholdMin: 30, intervalSec: 120 },
    deploy: { method: "ssh", host: "localhost", user: "user", remotePath: "/opt/ai-office", ports: { app: 3100, websocket: 3101 } }
  }, null, 2));
  console.log("Config created");
}

// Reports dirs
fs.mkdirSync(path.join(process.cwd(), "reports", "whitelist"), { recursive: true });
fs.mkdirSync(path.join(process.cwd(), "content", "scripts"), { recursive: true });

db.close();
console.log("DB initialized with", agents.length, "agents");
