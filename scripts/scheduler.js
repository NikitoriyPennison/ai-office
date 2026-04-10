#!/usr/bin/env node
/**
 * Планировщик — запускает ботов по расписанию + life-sim.
 * Работает на Railway без ПК.
 */
const cron = require("node-cron");
const { spawn } = require("child_process");
const path = require("path");

const SCRIPTS_DIR = __dirname;

function runScript(name, args = []) {
  const scriptPath = path.join(SCRIPTS_DIR, name);
  console.log(`\n🚀 [${new Date().toLocaleTimeString()}] Запуск: ${name}`);

  return new Promise((resolve) => {
    const child = spawn("node", [scriptPath, ...args], {
      cwd: path.join(SCRIPTS_DIR, ".."),
      stdio: "inherit",
    });
    child.on("close", (code) => {
      console.log(`✅ [${new Date().toLocaleTimeString()}] ${name} завершён (код: ${code})`);
      resolve(code);
    });
    child.on("error", (err) => {
      console.log(`❌ ${name} ошибка: ${err.message}`);
      resolve(1);
    });
  });
}

console.log("📅 Планировщик запущен");
console.log("   09:00 — Стик (market-analyst.js)");
console.log("   10:00 — Советник (advisor.js)");
console.log("   life-sim — каждые 30 сек\n");

// ── Стик — каждый день в 09:00 UTC ──
cron.schedule("0 9 * * *", () => {
  runScript("market-analyst.js");
});

// ── Советник — каждый день в 10:00 UTC ──
cron.schedule("0 10 * * *", () => {
  runScript("advisor.js");
});

// ── Life-sim (встроенный, лёгкий) ──
const Database = require("better-sqlite3");
const { randomUUID } = require("crypto");
const fs = require("fs");

const DB_PATH = path.join(SCRIPTS_DIR, "../data/database.sqlite");

const ACTIVITIES = {
  garik: [
    "Изучаю тренды на Thingiverse",
    "Анализирую продажи FDM-принтеров",
    "Читаю отчёт по рынку полимеров",
    "Мониторю Reddit r/3Dprinting",
    "Обновляю базу трендов",
  ],
  vanya: [
    "Оцениваю перспективность ниш",
    "Пишу рекомендации",
    "Анализирую белый список",
    "Изучаю кейсы 3D-бизнесов",
  ],
  pushkin: [
    "Проверяю входящие",
    "Составляю список контактов",
    "Сортирую заявки",
  ],
  tema: [
    "Придумываю тему для видео",
    "Изучаю тренды TikTok",
    "Монтирую ролик",
  ],
  stoyanov: [
    "Проверяю статус задач",
    "Планирую расписание",
    "Оцениваю эффективность",
  ],
};

const STATUSES = ["working", "thinking"];

function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomRange(min, max) { return Math.floor(Math.random() * (max - min)) + min; }

const agentState = {};

function initStates() {
  try {
    const db = new Database(DB_PATH);
    const agents = db.prepare("SELECT id FROM agents").all();
    db.close();
    for (const a of agents) {
      agentState[a.id] = {
        status: "idle",
        nextAction: randomRange(10, 40),
        workLeft: 0,
      };
    }
  } catch {}
}

function tick() {
  let db;
  try { db = new Database(DB_PATH); } catch { return; }

  for (const [id, state] of Object.entries(agentState)) {
    if (state.status !== "idle") {
      state.workLeft--;
      if (state.workLeft <= 0) {
        state.status = "idle";
        db.prepare("UPDATE agents SET current_status = 'idle' WHERE id = ?").run(id);
        state.nextAction = randomRange(20, 60);
      }
      continue;
    }

    state.nextAction--;
    if (state.nextAction <= 0 && ACTIVITIES[id]) {
      const status = randomItem(STATUSES);
      const activity = randomItem(ACTIVITIES[id]);
      const duration = randomRange(10, 40);

      state.status = status;
      state.workLeft = duration;
      state.nextAction = duration + randomRange(20, 60);

      db.prepare("UPDATE agents SET current_status = ? WHERE id = ?").run(status, id);
      try {
        db.prepare(`INSERT INTO activity_logs (id, entity_type, entity_id, action, details, created_at)
          VALUES (?, 'agent', ?, 'activity', ?, datetime('now'))`)
          .run(randomUUID(), id, JSON.stringify({ message: activity, statusText: activity }));
      } catch {}
    }
  }

  db.close();
}

// Запустить life-sim
setTimeout(() => {
  initStates();
  setInterval(tick, 3000);
  console.log("🏢 Life-sim активен");
}, 5000);
