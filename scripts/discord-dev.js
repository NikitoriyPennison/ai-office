#!/usr/bin/env node
/**
 * Девелопер — Discord бот-разработчик.
 * Понимает естественный язык. Без команд.
 */

const { Client, GatewayIntentBits, AttachmentBuilder } = require("discord.js");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const Database = require("better-sqlite3");
const { generate } = require("./lib/llm");

const DB_PATH = path.join(__dirname, "../data/database.sqlite");
const PROJECT_DIR = path.join(__dirname, "..");

const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
}

const TOKEN = process.env.DISCORD_TOKEN_DEV;
if (!TOKEN) { console.error("DISCORD_TOKEN_DEV not found"); process.exit(1); }

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

function truncate(t, max = 1900) { return !t ? "Нет данных" : t.length > max ? t.substring(0, max) + "\n..." : t; }

function runScript(name, args = []) {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn("node", [path.join(__dirname, name), ...args], { cwd: PROJECT_DIR });
    child.stdout.on("data", d => output += d.toString());
    child.stderr.on("data", d => output += d.toString());
    child.on("close", code => resolve({ code, output }));
    child.on("error", err => resolve({ code: 1, output: err.message }));
  });
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

const history = new Map();
function addH(ch, role, text) {
  const h = history.get(ch) || [];
  h.push({ role, text: text.substring(0, 300) });
  if (h.length > 8) h.shift();
  history.set(ch, h);
}

client.on("ready", () => {
  console.log(`💻 Девелопер: ${client.user.tag}`);
  client.user.setActivity("пиши что угодно");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
  if (!content) return;

  await message.channel.sendTyping();
  addH(message.channel.id, "user", content);

  const tree = fileTree(PROJECT_DIR).slice(0, 30).join("\n");
  const scripts = fs.readdirSync(__dirname).filter(f => f.endsWith(".js")).join(", ");

  let agents = [];
  try {
    const db = new Database(DB_PATH);
    agents = db.prepare("SELECT id, name, emoji, role, current_status FROM agents").all();
    db.close();
  } catch {}

  const hist = (history.get(message.channel.id) || []).map(h => `${h.role}: ${h.text}`).join("\n");

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

Примеры:
"привет" → chat
"как дела" → chat
"покажи статус" → status
"открой файл scheduler.js" → read_file
"задеплой" → deploy
"запусти отчёт" → run_script
"добавь бота маркетолога" → add_agent

Сообщение: "${content}"
Одно слово:`);

    const intent = intentR.text.trim().toLowerCase().split(/[\s,.\n]/)[0];

    // === STATUS ===
    if (intent === "status") {
      const icons = { working: "🟢", thinking: "🟡", busy: "🟠", idle: "⚪", offline: "🔴" };
      message.reply(agents.map(a => `${a.emoji} **${a.name}** ${icons[a.current_status] || "⚪"} ${a.current_status} — ${a.role}`).join("\n") || "Нет агентов");
      return;
    }

    // === LOGS ===
    if (intent === "logs") {
      const db = new Database(DB_PATH);
      const logs = db.prepare("SELECT entity_id, action, details, created_at FROM activity_logs ORDER BY created_at DESC LIMIT 10").all();
      db.close();
      const lines = logs.map(l => {
        const d = l.details ? JSON.parse(l.details) : {};
        return `\`${l.created_at?.substring(11, 19) || ""}\` **${l.entity_id}** ${d.statusText || d.message || l.action}`;
      });
      message.reply(lines.join("\n") || "Пусто");
      return;
    }

    // === DEPLOY ===
    if (intent === "deploy") {
      await message.reply("🚀 Деплою...");
      try {
        const { execSync } = require("child_process");
        const o = { encoding: "utf-8", cwd: PROJECT_DIR, timeout: 30000 };
        execSync("git add -A", o);
        const st = execSync("git status --short", o).trim();
        if (!st) { message.reply("📦 Нет изменений."); return; }
        execSync('git commit -m "Update from Discord Dev"', o);
        execSync("git push origin main", o);
        message.reply(`✅ Задеплоено!\n\`\`\`\n${st}\n\`\`\``);
      } catch (e) { message.reply(`❌ ${e.message.substring(0, 500)}`); }
      return;
    }

    // === READ FILE ===
    if (intent === "read_file") {
      const fR = await generate(`Из "${content}" извлеки путь к файлу. Файлы:\n${tree}\nТолько путь:`);
      const fp = path.join(PROJECT_DIR, fR.text.trim().replace(/[`"']/g, ""));
      if (fs.existsSync(fp)) {
        const fc = fs.readFileSync(fp, "utf-8");
        if (fc.length > 4000) {
          message.reply({ content: `📄 \`${fR.text.trim()}\``, files: [new AttachmentBuilder(fp).setName(path.basename(fp))] });
        } else {
          const ext = path.extname(fp).replace(".", "") || "txt";
          message.reply("```" + ext + "\n" + fc.substring(0, 1900) + "\n```");
        }
      } else { message.reply(`❌ Не найден: \`${fR.text.trim()}\``); }
      return;
    }

    // === EDIT / CREATE FILE ===
    if (intent === "edit_file" || intent === "create_file") {
      const infoR = await generate(`Из "${content}" извлеки JSON: {"file":"путь","task":"что сделать"}\nФайлы:\n${tree}\nТолько JSON:`);
      try {
        const info = JSON.parse(infoR.text.match(/\{[\s\S]*\}/)[0]);
        const fp = path.join(PROJECT_DIR, info.file);
        const exists = fs.existsSync(fp);
        await message.reply(`${exists ? "✏️ Редактирую" : "📝 Создаю"} \`${info.file}\`...`);

        const original = exists ? fs.readFileSync(fp, "utf-8").substring(0, 3000) : "";
        const codeR = await generate(exists
          ? `Файл ${info.file}:\n\`\`\`\n${original}\n\`\`\`\nЗадача: ${info.task}\nВерни ПОЛНЫЙ обновлённый файл. Только код.`
          : `Создай файл ${info.file}. Задача: ${info.task}\nВерни только код.`);

        const code = codeR.text.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "");
        const dir = path.dirname(fp);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fp, code);
        message.reply(`✅ ${exists ? "Обновлён" : "Создан"}: \`${info.file}\``);
      } catch (e) { message.reply(`❌ ${e.message}`); }
      return;
    }

    // === ADD AGENT ===
    if (intent === "add_agent") {
      const aR = await generate(`Из "${content}" извлеки JSON: {"id":"latin_id","name":"имя","emoji":"эмодзи","role":"роль"}\nТолько JSON:`);
      try {
        const info = JSON.parse(aR.text.match(/\{[\s\S]*\}/)[0]);
        const db = new Database(DB_PATH);
        db.prepare("INSERT OR REPLACE INTO agents (id,name,emoji,role,description,current_status) VALUES (?,?,?,?,?,'idle')")
          .run(info.id, info.name, info.emoji, info.role, info.description || "");
        db.close();
        message.reply(`✅ Агент: ${info.emoji} **${info.name}** — ${info.role}`);
      } catch (e) { message.reply(`❌ ${e.message}`); }
      return;
    }

    // === RUN SCRIPT ===
    if (intent === "run_script") {
      const allowed = ["market-analyst.js", "advisor.js", "blogger.js", "overseer.js", "secretary.js"];
      const sR = await generate(`Из "${content}" определи скрипт. Доступные: ${allowed.join(", ")}\nТолько имя файла:`);
      const script = sR.text.trim().replace(/[`"']/g, "");
      if (allowed.some(a => script.includes(a))) {
        await message.reply(`⚙️ Запускаю \`${script}\`...`);
        const r = await runScript(script);
        message.reply(truncate(r.output, 1500));
      } else { message.reply(`Доступные: ${allowed.join(", ")}`); }
      return;
    }

    // === CHAT (default) ===
    const agentsList = agents.map(a => `${a.emoji}${a.name}(${a.role})`).join(", ");
    const chatR = await generate(`Ты — Девелопер, AI-разработчик. Проект: AI Office (Next.js, 6 агентов: ${agentsList}). Отвечай кратко на русском.\n\nИстория:\n${hist}\n\nСообщение: ${content}`);
    addH(message.channel.id, "assistant", chatR.text.substring(0, 200));
    message.reply(truncate(chatR.text));

  } catch (err) {
    message.reply(`❌ ${err.message}`);
  }
});

client.login(TOKEN);
