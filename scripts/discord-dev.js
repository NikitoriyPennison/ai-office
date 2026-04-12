#!/usr/bin/env node
/**
 * Девелопер — Discord бот-разработчик.
 * Понимает естественный язык, без команд.
 * Может читать/редактировать код, создавать ботов, деплоить.
 */

const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const Database = require("better-sqlite3");
const { generate } = require("./lib/llm");

const DB_PATH = path.join(__dirname, "../data/database.sqlite");
const PROJECT_DIR = path.join(__dirname, "..");

// Load .env
const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
}

const TOKEN = process.env.DISCORD_TOKEN_DEV;
if (!TOKEN) {
  console.error("❌ DISCORD_TOKEN_DEV not found in .env");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function truncate(text, max = 1900) {
  if (!text) return "Нет данных";
  return text.length > max ? text.substring(0, max) + "\n\n*...обрезано...*" : text;
}

function runScript(name, args = []) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, name);
    let output = "";
    const child = spawn("node", [scriptPath, ...args], { cwd: PROJECT_DIR });
    child.stdout.on("data", (d) => (output += d.toString()));
    child.stderr.on("data", (d) => (output += d.toString()));
    child.on("close", (code) => resolve({ code, output }));
    child.on("error", (err) => resolve({ code: 1, output: err.message }));
  });
}

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

// Conversation history per channel (last 5 messages)
const history = new Map();

function getHistory(channelId) {
  return history.get(channelId) || [];
}

function addHistory(channelId, role, content) {
  const h = getHistory(channelId);
  h.push({ role, content: content.substring(0, 500) });
  if (h.length > 10) h.shift();
  history.set(channelId, h);
}

client.on("ready", () => {
  console.log(`💻 Девелопер запущен: ${client.user.tag}`);
  client.user.setActivity("Разработка | пиши что угодно");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
  if (!content) return;

  await message.channel.sendTyping();
  addHistory(message.channel.id, "user", content);

  // Собираем контекст
  const scriptsList = fs.readdirSync(__dirname).filter(f => f.endsWith(".js")).join(", ");
  const fileTree = listDir(PROJECT_DIR).slice(0, 30).join("\n");

  let agents = [];
  try {
    const db = new Database(DB_PATH);
    agents = db.prepare("SELECT id, name, emoji, role, current_status FROM agents").all();
    db.close();
  } catch {}
  const agentsList = agents.map(a => `${a.emoji} ${a.name} (${a.id}) — ${a.role} [${a.current_status}]`).join("\n");

  const chatHistory = getHistory(message.channel.id).map(h => `${h.role}: ${h.content}`).join("\n");

  const prompt = `Ты — Девелопер, AI-разработчик проекта AI Office. Ты работаешь через Discord.

ПРОЕКТ: Next.js 15 + PixiJS пиксельный офис с AI-агентами. Деплой на Railway + GitHub.
СКРИПТЫ: ${scriptsList}
АГЕНТЫ:
${agentsList}

ФАЙЛЫ:
${fileTree}

ИСТОРИЯ ЧАТА:
${chatHistory}

ТЫ МОЖЕШЬ:
1. Читать файлы — верни JSON: {"action":"read","file":"путь"}
2. Редактировать файлы — верни JSON: {"action":"edit","file":"путь","content":"полный новый контент файла"}
3. Создать новый файл — верни JSON: {"action":"create","file":"путь","content":"контент"}
4. Добавить агента — верни JSON: {"action":"add_agent","id":"id","name":"имя","emoji":"эмодзи","role":"роль","description":"описание"}
5. Запустить скрипт — верни JSON: {"action":"run","script":"имя.js","args":["аргументы"]}
6. Деплоить — верни JSON: {"action":"deploy","message":"описание изменений"}
7. Показать статус — верни JSON: {"action":"status"}
8. Показать логи — верни JSON: {"action":"logs"}
9. Просто ответить — верни JSON: {"action":"chat","text":"твой ответ"}

ПРАВИЛА:
- Если нужно несколько действий — верни массив JSON: [{"action":"..."},{"action":"..."}]
- Для edit/create всегда давай ПОЛНЫЙ контент файла
- Отвечай на русском
- Будь конкретным и полезным

Сообщение пользователя: ${content}

Ответь СТРОГО JSON (одним объектом или массивом).`;

  try {
    const result = await generate(prompt);
    let actions;
    try {
      const match = result.text.match(/\[[\s\S]*\]/) || result.text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match[0]);
      actions = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // Не смог разобрать JSON — отвечаем как чат
      addHistory(message.channel.id, "assistant", result.text);
      message.reply(truncate(result.text));
      return;
    }

    for (const action of actions) {
      switch (action.action) {
        case "read": {
          const fp = path.join(PROJECT_DIR, action.file || "");
          if (!fs.existsSync(fp)) {
            message.reply(`❌ Не найден: \`${action.file}\``);
            break;
          }
          const fc = fs.readFileSync(fp, "utf-8");
          if (fc.length > 4000) {
            message.reply({ content: `📄 \`${action.file}\``, files: [new AttachmentBuilder(fp).setName(path.basename(fp))] });
          } else {
            const ext = path.extname(fp).replace(".", "") || "txt";
            message.reply("```" + ext + "\n" + fc.substring(0, 1900) + "\n```");
          }
          addHistory(message.channel.id, "assistant", `Показал файл ${action.file}`);
          break;
        }

        case "edit":
        case "create": {
          const fp = path.join(PROJECT_DIR, action.file || "");
          const dir = path.dirname(fp);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(fp, action.content || "");
          const verb = action.action === "create" ? "Создан" : "Изменён";
          message.reply(`✅ ${verb}: \`${action.file}\``);
          addHistory(message.channel.id, "assistant", `${verb} файл ${action.file}`);
          break;
        }

        case "add_agent": {
          try {
            const db = new Database(DB_PATH);
            db.prepare(`INSERT OR REPLACE INTO agents (id, name, emoji, role, description, current_status)
              VALUES (?, ?, ?, ?, ?, 'idle')`)
              .run(action.id, action.name, action.emoji, action.role, action.description || "");
            db.close();
            message.reply(`✅ Агент добавлен: ${action.emoji} **${action.name}** — ${action.role}`);
            addHistory(message.channel.id, "assistant", `Добавлен агент ${action.name}`);
          } catch (err) {
            message.reply(`❌ ${err.message}`);
          }
          break;
        }

        case "run": {
          const script = action.script || "";
          const allowed = ["market-analyst.js", "advisor.js", "blogger.js", "overseer.js", "secretary.js", "life-sim.js"];
          if (!allowed.some(a => script.includes(a))) {
            message.reply(`⚠️ Доступные скрипты: ${allowed.join(", ")}`);
            break;
          }
          await message.reply(`⚙️ Запускаю \`${script}\`...`);
          const r = await runScript(script, action.args || []);
          message.reply(truncate(r.output, 1500));
          addHistory(message.channel.id, "assistant", `Запустил ${script}`);
          break;
        }

        case "deploy": {
          await message.reply("🚀 Деплою...");
          try {
            const { execSync } = require("child_process");
            const opts = { encoding: "utf-8", cwd: PROJECT_DIR, timeout: 30000 };
            execSync('git add -A', opts);
            const status = execSync('git status --short', opts).trim();
            if (!status) { message.reply("📦 Нет изменений."); break; }
            execSync(`git commit -m "${(action.message || 'Update from Discord Dev bot').replace(/"/g, "'")}"`, opts);
            execSync('git push origin main', opts);
            message.reply(`✅ Задеплоено!\n\`\`\`\n${status}\n\`\`\``);
            addHistory(message.channel.id, "assistant", "Задеплоил изменения");
          } catch (err) {
            message.reply(`❌ ${err.message.substring(0, 500)}`);
          }
          break;
        }

        case "status": {
          const ags = agents.length ? agents : [];
          const icons = { working: "🟢", thinking: "🟡", busy: "🟠", idle: "⚪", offline: "🔴" };
          const lines = ags.map(a => `${a.emoji} **${a.name}** ${icons[a.current_status] || "⚪"} ${a.current_status}`);
          message.reply(lines.join("\n") || "Нет агентов");
          addHistory(message.channel.id, "assistant", "Показал статус");
          break;
        }

        case "logs": {
          try {
            const db = new Database(DB_PATH);
            const logs = db.prepare("SELECT entity_id, action, details, created_at FROM activity_logs ORDER BY created_at DESC LIMIT 10").all();
            db.close();
            const lines = logs.map(l => {
              const d = l.details ? JSON.parse(l.details) : {};
              return `\`${l.created_at?.substring(11, 19) || ""}\` **${l.entity_id}** ${d.statusText || d.message || l.action}`;
            });
            message.reply(lines.join("\n") || "Логов нет");
          } catch (err) { message.reply(`❌ ${err.message}`); }
          addHistory(message.channel.id, "assistant", "Показал логи");
          break;
        }

        case "chat":
        default: {
          const text = action.text || action.answer || JSON.stringify(action);
          message.reply(truncate(text));
          addHistory(message.channel.id, "assistant", text.substring(0, 200));
        }
      }
    }
  } catch (err) {
    message.reply(`❌ ${err.message}`);
  }
});

client.login(TOKEN);
