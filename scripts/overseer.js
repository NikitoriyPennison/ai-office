#!/usr/bin/env node
/**
 * Надзиратель — принимает указания от босса, распределяет задания ботам.
 *
 * Использование:
 *   node overseer.js "Сделай отчёт по рынку и создай видео про тренды"
 *   node overseer.js "Позвони +37255615136 и скажи что заказ готов"
 *   node overseer.js status     — показать статус всех ботов
 *   node overseer.js agents     — список доступных ботов
 */

const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const { execSync, spawn } = require("child_process");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "../data/database.sqlite");
const AGENT_ID = "stoyanov";
const { generate } = require("./lib/llm");
const NODE = "C:\\Program Files\\nodejs\\node.exe";

// Загрузить .env
const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
}

function setStatus(status, statusText) {
  try {
    const db = new Database(DB_PATH);
    db.prepare("UPDATE agents SET current_status = ? WHERE id = ?").run(status, AGENT_ID);
    db.prepare(`
      INSERT INTO activity_logs (id, entity_type, entity_id, action, details, created_at)
      VALUES (?, 'agent', ?, ?, ?, datetime('now'))
    `).run(randomUUID(), AGENT_ID, "status_change", JSON.stringify({ status, statusText }));
    db.close();
  } catch {}
  console.log(`[${new Date().toLocaleTimeString()}] ${status}: ${statusText}`);
}

// Доступные боты и их скрипты
const BOTS = {
  stik: {
    name: "Стик",
    role: "аналитик рынка 3D-печати",
    script: path.join(__dirname, "market-analyst.js"),
    keywords: ["отчёт", "анализ", "рынок", "тренд", "3d", "печать", "report", "market"],
  },
  advisor: {
    name: "Советник",
    role: "бизнес-советник, белый список идей",
    script: path.join(__dirname, "advisor.js"),
    keywords: ["совет", "идея", "белый список", "бизнес", "стратегия", "рекомендация", "advisor"],
  },
  blogger: {
    name: "Блогер",
    role: "создаёт TikTok видео про 3D-печать",
    script: path.join(__dirname, "blogger.js"),
    keywords: ["видео", "тикток", "tiktok", "контент", "блог", "снять", "ролик", "video"],
  },
  davy: {
    name: "Дейви",
    role: "секретарь-переводчик, звонки через Twilio",
    script: path.join(__dirname, "secretary.js"),
    keywords: ["звонок", "позвони", "call", "телефон", "секретарь", "перевод"],
  },
};

// Запустить бота
function runBot(botKey, args = []) {
  const bot = BOTS[botKey];
  if (!bot) return null;

  console.log(`\n🚀 Запускаю ${bot.name}...`);
  const child = spawn(NODE, [bot.script, ...args], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  });

  return new Promise((resolve) => {
    child.on("close", (code) => {
      console.log(`✅ ${bot.name} завершил работу (код: ${code})`);
      resolve(code);
    });
    child.on("error", (err) => {
      console.log(`❌ ${bot.name} ошибка: ${err.message}`);
      resolve(1);
    });
  });
}

// Показать статус всех ботов
function showStatus() {
  const db = new Database(DB_PATH);
  const agents = db.prepare("SELECT id, name, emoji, role, current_status FROM agents").all();
  db.close();

  console.log("\n👁️ Статус команды:\n");
  for (const a of agents) {
    const statusIcon = a.current_status === "working" ? "🟢" :
                       a.current_status === "thinking" ? "🟡" :
                       a.current_status === "idle" ? "⚪" : "🔴";
    console.log(`  ${a.emoji} ${a.name.padEnd(12)} ${statusIcon} ${a.current_status.padEnd(10)} — ${a.role}`);
  }
  console.log("");
}

// Главная логика — разобрать указание и распределить
async function processOrder(order) {
  setStatus("working", "Анализирую указание...");

  // Спросить LLM какому боту отдать задание
  const botsDesc = Object.entries(BOTS)
    .map(([key, b]) => `- ${key}: ${b.name} — ${b.role}`)
    .join("\n");

  const prompt = `Ты — менеджер AI-офиса. У тебя есть команда ботов:
${botsDesc}

Босс дал указание: "${order}"

Определи какому боту (или ботам) отдать это задание. Если нужно звонить — извлеки номер и текст.

Ответь СТРОГО JSON:
{
  "tasks": [
    {"bot": "ключ_бота", "action": "что сделать", "args": ["аргументы если нужны"]}
  ],
  "summary": "краткое описание что будет сделано"
}

Только JSON, без пояснений.`;

  setStatus("thinking", "Думаю кому поручить...");
  const raw = (await generate(prompt)).text;

  let plan;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    plan = JSON.parse(jsonMatch[0]);
  } catch {
    console.log("❌ Не удалось разобрать план:", raw);
    setStatus("idle", "Не понял указание");
    return;
  }

  console.log(`\n📋 План: ${plan.summary}`);
  console.log(`   Задач: ${plan.tasks.length}\n`);

  // Логируем план
  const db = new Database(DB_PATH);
  db.prepare(`
    INSERT INTO activity_logs (id, entity_type, entity_id, action, details, created_at)
    VALUES (?, 'agent', ?, 'task_plan', ?, datetime('now'))
  `).run(randomUUID(), AGENT_ID, JSON.stringify({ order, plan }));
  db.close();

  // Выполняем задания последовательно
  for (const task of plan.tasks) {
    setStatus("working", `Поручаю ${BOTS[task.bot]?.name || task.bot}: ${task.action}`);

    if (task.bot === "davy" && task.args?.length >= 2) {
      // Звонок: args = [номер, текст, язык]
      await runBot("davy", ["call", ...task.args]);
    } else if (task.bot === "blogger" && task.args?.length > 0) {
      await runBot("blogger", ["video", task.args.join(" ")]);
    } else if (BOTS[task.bot]) {
      await runBot(task.bot);
    } else {
      console.log(`⚠️ Неизвестный бот: ${task.bot}`);
    }
  }

  setStatus("idle", `Выполнено: ${plan.summary}`);
  console.log(`\n✅ Все задания выполнены!`);
}

// CLI
const [,, command, ...args] = process.argv;

if (command === "status") {
  showStatus();
} else if (command === "agents") {
  console.log("\n👁️ Доступные боты:\n");
  for (const [key, bot] of Object.entries(BOTS)) {
    console.log(`  ${key.padEnd(10)} — ${bot.name} (${bot.role})`);
  }
  console.log("");
} else if (command) {
  const fullOrder = [command, ...args].join(" ");
  processOrder(fullOrder);
} else {
  console.log(`
👁️ Надзиратель — менеджер задач

Использование:
  node overseer.js "указание"         — дать задание команде
  node overseer.js status             — статус всех ботов
  node overseer.js agents             — список ботов

Примеры:
  node overseer.js "Сделай отчёт по рынку"
  node overseer.js "Создай видео про тренды 3D печати"
  node overseer.js "Позвони +37255615136 и скажи что заказ готов на русском"
  node overseer.js "Сделай анализ и на основе него создай видео"
  `);
}
