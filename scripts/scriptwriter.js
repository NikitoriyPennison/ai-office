#!/usr/bin/env node
/**
 * Сценарист — генерирует TikTok/Reels сценарии про 3D-печать через Claude Opus
 *
 * Использование:
 *   node scriptwriter.js                   — авто-тема (Claude выбирает)
 *   node scriptwriter.js "тема"            — сценарий на конкретную тему
 *   node scriptwriter.js list              — показать сохранённые сценарии
 */

const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const Database = require("better-sqlite3");
const Anthropic = require("@anthropic-ai/sdk");

const DB_PATH = path.join(__dirname, "../data/database.sqlite");
const SCRIPTS_DIR = path.join(__dirname, "../content/scripts");
const AGENT_ID = "scriptwriter";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Ты — Сценарист, профессиональный создатель контента для TikTok и Reels в нише 3D-печати.

Твоя аудитория: предприниматели, хоббисты, люди, которые хотят зарабатывать на 3D-принтере.
Бизнес-контекст: продажа 3D-напечатанных изделий, трендовые ниши, практические советы.

Ты мыслишь как опытный маркетолог контента:
— Hook в первые 2-3 секунды (иначе скроллят мимо)
— Конкретика и цифры (не "можно заработать", а "500$ в месяц реально")
— Визуальное мышление: каждая сцена — это что-то интересное на экране
— CTA мотивирует подписаться или сохранить видео

Формат ответа — СТРОГО валидный JSON, без markdown, без пояснений:
{
  "title": "заголовок/тема видео (для файла)",
  "hook": "первая фраза — цепляющий крючок",
  "scenes": [
    {
      "number": 1,
      "text": "текст на экране (короткий, 5-8 слов)",
      "voiceover": "что говорит автор (1-3 предложения, разговорный стиль)",
      "visuals": "что показывать на экране (действие, объект, крупный план)"
    }
  ],
  "cta": "призыв к действию в конце",
  "hashtags": ["#3dprint", "#3dprinting", "#3dпечать"],
  "duration_sec": 45,
  "difficulty": "easy|medium|hard"
}

5-7 сцен. Будь конкретным, интересным, практичным.`;

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

function logActivity(title, scriptPath) {
  try {
    const db = new Database(DB_PATH);
    db.prepare(`
      INSERT INTO activity_logs (id, entity_type, entity_id, action, details, created_at)
      VALUES (?, 'agent', ?, 'script_created', ?, datetime('now'))
    `).run(randomUUID(), AGENT_ID, JSON.stringify({ title, file: path.basename(scriptPath) }));
    db.close();
  } catch {}
}

function ensureAgent() {
  try {
    const db = new Database(DB_PATH);
    const existing = db.prepare("SELECT id FROM agents WHERE id = ?").get(AGENT_ID);
    if (!existing) {
      db.prepare(`INSERT INTO agents (id, name, emoji, role, description, current_status) VALUES (?, ?, ?, ?, ?, 'idle')`)
        .run(AGENT_ID, "Сценарист", "✍️", "Контент-сценарист", "Создаёт TikTok сценарии про 3D-печать на базе Claude");
    }
    db.close();
  } catch {}
}

async function generateScript(topic) {
  const userMessage = topic
    ? `Напиши TikTok сценарий на тему: "${topic}"`
    : `Выбери самую актуальную и цепляющую тему про 3D-печать прямо сейчас и напиши сценарий.`;

  const stream = await client.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  const response = await stream.finalMessage();

  // Извлечь текст из content блоков (пропускаем thinking блоки)
  let raw = "";
  for (const block of response.content) {
    if (block.type === "text") {
      raw += block.text;
    }
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Не удалось извлечь JSON из ответа Claude");

  return JSON.parse(jsonMatch[0]);
}

function listScripts() {
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  const files = fs.readdirSync(SCRIPTS_DIR)
    .filter(f => f.endsWith(".json"))
    .sort()
    .reverse()
    .slice(0, 10);

  if (files.length === 0) {
    console.log("Нет сохранённых сценариев");
    return;
  }

  console.log("\n📋 Последние сценарии:\n");
  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(SCRIPTS_DIR, f), "utf-8"));
      console.log(`  📄 ${f}`);
      console.log(`     "${data.title}" — ${data.scenes?.length || 0} сцен, ~${data.duration_sec || "?"}с`);
      console.log(`     Hook: ${data.hook?.slice(0, 60)}...`);
      console.log();
    } catch {
      console.log(`  📄 ${f}`);
    }
  }
}

async function run(topic) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ ANTHROPIC_API_KEY не задан");
    process.exit(1);
  }

  ensureAgent();
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });

  try {
    setStatus("thinking", topic ? `Пишу сценарий: "${topic}"` : "Выбираю тему и пишу сценарий...");

    console.log("\n✍️  Сценарист думает...\n");
    const script = await generateScript(topic);

    setStatus("working", `Сохраняю: "${script.title}"`);

    const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const slug = script.title.toLowerCase().replace(/[^а-яёa-z0-9]+/gi, "-").slice(0, 40);
    const filename = `script-${dateStr}-${slug}.json`;
    const scriptPath = path.join(SCRIPTS_DIR, filename);

    fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2), "utf-8");

    console.log(`\n🎬 Сценарий: "${script.title}"`);
    console.log(`   Hook: ${script.hook}`);
    console.log(`   Сцен: ${script.scenes?.length || 0} (~${script.duration_sec || "?"}с)`);
    console.log(`   Сложность: ${script.difficulty || "-"}`);
    console.log(`\n📄 Сохранён: content/scripts/${filename}\n`);

    if (script.scenes) {
      console.log("─────────────────────────────────────────");
      for (const scene of script.scenes) {
        console.log(`\nСцена ${scene.number}:`);
        console.log(`  📺 Экран:    ${scene.text}`);
        console.log(`  🎙️  Войсовер: ${scene.voiceover}`);
        console.log(`  🎥 Визуал:   ${scene.visuals}`);
      }
      console.log(`\n👉 CTA: ${script.cta}`);
      console.log(`   Хэштеги: ${script.hashtags?.join(" ") || ""}`);
      console.log("─────────────────────────────────────────\n");
    }

    logActivity(script.title, scriptPath);
    setStatus("idle", `Готово: "${script.title}"`);
  } catch (err) {
    console.error(`\n❌ Ошибка: ${err.message}`);
    setStatus("idle", `Ошибка: ${err.message}`);
    process.exit(1);
  }
}

const [,, command, ...rest] = process.argv;

if (command === "list") {
  listScripts();
} else {
  const topic = command ? [command, ...rest].join(" ") : null;
  run(topic);
}
