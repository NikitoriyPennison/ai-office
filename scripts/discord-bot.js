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

const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require("discord.js");
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
        "**!блогер** `тема` — создать видео для TikTok",
        "**!надзиратель** `задание` — дать задание команде",
        "**!отчёт** — запустить новый отчёт Стика",
        "",
        "💻 **Девелопер:**",
        "**!файл** `путь` — прочитать файл",
        "**!файлы** — список файлов проекта",
        "**!код** `вопрос` — спросить про код",
        "**!редакт** `путь` `что изменить` — изменить файл через AI",
        "**!запуск** `команда` — выполнить скрипт",
        "**!деплой** — коммит + пуш на GitHub",
        "**!логи** — последние логи Railway",
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
    const reportPath = path.join(REPORTS_DIR, "latest.md");
    const report = readFile(reportPath);
    const embed = new EmbedBuilder()
      .setColor(0xecb00a)
      .setTitle("📊 Отчёт Стика")
      .setDescription(truncate(report));
    const files = [];
    if (report && fs.existsSync(reportPath)) {
      files.push(new AttachmentBuilder(reportPath).setName("отчёт-стика.md"));
    }
    message.reply({ embeds: [embed], files });
    return;
  }

  // ── !советник ──
  if (content === "!советник" || content === "!advisor") {
    const reportPath = path.join(WHITELIST_DIR, "latest.md");
    const report = readFile(reportPath);
    const embed = new EmbedBuilder()
      .setColor(0x6c5ce7)
      .setTitle("🧠 Белый список Советника")
      .setDescription(truncate(report));
    const files = [];
    if (report && fs.existsSync(reportPath)) {
      files.push(new AttachmentBuilder(reportPath).setName("белый-список.md"));
    }
    message.reply({ embeds: [embed], files });
    return;
  }

  // ── !отчёт — запустить Стика ──
  if (content === "!отчёт" || content === "!report") {
    await message.reply("📊 Стик начинает анализ рынка...");
    const result = await runScript("market-analyst.js");
    const reportPath = path.join(REPORTS_DIR, "latest.md");
    const report = readFile(reportPath);
    const embed = new EmbedBuilder()
      .setColor(result.code === 0 ? 0x00b894 : 0xe17055)
      .setTitle(result.code === 0 ? "📊 Отчёт готов!" : "❌ Ошибка")
      .setDescription(truncate(report || result.output));
    const files = [];
    if (result.code === 0 && fs.existsSync(reportPath)) {
      files.push(new AttachmentBuilder(reportPath).setName("отчёт-стика.md"));
    }
    message.reply({ embeds: [embed], files });
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
    // Найти и отправить видео + сценарий
    const files = [];
    const videosDir = path.join(__dirname, "../content/videos");
    const scriptsDir = path.join(__dirname, "../content/scripts");
    try {
      if (fs.existsSync(videosDir)) {
        const vids = fs.readdirSync(videosDir).filter(f => f.endsWith(".mp4")).sort().reverse();
        if (vids[0]) {
          const vidPath = path.join(videosDir, vids[0]);
          const stat = fs.statSync(vidPath);
          if (stat.size < 25 * 1024 * 1024) { // < 25MB
            files.push(new AttachmentBuilder(vidPath).setName(vids[0]));
          } else {
            embed.setFooter({ text: "Видео > 25MB, не влезает в Discord" });
          }
        }
      }
      if (fs.existsSync(scriptsDir)) {
        const scripts = fs.readdirSync(scriptsDir).filter(f => f.endsWith(".json")).sort().reverse();
        if (scripts[0]) {
          files.push(new AttachmentBuilder(path.join(scriptsDir, scripts[0])).setName("сценарий.json"));
        }
      }
    } catch {}
    message.reply({ embeds: [embed], files });
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

  // ── 💻 ДЕВЕЛОПЕР: !файл — прочитать файл ──
  if (content.startsWith("!файл ") || content.startsWith("!file ")) {
    const filePath = content.replace(/^!(файл|file)\s+/, "").trim();
    const fullPath = path.join(__dirname, "..", filePath);
    try {
      if (!fs.existsSync(fullPath)) {
        message.reply(`❌ Файл не найден: \`${filePath}\``);
        return;
      }
      const stat = fs.statSync(fullPath);
      if (stat.size > 50000) {
        message.reply(`⚠️ Файл слишком большой (${(stat.size/1024).toFixed(1)}KB). Отправляю как вложение.`);
        message.reply({ files: [new AttachmentBuilder(fullPath).setName(path.basename(fullPath))] });
        return;
      }
      const content_file = fs.readFileSync(fullPath, "utf-8");
      const ext = path.extname(fullPath).replace(".", "") || "txt";
      const chunks = content_file.match(/[\s\S]{1,1900}/g) || ["(пустой файл)"];
      for (const chunk of chunks.slice(0, 3)) {
        await message.reply("```" + ext + "\n" + chunk + "\n```");
      }
      if (chunks.length > 3) message.reply(`*...ещё ${chunks.length - 3} частей*`);
    } catch (err) {
      message.reply(`❌ Ошибка: ${err.message}`);
    }
    return;
  }

  // ── 💻 ДЕВЕЛОПЕР: !файлы — список файлов ──
  if (content === "!файлы" || content === "!files") {
    const projectDir = path.join(__dirname, "..");
    function listDir(dir, prefix = "", depth = 0) {
      if (depth > 2) return [];
      const lines = [];
      try {
        const entries = fs.readdirSync(dir).filter(f => !f.startsWith(".") && f !== "node_modules" && f !== ".next");
        for (const e of entries.slice(0, 30)) {
          const full = path.join(dir, e);
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            lines.push(prefix + "📁 " + e + "/");
            lines.push(...listDir(full, prefix + "  ", depth + 1));
          } else {
            lines.push(prefix + "📄 " + e);
          }
        }
      } catch {}
      return lines;
    }
    const tree = listDir(projectDir).slice(0, 50);
    const embed = new EmbedBuilder()
      .setColor(0x74b9ff)
      .setTitle("💻 Структура проекта")
      .setDescription("```\n" + tree.join("\n") + "\n```");
    message.reply({ embeds: [embed] });
    return;
  }

  // ── 💻 ДЕВЕЛОПЕР: !код — вопрос про код ──
  if (content.startsWith("!код ") || content.startsWith("!code ")) {
    const question = content.replace(/^!(код|code)\s+/, "").trim();
    await message.channel.sendTyping();

    // Собрать контекст проекта
    const packageJson = readFile(path.join(__dirname, "../package.json")) || "";
    const fileList = fs.readdirSync(path.join(__dirname, "../scripts")).join(", ");

    const prompt = `Ты — разработчик проекта AI Office (Next.js + PixiJS + SQLite).

Структура: Next.js 15 приложение с пиксельным офисом, 6 AI-агентов, Discord бот, Groq LLM.
Скрипты: ${fileList}
package.json (частично): ${packageJson.substring(0, 500)}

Вопрос: ${question}

Отвечай конкретно, с примерами кода если нужно. На русском.`;

    try {
      const result = await generate(prompt);
      message.reply(truncate(result.text, 1900));
    } catch (err) {
      message.reply(`❌ ${err.message}`);
    }
    return;
  }

  // ── 💻 ДЕВЕЛОПЕР: !редакт — изменить файл через AI ──
  if (content.startsWith("!редакт ") || content.startsWith("!edit ")) {
    const parts = content.replace(/^!(редакт|edit)\s+/, "").trim();
    const firstSpace = parts.indexOf(" ");
    if (firstSpace === -1) {
      message.reply("💻 Формат: `!редакт путь/к/файлу что изменить`");
      return;
    }
    const filePath = parts.substring(0, firstSpace);
    const instruction = parts.substring(firstSpace + 1);
    const fullPath = path.join(__dirname, "..", filePath);

    if (!fs.existsSync(fullPath)) {
      message.reply(`❌ Файл не найден: \`${filePath}\``);
      return;
    }

    await message.channel.sendTyping();
    const originalContent = fs.readFileSync(fullPath, "utf-8");

    const prompt = `Ты — разработчик. Вот содержимое файла ${filePath}:

\`\`\`
${originalContent.substring(0, 3000)}
\`\`\`

Задача: ${instruction}

Верни ПОЛНЫЙ обновлённый файл. Только код, без пояснений. Начни с \`\`\` и закончи \`\`\`.`;

    try {
      const result = await generate(prompt);
      const codeMatch = result.text.match(/```[\w]*\n([\s\S]*?)```/);
      if (codeMatch) {
        fs.writeFileSync(fullPath, codeMatch[1]);
        message.reply(`✅ Файл обновлён: \`${filePath}\``);
      } else {
        fs.writeFileSync(fullPath, result.text);
        message.reply(`✅ Файл перезаписан: \`${filePath}\` (AI не обернул в блок кода)`);
      }
    } catch (err) {
      message.reply(`❌ ${err.message}`);
    }
    return;
  }

  // ── 💻 ДЕВЕЛОПЕР: !запуск — выполнить скрипт ──
  if (content.startsWith("!запуск ") || content.startsWith("!run ")) {
    const cmd = content.replace(/^!(запуск|run)\s+/, "").trim();
    // Безопасность: только скрипты из scripts/
    const allowed = ["market-analyst.js", "advisor.js", "blogger.js", "overseer.js", "life-sim.js", "secretary.js"];
    const scriptName = cmd.split(" ")[0];
    if (!allowed.some(a => cmd.includes(a))) {
      message.reply(`⚠️ Можно запускать только: ${allowed.join(", ")}`);
      return;
    }
    await message.reply(`⚙️ Запускаю: \`${cmd}\``);
    const args = cmd.split(" ");
    const result = await runScript(args[0], args.slice(1));
    const embed = new EmbedBuilder()
      .setColor(result.code === 0 ? 0x00b894 : 0xe17055)
      .setTitle(result.code === 0 ? "✅ Готово" : "❌ Ошибка")
      .setDescription(truncate(result.output, 1500));
    message.reply({ embeds: [embed] });
    return;
  }

  // ── 💻 ДЕВЕЛОПЕР: !деплой — коммит и пуш ──
  if (content === "!деплой" || content === "!deploy") {
    await message.reply("🚀 Коммичу и пушу на GitHub...");
    try {
      const { execSync } = require("child_process");
      const opts = { encoding: "utf-8", cwd: path.join(__dirname, ".."), timeout: 30000 };
      execSync('git add -A', opts);
      const status = execSync('git status --short', opts).trim();
      if (!status) {
        message.reply("📦 Нет изменений для деплоя.");
        return;
      }
      execSync('git commit -m "Deploy from Discord bot"', opts);
      execSync('git push origin main', opts);
      message.reply(`✅ Задеплоено! Railway подхватит через 2-3 мин.\n\`\`\`\n${status}\n\`\`\``);
    } catch (err) {
      message.reply(`❌ Ошибка деплоя: ${err.message.substring(0, 500)}`);
    }
    return;
  }

  // ── 💻 ДЕВЕЛОПЕР: !логи — последние activity logs ──
  if (content === "!логи" || content === "!logs") {
    try {
      const db = new Database(DB_PATH);
      const logs = db.prepare("SELECT entity_id, action, details, created_at FROM activity_logs ORDER BY created_at DESC LIMIT 15").all();
      db.close();
      const lines = logs.map(l => {
        const d = l.details ? JSON.parse(l.details) : {};
        const msg = d.statusText || d.message || d.summary || l.action;
        return `\`${l.created_at?.substring(11, 19) || ""}\` **${l.entity_id}** ${msg}`;
      });
      const embed = new EmbedBuilder()
        .setColor(0x636e72)
        .setTitle("📋 Последние логи")
        .setDescription(lines.join("\n") || "Пусто");
      message.reply({ embeds: [embed] });
    } catch (err) {
      message.reply(`❌ ${err.message}`);
    }
    return;
  }

  // ── Свободный чат — отвечает на ЛЮБОЕ сообщение ──
  if (content && !content.startsWith("!")) {
    const question = content.replace(/<@!?\d+>/g, "").trim();
    if (!question) return;

    await message.channel.sendTyping();

    const prompt = `Ты — AI-ассистент офиса 3D-печати по имени Офис. У тебя команда: Стик (аналитик рынка), Советник (бизнес-идеи), Дейви (секретарь, звонки), Блогер (TikTok видео), Надзиратель (менеджер задач).

Ты дружелюбный, отвечаешь кратко и по делу на русском. Если тебя спрашивают про команды бота — подскажи (!стик, !советник, !блогер, !надзиратель, !статус, !отчёт).

Сообщение: ${question}`;

    try {
      const result = await generate(prompt);
      message.reply(truncate(result.text, 1900));
    } catch (err) {
      message.reply(`❌ Ошибка: ${err.message}`);
    }
  }
});

client.login(TOKEN);
