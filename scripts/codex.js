#!/usr/bin/env node
/**
 * Кодекс — генерирует код для программ через Claude Opus
 *
 * Использование:
 *   node codex.js "описание задачи"    — сгенерировать код
 *   node codex.js list                 — список сохранённых файлов
 *
 * Примеры:
 *   node codex.js "парсер цен с Wildberries на Python"
 *   node codex.js "Telegram бот для уведомлений о заказах на Node.js"
 *   node codex.js "скрипт автозаливки фото на Pinterest"
 */

const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const Database = require("better-sqlite3");
const Anthropic = require("@anthropic-ai/sdk");

const DB_PATH = path.join(__dirname, "../data/database.sqlite");
const CODE_DIR = path.join(__dirname, "../content/code");
const AGENT_ID = "codex";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Ты — Кодекс, старший разработчик с глубокими знаниями во всех языках программирования.

Бизнес-контекст: 3D-печать, продажа изделий онлайн, автоматизация, маркетплейсы, TikTok/Instagram контент.

Ты пишешь чистый, рабочий, продакшн-готовый код:
— Полные файлы, не сниппеты (если не попросили иначе)
— Комментарии на русском для ключевых частей
— Обработка ошибок там, где нужно
— Без лишних абстракций — только то, что требуется задаче
— Если нужны зависимости — указать команду установки

Формат ответа — СТРОГО валидный JSON без markdown-обёрток:
{
  "title": "короткое название задачи",
  "language": "python|javascript|typescript|bash|...",
  "filename": "имя_файла.расширение",
  "install": "команда установки зависимостей (или null)",
  "description": "одна строка — что делает код",
  "code": "полный исходный код как строка",
  "usage": "как запустить / пример использования"
}

Пиши рабочий код. Если задача неоднозначна — выбери наиболее практичную интерпретацию.`;

function setStatus(status, statusText) {
  try {
    const db = new Database(DB_PATH);
    db.prepare("UPDATE agents SET current_status = ? WHERE id = ?").run(status, AGENT_ID);
    db.prepare(`
      INSERT INTO activity_logs (id, entity_type, entity_id, action, details, created_at)
      VALUES (?, 'agent', ?, 'status_change', ?, datetime('now'))
    `).run(randomUUID(), AGENT_ID, JSON.stringify({ status, statusText }));
    db.close();
  } catch {}
  console.log(`[${new Date().toLocaleTimeString()}] ${status}: ${statusText}`);
}

function logActivity(title, filePath) {
  try {
    const db = new Database(DB_PATH);
    db.prepare(`
      INSERT INTO activity_logs (id, entity_type, entity_id, action, details, created_at)
      VALUES (?, 'agent', ?, 'code_generated', ?, datetime('now'))
    `).run(randomUUID(), AGENT_ID, JSON.stringify({ title, file: path.basename(filePath) }));
    db.close();
  } catch {}
}

function ensureAgent() {
  try {
    const db = new Database(DB_PATH);
    const existing = db.prepare("SELECT id FROM agents WHERE id = ?").get(AGENT_ID);
    if (!existing) {
      db.prepare(`INSERT INTO agents (id, name, emoji, role, description, current_status) VALUES (?, ?, ?, ?, ?, 'idle')`)
        .run(AGENT_ID, "Кодекс", "⚡", "Разработчик-кодогенератор", "Пишет код для любых задач на базе Claude");
    }
    db.close();
  } catch {}
}

async function generateCode(task) {
  const stream = await client.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: `Задача: ${task}` }],
  });

  const response = await stream.finalMessage();

  let raw = "";
  for (const block of response.content) {
    if (block.type === "text") raw += block.text;
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Не удалось извлечь JSON из ответа Claude");

  return JSON.parse(jsonMatch[0]);
}

function listFiles() {
  fs.mkdirSync(CODE_DIR, { recursive: true });
  const files = fs.readdirSync(CODE_DIR).filter(f => !f.endsWith(".meta.json")).sort().reverse().slice(0, 10);

  if (files.length === 0) {
    console.log("Нет сохранённых файлов кода");
    return;
  }

  console.log("\n📁 Последние файлы:\n");
  for (const f of files) {
    const stat = fs.statSync(path.join(CODE_DIR, f));
    console.log(`  ⚡ ${f}  (${(stat.size / 1024).toFixed(1)} KB)`);
  }
  console.log();
}

async function run(task) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ ANTHROPIC_API_KEY не задан");
    process.exit(1);
  }

  ensureAgent();
  fs.mkdirSync(CODE_DIR, { recursive: true });

  try {
    setStatus("thinking", `Анализирую задачу: "${task}"`);
    console.log("\n⚡ Кодекс пишет код...\n");

    const result = await generateCode(task);

    setStatus("working", `Сохраняю: ${result.filename}`);

    const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
    const filename = `${dateStr}-${result.filename}`;
    const filePath = path.join(CODE_DIR, filename);

    fs.writeFileSync(filePath, result.code, "utf-8");

    // Метаданные
    const metaPath = filePath.replace(/\.[^.]+$/, ".meta.json");
    fs.writeFileSync(metaPath, JSON.stringify({
      title: result.title,
      language: result.language,
      description: result.description,
      install: result.install,
      usage: result.usage,
      task,
      generated_at: new Date().toISOString(),
    }, null, 2), "utf-8");

    console.log(`⚡ ${result.title}`);
    console.log(`   Язык:      ${result.language}`);
    console.log(`   Файл:      content/code/${filename}`);
    console.log(`   Описание:  ${result.description}`);
    if (result.install) console.log(`   Установка: ${result.install}`);
    console.log(`   Запуск:    ${result.usage}`);
    console.log("\n─────────────────────────────────────────");
    console.log(result.code);
    console.log("─────────────────────────────────────────\n");

    logActivity(result.title, filePath);
    setStatus("idle", `Готово: ${result.filename}`);
  } catch (err) {
    console.error(`\n❌ Ошибка: ${err.message}`);
    setStatus("idle", `Ошибка: ${err.message}`);
    process.exit(1);
  }
}

const [,, command, ...rest] = process.argv;

if (command === "list") {
  listFiles();
} else if (!command) {
  console.error("❌ Укажи задачу: node codex.js \"парсер цен с Wildberries\"");
  process.exit(1);
} else {
  run([command, ...rest].join(" "));
}
