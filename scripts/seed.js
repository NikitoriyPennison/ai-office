#!/usr/bin/env node
// Seed database with example data for testing
const Database = require("better-sqlite3");
const { randomUUID } = require("crypto");
const path = require("path");

const dbPath = path.resolve(__dirname, "../data/database.sqlite");
const db = new Database(dbPath);

console.log("🌱 Seeding database...");

// Seed some activity logs
const activities = [
  { entity_type: "agent", action: "status_change", details: '{"status":"working","message":"Пишу пост для Telegram"}' },
  { entity_type: "agent", action: "status_change", details: '{"status":"idle","message":"Жду задачу"}' },
  { entity_type: "task", action: "created", details: '{"title":"Написать пост про AI"}' },
  { entity_type: "task", action: "completed", details: '{"title":"Сделать карусель"}' },
  { entity_type: "agent", action: "status_change", details: '{"status":"working","message":"Генерирую изображение"}' },
];

const agents = db.prepare("SELECT id FROM agents").all();
if (!agents.length) {
  console.log("⚠️  Нет агентов в базе. Сначала запусти: bash scripts/setup.sh");
  process.exit(1);
}

const insertLog = db.prepare(
  "INSERT INTO activity_logs (id, entity_type, entity_id, action, details, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', ?))"
);

for (let i = 0; i < 20; i++) {
  const act = activities[i % activities.length];
  const agent = agents[i % agents.length];
  insertLog.run(
    randomUUID(),
    act.entity_type,
    agent.id,
    act.action,
    act.details,
    `-${20 - i} minutes`
  );
}

// Set some agents to working/idle
const statuses = ["working", "idle", "working", "offline", "idle"];
agents.forEach((a, i) => {
  db.prepare("UPDATE agents SET current_status = ? WHERE id = ?").run(statuses[i % statuses.length], a.id);
});

console.log("✅ Seed done: 20 activity logs, agent statuses updated");
db.close();
