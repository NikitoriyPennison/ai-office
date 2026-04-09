#!/usr/bin/env node
/**
 * Советник — анализирует отчёты Стика, отбирает лучшие идеи,
 * предлагает действия для бизнеса 3D-печати.
 * Запускается ежедневно после Стика (например в 10:00).
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const http = require("http");

const DB_PATH = path.join(__dirname, "../data/database.sqlite");
const REPORTS_DIR = path.join(__dirname, "../reports");
const WHITELIST_DIR = path.join(__dirname, "../reports/whitelist");
const OLLAMA_URL = "http://localhost:11434";
const AGENT_ID = "vanya";

function setStatus(db, status, statusText) {
  db.prepare("UPDATE agents SET current_status = ? WHERE id = ?").run(status, AGENT_ID);
  db.prepare(`
    INSERT INTO agent_status_history (id, agent_id, status, status_text, started_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(randomUUID(), AGENT_ID, status, statusText);
  db.prepare(`
    INSERT INTO activity_logs (id, entity_type, entity_id, action, details, created_at)
    VALUES (?, 'agent', ?, ?, ?, datetime('now'))
  `).run(randomUUID(), AGENT_ID, "status_change", JSON.stringify({ status, statusText }));
  console.log(`[${new Date().toISOString()}] ${status}: ${statusText}`);
}

function ollamaGenerate(prompt, model = "llama3.2:3b") {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, prompt, stream: false });
    const req = http.request(
      `${OLLAMA_URL}/api/generate`,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try { resolve(JSON.parse(data).response || ""); }
          catch { reject(new Error("Ошибка разбора ответа Ollama")); }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(180000, () => { req.destroy(); reject(new Error("Timeout Ollama")); });
    req.write(body);
    req.end();
  });
}

function getModels() {
  return new Promise((resolve) => {
    const req = http.get(`${OLLAMA_URL}/api/tags`, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data).models?.map((m) => m.name) || []); }
        catch { resolve([]); }
      });
    });
    req.on("error", () => resolve([]));
  });
}

function checkOllama() {
  return new Promise((resolve) => {
    const req = http.get(`${OLLAMA_URL}/api/tags`, (res) => resolve(res.statusCode === 200));
    req.on("error", () => resolve(false));
    req.setTimeout(5000, () => { req.destroy(); resolve(false); });
  });
}

// Найти последний отчёт Стика
function getLatestReport() {
  const latestPath = path.join(REPORTS_DIR, "latest.md");
  if (fs.existsSync(latestPath)) {
    return fs.readFileSync(latestPath, "utf-8");
  }
  // Ищем по дате
  const today = new Date().toISOString().split("T")[0];
  const todayReport = path.join(REPORTS_DIR, `report-${today}.md`);
  if (fs.existsSync(todayReport)) {
    return fs.readFileSync(todayReport, "utf-8");
  }
  return null;
}

// Загрузить предыдущий белый список для контекста
function getPreviousWhitelist() {
  if (!fs.existsSync(WHITELIST_DIR)) return null;
  const files = fs.readdirSync(WHITELIST_DIR)
    .filter(f => f.endsWith(".md"))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  return fs.readFileSync(path.join(WHITELIST_DIR, files[0]), "utf-8");
}

async function runAdvisor() {
  const db = new Database(DB_PATH);
  fs.mkdirSync(WHITELIST_DIR, { recursive: true });

  try {
    setStatus(db, "working", "Запускаюсь...");

    const ollamaOk = await checkOllama();
    if (!ollamaOk) {
      setStatus(db, "offline", "Ollama недоступна");
      console.error("❌ Ollama не запущена");
      process.exit(1);
    }

    const models = await getModels();
    const model = models.find((m) => m.includes("llama3")) ||
                  models.find((m) => m.includes("qwen")) ||
                  models[0];

    if (!model) {
      setStatus(db, "offline", "Нет моделей в Ollama");
      process.exit(1);
    }

    console.log(`✅ Модель: ${model}`);

    // Читаем отчёт Стика
    const report = getLatestReport();
    if (!report) {
      setStatus(db, "idle", "Нет отчёта от Стика — жду");
      console.log("⚠️ Отчёт Стика не найден. Сначала запусти market-analyst.js");
      process.exit(0);
    }

    const prevWhitelist = getPreviousWhitelist();
    const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

    // ── Шаг 1: Анализ отчёта и отбор идей ──
    setStatus(db, "working", "Анализирую отчёт Стика...");

    const analysisPrompt = `Ты — бизнес-советник для компании, которая занимается 3D-печатью.

Вот отчёт аналитика рынка:
---
${report}
---
${prevWhitelist ? `\nПредыдущий белый список идей:\n---\n${prevWhitelist}\n---\n` : ""}

Твоя задача:

1. **БЕЛЫЙ СПИСОК** — отбери из отчёта 3-5 самых перспективных идей для малого бизнеса 3D-печати. Для каждой идеи укажи:
   - Название идеи
   - Почему она хорошая (в 1-2 предложениях)
   - Оценка потенциала: 🟢 высокий / 🟡 средний / 🔴 низкий
   - Примерные первые шаги

2. **РЕКОМЕНДАЦИИ НА СЕГОДНЯ** — 3 конкретных действия, которые можно сделать прямо сейчас:
   - Что именно сделать
   - Зачем
   - Ожидаемый результат

3. **ПРЕДУПРЕЖДЕНИЯ** — есть ли риски или тренды, на которые стоит обратить внимание

Отвечай на русском. Будь конкретным, без воды. Формат — markdown.`;

    const analysis = await ollamaGenerate(analysisPrompt, model);

    // ── Шаг 2: Бизнес-идеи ──
    setStatus(db, "working", "Генерирую бизнес-идеи...");

    const ideasPrompt = `Ты — креативный бизнес-советник для 3D-печати.

На основе текущих трендов, предложи 3 оригинальные бизнес-идеи, которые можно реализовать с минимальными вложениями на 3D-принтере.

Для каждой идеи:
- **Название**
- **Суть** (2-3 предложения)
- **Целевая аудитория**
- **Начальные вложения** (примерно)
- **Потенциальный доход** (примерно в месяц)
- **Первый шаг** — одно конкретное действие

Отвечай на русском. Формат — markdown.`;

    const ideas = await ollamaGenerate(ideasPrompt, model);

    // ── Шаг 3: Рекомендация новых ботов ──
    setStatus(db, "working", "Думаю каких ботов нанять...");

    const existingAgents = db.prepare("SELECT name, role FROM agents").all();
    const agentsList = existingAgents.map(a => `- ${a.name}: ${a.role}`).join("\n");

    const hiringPrompt = `Ты — HR-советник для AI-компании, которая занимается 3D-печатью.

Текущая команда ботов:
${agentsList}

На основе отчёта аналитика и бизнес-идей, предложи 2-3 новых бота (AI-агента), которых стоит "нанять" для усиления команды.

Для каждого бота укажи:
- **Должность / Роль** — как называется
- **Что делает** — конкретные задачи (2-3 пункта)
- **Зачем нужен** — какую проблему решает или какую возможность раскрывает
- **Приоритет найма**: 🔴 срочно / 🟡 желательно / 🟢 на будущее
- **Как взаимодействует** с текущей командой

Учитывай что боты работают автоматически через LLM (Ollama), могут генерировать текст, анализировать данные, создавать отчёты.
НЕ предлагай ботов которые уже есть в команде.

Отвечай на русском. Формат — markdown.`;

    const hiring = await ollamaGenerate(hiringPrompt, model);

    // Сохраняем белый список
    const dateStr = new Date().toISOString().split("T")[0];
    const whitelistFile = `whitelist-${dateStr}.md`;
    const whitelistPath = path.join(WHITELIST_DIR, whitelistFile);

    const content = `# Белый список — Советник 🧠
**Дата:** ${today}
**Модель:** ${model}
**Источник:** отчёт Стика от ${dateStr}

---

## Анализ отчёта и отобранные идеи

${analysis}

---

## Новые бизнес-идеи

${ideas}

---

## Кого нанять — рекомендации по новым ботам

${hiring}
`;

    fs.writeFileSync(whitelistPath, content, "utf-8");
    fs.writeFileSync(path.join(WHITELIST_DIR, "latest.md"), content, "utf-8");

    console.log(`\n✅ Белый список: ${whitelistPath}`);
    console.log("\n" + "=".repeat(60));
    console.log(content);
    console.log("=".repeat(60));

    setStatus(db, "idle", `Белый список готов: ${whitelistFile}`);

    db.prepare(`
      INSERT INTO activity_logs (id, entity_type, entity_id, action, details, created_at)
      VALUES (?, 'agent', ?, 'whitelist_generated', ?, datetime('now'))
    `).run(randomUUID(), AGENT_ID, JSON.stringify({ file: whitelistFile, model, source: `report-${dateStr}.md` }));

  } catch (err) {
    console.error("❌ Ошибка:", err.message);
    setStatus(db, "idle", `Ошибка: ${err.message}`);
  } finally {
    db.close();
  }
}

runAdvisor();
