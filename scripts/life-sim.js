#!/usr/bin/env node
/**
 * Life Simulator — фоновый процесс, который оживляет агентов.
 * Случайно меняет статусы, генерирует активность в ленте.
 * Запускается постоянно в фоне.
 */

const Database = require("better-sqlite3");
const path = require("path");
const { randomUUID } = require("crypto");

const DB_PATH = path.join(__dirname, "../data/database.sqlite");

const ACTIVITIES = {
  garik: [
    "Изучаю новые тренды на Thingiverse",
    "Анализирую продажи FDM-принтеров",
    "Читаю отчёт по рынку полимеров",
    "Сравниваю цены на филамент",
    "Мониторю Reddit r/3Dprinting",
    "Составляю график популярности материалов",
    "Изучаю конкурентов на Etsy",
    "Обновляю базу трендов",
  ],
  vanya: [
    "Оцениваю перспективность новых ниш",
    "Пишу рекомендации по расширению",
    "Анализирую белый список идей",
    "Готовлю стратегию на неделю",
    "Изучаю кейсы успешных 3D-бизнесов",
    "Оцениваю ROI предложений Стика",
    "Пишу план найма новых ботов",
    "Проверяю метрики эффективности",
  ],
  pushkin: [
    "Проверяю входящие звонки",
    "Составляю список контактов",
    "Готовлю скрипт приветствия",
    "Перевожу документ на эстонский",
    "Обновляю телефонную книгу",
    "Составляю отчёт по звонкам",
    "Тренирую произношение",
    "Сортирую входящие заявки",
  ],
};

const STATUSES = ["working", "thinking", "idle"];

function getDb() {
  return new Database(DB_PATH);
}

function log(db, agentId, message) {
  db.prepare(`
    INSERT INTO activity_logs (id, entity_type, entity_id, action, details, created_at)
    VALUES (?, 'agent', ?, 'activity', ?, datetime('now'))
  `).run(randomUUID(), agentId, JSON.stringify({ message, statusText: message }));
}

function setStatus(db, agentId, status) {
  db.prepare("UPDATE agents SET current_status = ? WHERE id = ?").run(status, agentId);
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomRange(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

// Состояние каждого агента
const agentState = {};

function initAgentState(agentId) {
  agentState[agentId] = {
    currentStatus: "idle",
    nextActionIn: randomRange(15, 60), // секунд до следующего действия
    workDuration: 0,
  };
}

function tick(agentId) {
  const state = agentState[agentId];
  if (!state) return;

  state.nextActionIn--;

  // Если работает — уменьшаем время работы
  if (state.currentStatus === "working" || state.currentStatus === "thinking") {
    state.workDuration--;
    if (state.workDuration <= 0) {
      // Закончил работу
      state.currentStatus = "idle";
      const db = getDb();
      setStatus(db, agentId, "idle");
      log(db, agentId, "Готово, отдыхаю");
      db.close();
      state.nextActionIn = randomRange(30, 90);
      return;
    }
  }

  // Время начать новое действие
  if (state.nextActionIn <= 0 && state.currentStatus === "idle") {
    const activities = ACTIVITIES[agentId];
    if (!activities) return;

    const status = randomItem(["working", "working", "thinking"]); // working чаще
    const activity = randomItem(activities);
    const duration = randomRange(20, 120); // 20-120 секунд работы

    state.currentStatus = status;
    state.workDuration = duration;
    state.nextActionIn = duration + randomRange(30, 90);

    const db = getDb();
    setStatus(db, agentId, status);
    log(db, agentId, activity);
    db.close();

    console.log(`[${new Date().toLocaleTimeString()}] ${agentId}: ${status} — ${activity} (${duration}s)`);
  }
}

// Запуск
console.log("🏢 Life Simulator запущен");
console.log("   Агенты будут периодически работать и отдыхать");
console.log("   Ctrl+C для остановки\n");

const db = getDb();
const agents = db.prepare("SELECT id FROM agents").all();
db.close();

for (const agent of agents) {
  initAgentState(agent.id);
  // Разнести старты чтобы не все начинали одновременно
  agentState[agent.id].nextActionIn = randomRange(5, 30);
}

// Тик каждую секунду
setInterval(() => {
  for (const agent of agents) {
    tick(agent.id);
  }
}, 1000);

// При закрытии — всех в idle
process.on("SIGINT", () => {
  console.log("\n🛑 Останавливаю...");
  const db = getDb();
  for (const agent of agents) {
    setStatus(db, agent.id, "idle");
  }
  db.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  const db = getDb();
  for (const agent of agents) {
    setStatus(db, agent.id, "idle");
  }
  db.close();
  process.exit(0);
});
