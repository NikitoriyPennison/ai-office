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

  // Офис отвечает только на ! команды или когда @упомянут
  if (!content.startsWith("!") && !message.mentions.has(client.user)) return;

  // Если @упомянут — преобразуем текст в команду
  let cmd = content;
  if (message.mentions.has(client.user) && !content.startsWith("!")) {
    const text = content.replace(/<@!?\d+>/g, "").trim().toLowerCase();
    if (text.includes("стик") || text.includes("отчёт") || text.includes("отчет") || text.includes("рынок")) cmd = "!стик";
    else if (text.includes("советник") || text.includes("идеи") || text.includes("белый список")) cmd = "!советник";
    else if (text.includes("блогер") || text.includes("видео")) cmd = "!блогер " + text.replace(/блогер|видео/g, "").trim();
    else if (text.includes("статус")) cmd = "!статус";
    else if (text.includes("сайт") || text.includes("ссылк")) cmd = "!сайт";
    else if (text.includes("помощь") || text.includes("команд")) cmd = "!помощь";
    else if (text.includes("надзиратель")) cmd = "!надзиратель " + text.replace(/надзиратель/g, "").trim();
    else {
      // Не распознано — краткий ответ без выдумок
      const agents = getStatuses();
      const icons = { working: "🟢", thinking: "🟡", busy: "🟠", idle: "⚪", offline: "🔴" };
      const statusLine = agents.map(a => `${a.emoji}${a.name} ${icons[a.current_status] || "⚪"}`).join(" | ");
      message.reply(`🏢 **AI Office**\n${statusLine}\n\nИспользуй \`!помощь\` для списка команд.`);
      return;
    }
  }

  // ── !сайт ──
  if (cmd === "!сайт" || cmd === "!site") {
    message.reply("🏢 **AI Office:** https://ai-office-production-70f8.up.railway.app\nЛогин: `admin` / `admin123`");
    return;
  }

  // ── !помощь ──
  if (cmd === "!помощь" || cmd === "!help") {
    const embed = new EmbedBuilder()
      .setColor(0xecb00a)
      .setTitle("🏢 AI Office — Команды")
      .setDescription([
        "**!сайт** — ссылка на AI Office",
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
  if (cmd === "!статус" || cmd === "!status") {
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
  if (cmd === "!стик" || cmd === "!stik") {
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
  if (cmd === "!советник" || cmd === "!advisor") {
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
  if (cmd === "!отчёт" || cmd === "!report") {
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
  if (cmd.startsWith("!блогер") || cmd.startsWith("!blogger")) {
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
  if (cmd.startsWith("!надзиратель") || cmd.startsWith("!overseer")) {
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

  // ── Умный чат — понимает намерение без команд ──
  if (content && !content.startsWith("!")) {
    const question = content.replace(/<@!?\d+>/g, "").trim();
    if (!question) return;

    await message.channel.sendTyping();

    // Собираем контекст
    const projectDir = path.join(__dirname, "..");
    const scriptsList = fs.readdirSync(path.join(__dirname)).filter(f => f.endsWith(".js")).join(", ");

    const intentPrompt = `Ты — AI-разработчик и ассистент. Определи что хочет пользователь и ответь JSON:
{
  "intent": "одно из: chat/read_file/edit_file/list_files/run_script/deploy/logs/status/report/advisor/blogger",
  "file": "путь к файлу если нужен",
  "edit_instruction": "что изменить если intent=edit_file",
  "script": "имя скрипта если intent=run_script",
  "topic": "тема если intent=blogger",
  "answer": "ответ пользователю если intent=chat"
}

Доступные скрипты: ${scriptsList}
Проект: Next.js AI Office с 6 агентами (Стик, Советник, Дейви, Блогер, Надзиратель, Девелопер).

Сообщение: "${question}"

Только JSON.`;

    try {
      const intentResult = await generate(intentPrompt);
      let intent;
      try {
        const jsonMatch = intentResult.text.match(/\{[\s\S]*\}/);
        intent = JSON.parse(jsonMatch[0]);
      } catch {
        // Не смог разобрать — просто отвечаем как чат
        const chatResult = await generate(`Ты — AI-разработчик офиса 3D-печати по имени Девелопер. Отвечай кратко на русском.\n\nСообщение: ${question}`);
        message.reply(truncate(chatResult.text, 1900));
        return;
      }

      // Выполняем намерение
      switch (intent.intent) {
        case "read_file": {
          const fp = path.join(projectDir, intent.file || "");
          if (!intent.file || !fs.existsSync(fp)) {
            message.reply(`Файл не найден: \`${intent.file}\`. Скажи какой файл показать.`);
          } else {
            const fc = fs.readFileSync(fp, "utf-8");
            const ext = path.extname(fp).replace(".", "") || "txt";
            const chunks = fc.match(/[\s\S]{1,1900}/g) || ["(пусто)"];
            for (const chunk of chunks.slice(0, 3)) {
              await message.reply("```" + ext + "\n" + chunk + "\n```");
            }
          }
          break;
        }

        case "edit_file": {
          const fp = path.join(projectDir, intent.file || "");
          if (!intent.file || !fs.existsSync(fp)) {
            message.reply(`Не могу найти файл: \`${intent.file}\``);
            break;
          }
          await message.reply(`✏️ Редактирую \`${intent.file}\`...`);
          const original = fs.readFileSync(fp, "utf-8");
          const editPrompt = `Вот файл ${intent.file}:\n\`\`\`\n${original.substring(0, 3000)}\n\`\`\`\n\nЗадача: ${intent.edit_instruction}\n\nВерни ПОЛНЫЙ обновлённый файл в блоке \`\`\`.`;
          const editResult = await generate(editPrompt);
          const codeMatch = editResult.text.match(/```[\w]*\n([\s\S]*?)```/);
          if (codeMatch) {
            fs.writeFileSync(fp, codeMatch[1]);
            message.reply(`✅ Готово! Файл \`${intent.file}\` обновлён.`);
          } else {
            message.reply(`⚠️ Не смог сгенерировать код. Попробуй уточнить.`);
          }
          break;
        }

        case "list_files": {
          function listDir(dir, prefix = "", depth = 0) {
            if (depth > 2) return [];
            const lines = [];
            try {
              const entries = fs.readdirSync(dir).filter(f => !f.startsWith(".") && f !== "node_modules" && f !== ".next");
              for (const e of entries.slice(0, 25)) {
                const full = path.join(dir, e);
                const stat = fs.statSync(full);
                lines.push(prefix + (stat.isDirectory() ? "📁 " : "📄 ") + e + (stat.isDirectory() ? "/" : ""));
                if (stat.isDirectory()) lines.push(...listDir(full, prefix + "  ", depth + 1));
              }
            } catch {}
            return lines;
          }
          const tree = listDir(projectDir).slice(0, 40);
          message.reply("```\n" + tree.join("\n") + "\n```");
          break;
        }

        case "run_script": {
          const allowed = ["market-analyst.js", "advisor.js", "blogger.js", "overseer.js", "secretary.js"];
          const script = intent.script || "";
          if (!allowed.some(a => script.includes(a))) {
            message.reply(`Могу запустить: ${allowed.join(", ")}`);
            break;
          }
          await message.reply(`⚙️ Запускаю ${script}...`);
          const r = await runScript(script, intent.topic ? ["video", intent.topic] : []);
          message.reply(truncate(r.output, 1500));
          break;
        }

        case "deploy": {
          await message.reply("🚀 Деплою...");
          try {
            const { execSync } = require("child_process");
            const opts = { encoding: "utf-8", cwd: projectDir, timeout: 30000 };
            execSync('git add -A', opts);
            const status = execSync('git status --short', opts).trim();
            if (!status) { message.reply("📦 Нет изменений."); break; }
            execSync('git commit -m "Deploy from Discord"', opts);
            execSync('git push origin main', opts);
            message.reply(`✅ Задеплоено!\n\`\`\`\n${status}\n\`\`\``);
          } catch (err) { message.reply(`❌ ${err.message.substring(0, 500)}`); }
          break;
        }

        case "logs": {
          const db = new Database(DB_PATH);
          const logs = db.prepare("SELECT entity_id, action, details, created_at FROM activity_logs ORDER BY created_at DESC LIMIT 10").all();
          db.close();
          const lines = logs.map(l => {
            const d = l.details ? JSON.parse(l.details) : {};
            return `\`${l.created_at?.substring(11, 19) || ""}\` **${l.entity_id}** ${d.statusText || d.message || l.action}`;
          });
          message.reply(lines.join("\n") || "Логов нет");
          break;
        }

        case "status": {
          const agents = getStatuses();
          const icons = { working: "🟢", thinking: "🟡", busy: "🟠", idle: "⚪", offline: "🔴" };
          const lines = agents.map(a => `${a.emoji} **${a.name}** ${icons[a.current_status] || "⚪"} ${a.current_status}`);
          message.reply(lines.join("\n"));
          break;
        }

        case "report": {
          await message.reply("📊 Стик начинает анализ...");
          const r = await runScript("market-analyst.js");
          const report = readFile(path.join(REPORTS_DIR, "latest.md"));
          message.reply(truncate(report || r.output, 1900));
          break;
        }

        case "advisor": {
          const report = readFile(path.join(WHITELIST_DIR, "latest.md"));
          message.reply(truncate(report || "Нет отчёта. Скажи 'запусти советника'.", 1900));
          break;
        }

        case "blogger": {
          await message.reply(`🎬 Блогер создаёт видео${intent.topic ? ": " + intent.topic : ""}...`);
          const r = await runScript("blogger.js", intent.topic ? ["video", intent.topic] : []);
          message.reply(truncate(r.output, 1500));
          break;
        }

        default: {
          // Просто чат
          const chatPrompt = `Ты — AI-разработчик офиса 3D-печати по имени Девелопер. У тебя команда из 6 агентов. Ты можешь читать/редактировать код, деплоить, запускать скрипты. Отвечай кратко и по делу на русском.\n\n${question}`;
          const chatResult = await generate(chatPrompt);
          message.reply(truncate(chatResult.text, 1900));
        }
      }
    } catch (err) {
      message.reply(`❌ ${err.message}`);
    }
  }
});

client.login(TOKEN);
