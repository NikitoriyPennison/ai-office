#!/usr/bin/env node
/**
 * Аналитик рынка 3D-печати
 * Генерирует ежедневный отчёт через Ollama и сохраняет в reports/
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const { generate } = require("./lib/llm");

const DB_PATH = path.join(__dirname, "../data/database.sqlite");
const REPORTS_DIR = path.join(__dirname, "../reports");
const AGENT_ID = "garik";

// ── Обновить статус агента в БД ──
function setStatus(db, status, statusText) {
  db.prepare("UPDATE agents SET current_status = ? WHERE id = ?").run(status, AGENT_ID);

  const histId = randomUUID();
  db.prepare(`
    INSERT INTO agent_status_history (id, agent_id, status, status_text, started_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(histId, AGENT_ID, status, statusText);

  db.prepare(`
    INSERT INTO activity_logs (id, entity_type, entity_id, action, details, created_at)
    VALUES (?, 'agent', ?, ?, ?, datetime('now'))
  `).run(randomUUID(), AGENT_ID, "status_change", JSON.stringify({ status, statusText }));

  console.log(`[${new Date().toISOString()}] Статус: ${status} — ${statusText}`);
}

// ── Основной анализ ──
async function runAnalysis() {
  const db = new Database(DB_PATH);
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  try {
    setStatus(db, "working", "Анализирую тренды 3D-печати...");

    const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

    const prompt = `Ты эксперт по рынку 3D-печати. Составь краткий ежедневный аналитический отчёт на русском языке.

Дата: ${today}

Структура отчёта:
1. **Топ-3 тренда** рынка 3D-печати прямо сейчас (технологии, материалы, применения)
2. **Ключевые сегменты** — какие отрасли растут быстрее всего
3. **Интересные ниши** — где есть возможности для малого бизнеса
4. **Что печатают чаще всего** — топ-5 популярных категорий
5. **Вывод и рекомендация** — одно конкретное действие на сегодня

Отвечай конкретно, без воды. Используй цифры и факты там где уместно.`;

    const result = await generate(prompt);
    const report = result.text;

    // Сохранить отчёт в файл
    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `report-${dateStr}.md`;
    const filepath = path.join(REPORTS_DIR, filename);

    const content = `# Отчёт по рынку 3D-печати\n**Дата:** ${today}\n**Провайдер:** ${result.provider}\n\n---\n\n${report}\n`;
    fs.writeFileSync(filepath, content, "utf-8");

    // Сохранить как latest.md для удобного доступа
    fs.writeFileSync(path.join(REPORTS_DIR, "latest.md"), content, "utf-8");

    console.log(`\n✅ Отчёт сохранён: ${filepath}`);
    console.log("\n" + "=".repeat(60));
    console.log(report);
    console.log("=".repeat(60) + "\n");

    setStatus(db, "idle", `Отчёт готов: ${filename}`);

    // Залогировать в activity_logs
    db.prepare(`
      INSERT INTO activity_logs (id, entity_type, entity_id, action, details, created_at)
      VALUES (?, 'agent', ?, 'report_generated', ?, datetime('now'))
    `).run(randomUUID(), AGENT_ID, JSON.stringify({ file: filename, provider: result.provider }));

  } catch (err) {
    console.error("❌ Ошибка:", err.message);
    setStatus(db, "idle", `Ошибка: ${err.message}`);
  } finally {
    db.close();
  }
}

runAnalysis();
