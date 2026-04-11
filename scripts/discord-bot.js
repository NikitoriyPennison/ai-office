#!/usr/bin/env node
/**
 * AI Office Discord Bot — один бот, все агенты.
 * Команды:
 *   !стик       — запросить отчёт Стика
 *   !советник   — белый список Советника
 *   !блогер     — создать видео
 *   !надзиратель "задание" — дать задание команде
 *   !статус     — показать статус всех агентов
 *   !помощь     — список команд
 *
 * Также можно просто написать сообщение — бот ответит через LLM от лица агента.
 */

const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const Database = require("better-sqlite3");
const { generate } = require("./lib/llm");

const DB_PATH = path.join(__dirname, "../data/database.sqlite");
const REPORTS_DIR = path.join(__dirname, "../reports");
const WHITELIST_DIR = path.join(__dirname, "../reports/whitelist");

// Load .env
const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
}

const TOKEN = process.env.DISCORD_TOKEN_STIK;
if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN_STIK not found in .env");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const AGENTS = {
  garik: { name: "Стик", emoji: "📊", role: "Аналитик рынка 3D-печати" },
  vanya: { name: "Советник", emoji: "🧠", role: "Бизнес-советник" },
  pushkin: { name: "Дейви", emoji: "📞", role: "Секретарь-переводчик" },
  tema: { name: "Блогер", emoji: "🎬", role: "TikTok блогер" },
  stoyanov: { name: "Надзиратель", emoji: "👁️", role: "Менеджер задач" },
};

// Run a script and return output
function runScript(scriptName, args = []) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, scriptName);
    let output = "";
    const child = spawn("node", [scriptPath, ...args], {
      cwd: path.join(__dirname, ".."),
    });
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("close", (code) => resolve({ code, output }));
    child.on("error", (err) => resolve({ code: 1, output: err.message }));
  });
}

// Get agent statuses from DB
function getStatuses() {
  try {
    const db = new Database(DB_PATH);
    const agents = db.prepare("SELECT id, name, emoji, role, current_status FROM agents").all();
    db.close();
    return agents;
  } catch { return []; }
}

// Read latest report
function readFile(filePath) {
  try {
    if (fs.existsSync(filePath)) return fs.readFileSync(filePath, "utf-8");
  } catch {}
  return null;
}

// Truncate for Discord (max 4096 chars for embed description)
function truncate(text, max = 3900) {
  if (!text) return "Нет данных";
  return text.length > max ? text.substring(0, max) + "\n\n*...обрезано...*" : text;
}

client.on("ready", () => {
  console.log(`🤖 Discord бот запущен: ${client.user.tag}`);
  client.user.setActivity("AI Office | !помощь");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();

  // ── !помощь ──
  if (content === "!помощь" || content === "!help") {
    const embed = new EmbedBuilder()
      .setColor(0xecb00a)
      .setTitle("🏢 AI Office — Команды")
      .setDescription([
        "**!статус** — статус всех агентов",
        "**!стик** — последний отчёт по рынку 3D-печати",
        "**!советник** — белый список идей",
        "**!блогер** — создать видео для TikTok",
        "**!надзиратель** `задание` — дать задание команде",
        "**!отчёт** — запустить новый отчёт Стика",
        "",
        "Или просто напиши сообщение — бот ответит через AI.",
      ].join("\n"));
    message.reply({ embeds: [embed] });
    return;
  }

  // ── !статус ──
  if (content === "!статус" || content === "!status") {
    const agents = getStatuses();
    const statusIcons = { working: "🟢", thinking: "🟡", busy: "🟠", idle: "⚪", offline: "🔴" };
    const lines = agents.map(a =>
      `${a.emoji} **${a.name}** ${statusIcons[a.current_status] || "⚪"} ${a.current_status}`
    );
    const embed = new EmbedBuilder()
      .setColor(0x00b894)
      .setTitle("👥 Статус команды")
      .setDescription(lines.join("\n"));
    message.reply({ embeds: [embed] });
    return;
  }

  // ── !стик ──
  if (content === "!стик" || content === "!stik") {
    const report = readFile(path.join(REPORTS_DIR, "latest.md"));
    const embed = new EmbedBuilder()
      .setColor(0xecb00a)
      .setTitle("📊 Отчёт Стика")
      .setDescription(truncate(report));
    message.reply({ embeds: [embed] });
    return;
  }

  // ── !советник ──
  if (content === "!советник" || content === "!advisor") {
    const report = readFile(path.join(WHITELIST_DIR, "latest.md"));
    const embed = new EmbedBuilder()
      .setColor(0x6c5ce7)
      .setTitle("🧠 Белый список Советника")
      .setDescription(truncate(report));
    message.reply({ embeds: [embed] });
    return;
  }

  // ── !отчёт — запустить Стика ──
  if (content === "!отчёт" || content === "!report") {
    await message.reply("📊 Стик начинает анализ рынка...");
    const result = await runScript("market-analyst.js");
    const report = readFile(path.join(REPORTS_DIR, "latest.md"));
    const embed = new EmbedBuilder()
      .setColor(result.code === 0 ? 0x00b894 : 0xe17055)
      .setTitle(result.code === 0 ? "📊 Отчёт готов!" : "❌ Ошибка")
      .setDescription(truncate(report || result.output));
    message.reply({ embeds: [embed] });
    return;
  }

  // ── !блогер ──
  if (content.startsWith("!блогер") || content.startsWith("!blogger")) {
    const topic = content.replace(/^!(блогер|blogger)\s*/, "").trim();
    await message.reply(`🎬 Блогер создаёт видео${topic ? ": " + topic : ""}...`);
    const args = topic ? ["video", topic] : [];
    const result = await runScript("blogger.js", args);
    const embed = new EmbedBuilder()
      .setColor(result.code === 0 ? 0x00b894 : 0xe17055)
      .setTitle(result.code === 0 ? "🎬 Видео готово!" : "❌ Ошибка")
      .setDescription(truncate(result.output, 1500));
    message.reply({ embeds: [embed] });
    return;
  }

  // ── !надзиратель ──
  if (content.startsWith("!надзиратель") || content.startsWith("!overseer")) {
    const order = content.replace(/^!(надзиратель|overseer)\s*/, "").trim();
    if (!order) {
      message.reply("👁️ Укажи задание: `!надзиратель Сделай отчёт и создай видео`");
      return;
    }
    await message.reply(`👁️ Надзиратель принял задание: *${order}*`);
    const result = await runScript("overseer.js", [order]);
    const embed = new EmbedBuilder()
      .setColor(result.code === 0 ? 0x00b894 : 0xe17055)
      .setTitle("👁️ Задание выполнено")
      .setDescription(truncate(result.output, 1500));
    message.reply({ embeds: [embed] });
    return;
  }

  // ── Свободный чат через LLM ──
  if (content.startsWith("!чат") || content.startsWith("!chat") || message.mentions.has(client.user)) {
    const question = content.replace(/^!(чат|chat)\s*/, "").replace(/<@!?\d+>/g, "").trim();
    if (!question) {
      message.reply("Напиши вопрос: `!чат Какие тренды в 3D печати?`");
      return;
    }

    await message.channel.sendTyping();

    const prompt = `Ты — AI-ассистент офиса 3D-печати. У тебя команда: Стик (аналитик), Советник (бизнес), Дейви (секретарь), Блогер (TikTok), Надзиратель (менеджер). Отвечай кратко и по делу на русском.\n\nВопрос: ${question}`;

    try {
      const result = await generate(prompt);
      const embed = new EmbedBuilder()
        .setColor(0x74b9ff)
        .setTitle("💬 AI Office")
        .setDescription(truncate(result.text, 3900))
        .setFooter({ text: `via ${result.provider}` });
      message.reply({ embeds: [embed] });
    } catch (err) {
      message.reply(`❌ Ошибка: ${err.message}`);
    }
  }
});

client.login(TOKEN);
