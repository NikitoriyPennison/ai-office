#!/usr/bin/env node
/**
 * AI Office Telegram Bot — офис + девелопер в одном.
 * Команды:
 *   /help         — список команд
 *   /sayt         — ссылка на сайт
 *   /status       — статус агентов
 *   /stik         — последний отчёт рынка
 *   /sovetnik     — белый список советника
 *   /otchet       — запустить новый отчёт
 *   /bloger тема  — создать видео
 *   /nadziratel задание — дать задание команде
 *
 * Также понимает естественный язык — @упоминание или личные сообщения.
 */

const TelegramBot = require("node-telegram-bot-api");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const Database = require("better-sqlite3");
const { generate } = require("./lib/llm");

const DB_PATH = path.join(__dirname, "../data/database.sqlite");
const REPORTS_DIR = path.join(__dirname, "../reports");
const WHITELIST_DIR = path.join(__dirname, "../reports/whitelist");
const PROJECT_DIR = path.join(__dirname, "..");

// Load .env
const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
}

const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) {
  console.error("❌ TELEGRAM_TOKEN не найден в .env");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// Активные чаты: {chatId: true} — бот активен после @упоминания
const activeChats = new Map();
// История диалогов для LLM
const history = new Map();

// ── Вспомогательные функции ──

function truncate(text, max = 3800) {
  if (!text) return "Нет данных";
  return text.length > max ? text.substring(0, max) + "\n\n_...обрезано..._" : text;
}

function readFile(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf-8");
  } catch {}
  return null;
}

function runScript(scriptName, args = []) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, scriptName);
    let output = "";
    const child = spawn("node", [scriptPath, ...args], { cwd: PROJECT_DIR });
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("close", (code) => resolve({ code, output }));
    child.on("error", (err) => resolve({ code: 1, output: err.message }));
  });
}

function getStatuses() {
  try {
    const db = new Database(DB_PATH);
    const agents = db.prepare("SELECT id, name, emoji, role, current_status FROM agents").all();
    db.close();
    return agents;
  } catch { return []; }
}

function fileTree(dir, prefix = "", depth = 0) {
  if (depth > 2) return [];
  const lines = [];
  try {
    for (const e of fs.readdirSync(dir).filter(f => !f.startsWith(".") && f !== "node_modules" && f !== ".next").slice(0, 20)) {
      const full = path.join(dir, e);
      const isDir = fs.statSync(full).isDirectory();
      lines.push(prefix + (isDir ? "📁 " : "📄 ") + e);
      if (isDir) lines.push(...fileTree(full, prefix + "  ", depth + 1));
    }
  } catch {}
  return lines;
}

function addHistory(chatId, role, text) {
  const h = history.get(chatId) || [];
  h.push({ role, text: text.substring(0, 300) });
  if (h.length > 8) h.shift();
  history.set(chatId, h);
}

// Экранирование для MarkdownV2
function escMd(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

async function sendLong(chatId, text, opts = {}) {
  const max = 4000;
  if (text.length <= max) {
    await bot.sendMessage(chatId, text, opts);
    return;
  }
  const parts = [];
  let cur = text;
  while (cur.length > max) {
    parts.push(cur.substring(0, max));
    cur = cur.substring(max);
  }
  if (cur) parts.push(cur);
  for (const p of parts) {
    await bot.sendMessage(chatId, p, opts);
  }
}

// ── Команды ──

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  activeChats.set(chatId, true);
  await bot.sendMessage(chatId,
    "🏢 *AI Office*\n\nПривет\\! Я управляю командой AI\\-агентов\\.\n\n" +
    "Напиши /help для списка команд или просто пиши — отвечу через AI\\.",
    { parse_mode: "MarkdownV2" }
  );
});

bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const text = [
    "🏢 *AI Office — Команды*\n",
    "*/sayt* — ссылка на дашборд",
    "*/status* — статус всех агентов",
    "*/stik* — последний отчёт рынка 3D\\-печати",
    "*/sovetnik* — белый список советника",
    "*/otchet* — запустить новый анализ рынка",
    "*/bloger* `тема` — создать TikTok видео",
    "*/nadziratel* `задание` — дать задание команде",
    "",
    "💻 *Девелопер:*",
    "*/fayl* `путь` — прочитать файл",
    "*/fayly* — дерево файлов проекта",
    "*/deploy* — коммит \\+ пуш на GitHub",
    "*/logs* — последние логи активности",
    "",
    "Или просто напиши что угодно — отвечу через AI 🤖",
  ].join("\n");
  await bot.sendMessage(chatId, text, { parse_mode: "MarkdownV2" });
});

bot.onText(/\/sayt/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    "🏢 *AI Office:* https://ai\\-office\\-production\\-70f8\\.up\\.railway\\.app\n" +
    "Логин: `admin` / `admin123`",
    { parse_mode: "MarkdownV2" }
  );
});

bot.onText(/\/status/, async (msg) => {
  const agents = getStatuses();
  const icons = { working: "🟢", thinking: "🟡", busy: "🟠", idle: "⚪", offline: "🔴" };
  if (!agents.length) {
    await bot.sendMessage(msg.chat.id, "❌ Нет данных об агентах");
    return;
  }
  const lines = ["👥 *Статус команды*\n", ...agents.map(a =>
    `${a.emoji} *${a.name}* ${icons[a.current_status] || "⚪"} \`${a.current_status}\` — ${a.role}`
  )];
  await bot.sendMessage(msg.chat.id, lines.join("\n"), { parse_mode: "Markdown" });
});

bot.onText(/\/stik/, async (msg) => {
  const reportPath = path.join(REPORTS_DIR, "latest.md");
  const report = readFile(reportPath);
  await bot.sendMessage(msg.chat.id, `📊 *Отчёт Стика*\n\n${truncate(report, 3500)}`, { parse_mode: "Markdown" });
  if (report && fs.existsSync(reportPath)) {
    await bot.sendDocument(msg.chat.id, reportPath, {}, { filename: "отчёт-стика.md" }).catch(() => {});
  }
});

bot.onText(/\/sovetnik/, async (msg) => {
  const reportPath = path.join(WHITELIST_DIR, "latest.md");
  const report = readFile(reportPath);
  await bot.sendMessage(msg.chat.id, `🧠 *Белый список Советника*\n\n${truncate(report, 3500)}`, { parse_mode: "Markdown" });
  if (report && fs.existsSync(reportPath)) {
    await bot.sendDocument(msg.chat.id, reportPath, {}, { filename: "белый-список.md" }).catch(() => {});
  }
});

bot.onText(/\/otchet/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, "📊 Стик начинает анализ рынка...");
  const result = await runScript("market-analyst.js");
  const reportPath = path.join(REPORTS_DIR, "latest.md");
  const report = readFile(reportPath);
  const status = result.code === 0 ? "✅ Отчёт готов!" : "❌ Ошибка";
  await bot.sendMessage(chatId, `${status}\n\n${truncate(report || result.output, 3500)}`, { parse_mode: "Markdown" });
  if (result.code === 0 && fs.existsSync(reportPath)) {
    await bot.sendDocument(chatId, reportPath, {}, { filename: "отчёт-стика.md" }).catch(() => {});
  }
});

bot.onText(/\/bloger(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const topic = (match[1] || "").trim();
  await bot.sendMessage(chatId, `🎬 Блогер создаёт видео${topic ? ": " + topic : ""}...`);
  const args = topic ? ["video", topic] : [];
  const result = await runScript("blogger.js", args);
  await bot.sendMessage(chatId, result.code === 0 ? `🎬 Видео готово!\n\n${truncate(result.output, 1500)}` : `❌ Ошибка:\n${truncate(result.output, 1000)}`);
  // Отправить видео и сценарий
  try {
    const videosDir = path.join(__dirname, "../content/videos");
    const scriptsDir = path.join(__dirname, "../content/scripts");
    if (fs.existsSync(videosDir)) {
      const vids = fs.readdirSync(videosDir).filter(f => f.endsWith(".mp4")).sort().reverse();
      if (vids[0]) {
        const vidPath = path.join(videosDir, vids[0]);
        const stat = fs.statSync(vidPath);
        if (stat.size < 50 * 1024 * 1024) {
          await bot.sendVideo(chatId, vidPath, {}, { filename: vids[0] }).catch(() => {});
        }
      }
    }
    if (fs.existsSync(scriptsDir)) {
      const scripts = fs.readdirSync(scriptsDir).filter(f => f.endsWith(".json")).sort().reverse();
      if (scripts[0]) {
        await bot.sendDocument(chatId, path.join(scriptsDir, scripts[0]), {}, { filename: "сценарий.json" }).catch(() => {});
      }
    }
  } catch {}
});

bot.onText(/\/nadziratel(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const order = (match[1] || "").trim();
  if (!order) {
    await bot.sendMessage(chatId, "👁️ Укажи задание:\n`/nadziratel Сделай отчёт и создай видео`", { parse_mode: "Markdown" });
    return;
  }
  await bot.sendMessage(chatId, `👁️ Надзиратель принял задание: _${order}_`, { parse_mode: "Markdown" });
  const result = await runScript("overseer.js", [order]);
  await bot.sendMessage(chatId, `👁️ *Задание выполнено*\n\n${truncate(result.output, 1500)}`, { parse_mode: "Markdown" });
});

bot.onText(/\/fayl (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const filePath = match[1].trim().replace(/[`"']/g, "");
  const fp = path.join(PROJECT_DIR, filePath);
  if (!fs.existsSync(fp)) {
    await bot.sendMessage(chatId, `❌ Не найден: \`${filePath}\``, { parse_mode: "Markdown" });
    return;
  }
  const content = fs.readFileSync(fp, "utf-8");
  if (content.length > 4000) {
    await bot.sendDocument(chatId, fp, {}, { filename: path.basename(fp) }).catch(() => {});
  } else {
    const ext = path.extname(fp).replace(".", "") || "txt";
    await bot.sendMessage(chatId, `📄 \`${filePath}\`\n\`\`\`${ext}\n${content.substring(0, 3800)}\n\`\`\``, { parse_mode: "Markdown" });
  }
});

bot.onText(/\/fayly/, async (msg) => {
  const tree = fileTree(PROJECT_DIR).slice(0, 40).join("\n");
  await bot.sendMessage(msg.chat.id, `📁 *Файлы проекта*\n\`\`\`\n${tree}\n\`\`\``, { parse_mode: "Markdown" });
});

bot.onText(/\/deploy/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, "🚀 Деплою...");
  try {
    const { execSync } = require("child_process");
    const o = { encoding: "utf-8", cwd: PROJECT_DIR, timeout: 30000 };
    execSync("git add -A", o);
    const st = execSync("git status --short", o).trim();
    if (!st) { await bot.sendMessage(chatId, "📦 Нет изменений для деплоя."); return; }
    execSync('git commit -m "Update from Telegram Dev"', o);
    execSync("git push origin main", o);
    await bot.sendMessage(chatId, `✅ Задеплоено!\n\`\`\`\n${st}\n\`\`\``, { parse_mode: "Markdown" });
  } catch (e) {
    await bot.sendMessage(chatId, `❌ ${e.message.substring(0, 500)}`);
  }
});

bot.onText(/\/logs/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const db = new Database(DB_PATH);
    const logs = db.prepare("SELECT entity_id, action, details, created_at FROM activity_logs ORDER BY created_at DESC LIMIT 10").all();
    db.close();
    if (!logs.length) { await bot.sendMessage(chatId, "📋 Логи пусты"); return; }
    const lines = logs.map(l => {
      const d = l.details ? JSON.parse(l.details) : {};
      const time = (l.created_at || "").substring(11, 19);
      return `\`${time}\` *${l.entity_id}* ${d.statusText || d.message || l.action}`;
    });
    await bot.sendMessage(chatId, `📋 *Последние логи*\n\n${lines.join("\n")}`, { parse_mode: "Markdown" });
  } catch (e) {
    await bot.sendMessage(chatId, `❌ ${e.message}`);
  }
});

// ── Обработка свободных сообщений (LLM + sticky) ──

bot.on("message", async (msg) => {
  if (!msg.text) return;
  const chatId = msg.chat.id;
  const isPrivate = msg.chat.type === "private";
  const botInfo = await bot.getMe();
  const botUsername = botInfo.username;

  // Проверяем @упоминание бота
  const mentionsBot = msg.text.includes(`@${botUsername}`);
  if (mentionsBot) activeChats.set(chatId, true);

  // Если упомянут другой @бот — деактивируемся
  const otherMention = /@\w+/.test(msg.text) && !mentionsBot;
  if (otherMention && !isPrivate) {
    activeChats.delete(chatId);
    return;
  }

  // Отвечаем: в личке всегда, в группе — если активны или @упомянуты
  const shouldReply = isPrivate || mentionsBot || activeChats.get(chatId);
  if (!shouldReply) return;

  // Пропускаем если это команда — уже обработана выше
  if (msg.text.startsWith("/")) return;

  const content = msg.text.replace(new RegExp(`@${botUsername}`, "g"), "").trim();
  if (!content) return;

  await bot.sendChatAction(chatId, "typing");
  addHistory(chatId, "user", content);

  const tree = fileTree(PROJECT_DIR).slice(0, 30).join("\n");

  let agents = [];
  try {
    const db = new Database(DB_PATH);
    agents = db.prepare("SELECT id, name, emoji, role, current_status FROM agents").all();
    db.close();
  } catch {}

  const hist = (history.get(chatId) || []).map(h => `${h.role}: ${h.text}`).join("\n");

  try {
    // Определяем намерение
    const intentR = await generate(`Определи намерение пользователя. Ответь ОДНИМ словом.

Варианты:
- chat — приветствие, вопрос, разговор, всё что не подходит к другим
- status — спрашивает статус агентов/ботов
- logs — хочет увидеть логи/историю
- deploy — хочет задеплоить/запушить изменения
- read_file — хочет прочитать/показать файл
- edit_file — хочет изменить/отредактировать файл
- create_file — хочет создать новый файл
- add_agent — хочет добавить нового бота/агента
- run_script — хочет запустить скрипт/отчёт/видео
- stik — хочет отчёт Стика по рынку
- sovetnik — хочет белый список советника

Примеры:
"привет" → chat
"покажи статус" → status
"открой файл scheduler.js" → read_file
"задеплой" → deploy
"запусти отчёт" → run_script
"добавь бота маркетолога" → add_agent
"стик что нового" → stik
"советник идеи" → sovetnik

Сообщение: "${content}"
Одно слово:`);

    const intent = intentR.text.trim().toLowerCase().split(/[\s,.\n]/)[0];

    if (intent === "status") {
      const icons = { working: "🟢", thinking: "🟡", busy: "🟠", idle: "⚪", offline: "🔴" };
      const lines = agents.map(a => `${a.emoji} *${a.name}* ${icons[a.current_status] || "⚪"} \`${a.current_status}\` — ${a.role}`);
      await bot.sendMessage(chatId, "👥 *Статус команды*\n\n" + lines.join("\n"), { parse_mode: "Markdown" });
      return;
    }

    if (intent === "stik") {
      const report = readFile(path.join(REPORTS_DIR, "latest.md"));
      await bot.sendMessage(chatId, `📊 *Отчёт Стика*\n\n${truncate(report, 3500)}`, { parse_mode: "Markdown" });
      return;
    }

    if (intent === "sovetnik") {
      const report = readFile(path.join(WHITELIST_DIR, "latest.md"));
      await bot.sendMessage(chatId, `🧠 *Белый список Советника*\n\n${truncate(report, 3500)}`, { parse_mode: "Markdown" });
      return;
    }

    if (intent === "logs") {
      const db = new Database(DB_PATH);
      const logs = db.prepare("SELECT entity_id, action, details, created_at FROM activity_logs ORDER BY created_at DESC LIMIT 10").all();
      db.close();
      const lines = logs.map(l => {
        const d = l.details ? JSON.parse(l.details) : {};
        return `\`${(l.created_at || "").substring(11, 19)}\` *${l.entity_id}* ${d.statusText || d.message || l.action}`;
      });
      await bot.sendMessage(chatId, "*Последние логи*\n\n" + (lines.join("\n") || "Пусто"), { parse_mode: "Markdown" });
      return;
    }

    if (intent === "deploy") {
      await bot.sendMessage(chatId, "🚀 Деплою...");
      try {
        const { execSync } = require("child_process");
        const o = { encoding: "utf-8", cwd: PROJECT_DIR, timeout: 30000 };
        execSync("git add -A", o);
        const st = execSync("git status --short", o).trim();
        if (!st) { await bot.sendMessage(chatId, "📦 Нет изменений."); return; }
        execSync('git commit -m "Update from Telegram Dev"', o);
        execSync("git push origin main", o);
        await bot.sendMessage(chatId, `✅ Задеплоено!\n\`\`\`\n${st}\n\`\`\``, { parse_mode: "Markdown" });
      } catch (e) { await bot.sendMessage(chatId, `❌ ${e.message.substring(0, 500)}`); }
      return;
    }

    if (intent === "read_file") {
      const fR = await generate(`Из "${content}" извлеки путь к файлу. Файлы:\n${tree}\nТолько путь без кавычек:`);
      const fp = path.join(PROJECT_DIR, fR.text.trim().replace(/[`"']/g, ""));
      if (fs.existsSync(fp)) {
        const fc = fs.readFileSync(fp, "utf-8");
        if (fc.length > 4000) {
          await bot.sendDocument(chatId, fp, {}, { filename: path.basename(fp) }).catch(() => {});
        } else {
          const ext = path.extname(fp).replace(".", "") || "txt";
          await bot.sendMessage(chatId, `\`\`\`${ext}\n${fc.substring(0, 3800)}\n\`\`\``, { parse_mode: "Markdown" });
        }
      } else {
        await bot.sendMessage(chatId, `❌ Файл не найден: \`${fR.text.trim()}\``, { parse_mode: "Markdown" });
      }
      return;
    }

    if (intent === "edit_file" || intent === "create_file") {
      const infoR = await generate(`Из "${content}" извлеки JSON: {"file":"путь","task":"что сделать"}\nФайлы:\n${tree}\nТолько JSON:`);
      try {
        const info = JSON.parse(infoR.text.match(/\{[\s\S]*\}/)[0]);
        const fp = path.join(PROJECT_DIR, info.file);
        const exists = fs.existsSync(fp);
        await bot.sendMessage(chatId, `${exists ? "✏️ Редактирую" : "📝 Создаю"} \`${info.file}\`...`, { parse_mode: "Markdown" });
        const original = exists ? fs.readFileSync(fp, "utf-8").substring(0, 3000) : "";
        const codeR = await generate(exists
          ? `Файл ${info.file}:\n\`\`\`\n${original}\n\`\`\`\nЗадача: ${info.task}\nВерни ПОЛНЫЙ обновлённый файл. Только код.`
          : `Создай файл ${info.file}. Задача: ${info.task}\nВерни только код.`);
        const code = codeR.text.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "");
        const dir = path.dirname(fp);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fp, code);
        await bot.sendMessage(chatId, `✅ ${exists ? "Обновлён" : "Создан"}: \`${info.file}\``, { parse_mode: "Markdown" });
      } catch (e) { await bot.sendMessage(chatId, `❌ ${e.message}`); }
      return;
    }

    if (intent === "add_agent") {
      const aR = await generate(`Пользователь хочет создать нового AI-агента для офиса.

Его сообщение: "${content}"

Придумай данные для агента. Ответь СТРОГО JSON:
{"id":"latin_id","name":"Имя на русском","emoji":"эмодзи","role":"роль","description":"описание"}

Только JSON:`);
      try {
        const info = JSON.parse(aR.text.match(/\{[\s\S]*\}/)[0]);
        const db = new Database(DB_PATH);
        db.prepare("INSERT OR REPLACE INTO agents (id,name,emoji,role,description,current_status) VALUES (?,?,?,?,?,'idle')")
          .run(info.id, info.name, info.emoji, info.role, info.description || "");
        db.close();
        await bot.sendMessage(chatId,
          `✅ *Агент создан!*\n\n${info.emoji} *${info.name}*\n📋 Роль: ${info.role}\n📝 ${info.description}\n🆔 ID: \`${info.id}\``,
          { parse_mode: "Markdown" });
      } catch (e) { await bot.sendMessage(chatId, `❌ Не удалось создать агента: ${e.message}`); }
      return;
    }

    if (intent === "run_script") {
      const allowed = ["market-analyst.js", "advisor.js", "blogger.js", "overseer.js", "secretary.js"];
      const sR = await generate(`Из "${content}" определи скрипт. Доступные: ${allowed.join(", ")}\nТолько имя файла:`);
      const script = sR.text.trim().replace(/[`"']/g, "");
      const found = allowed.find(a => script.includes(a));
      if (found) {
        await bot.sendMessage(chatId, `⚙️ Запускаю \`${found}\`...`, { parse_mode: "Markdown" });
        const r = await runScript(found);
        await sendLong(chatId, truncate(r.output, 3500));
      } else {
        await bot.sendMessage(chatId, `Доступные скрипты:\n${allowed.map(s => `• \`${s}\``).join("\n")}`, { parse_mode: "Markdown" });
      }
      return;
    }

    // chat — свободный диалог
    const agentsList = agents.map(a => `${a.emoji}${a.name}(${a.role})`).join(", ");
    const chatR = await generate(
      `Ты — AI Office бот. Проект: пиксельный офис с AI-агентами для 3D-печатного бизнеса. ` +
      `Агенты: ${agentsList}. Отвечай кратко и по делу на русском.\n\n` +
      `История:\n${hist}\n\nСообщение: ${content}`
    );
    addHistory(chatId, "assistant", chatR.text.substring(0, 200));
    await sendLong(chatId, truncate(chatR.text));

  } catch (err) {
    await bot.sendMessage(chatId, `❌ ${err.message}`);
  }
});

bot.on("polling_error", (err) => console.error("Polling error:", err.message));

console.log("🤖 Telegram бот запущен...");
bot.getMe().then(me => console.log(`✅ @${me.username}`));
