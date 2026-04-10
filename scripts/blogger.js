#!/usr/bin/env node
/**
 * Блогер — генерирует TikTok видео про 3D-печать
 * 1. Ollama создаёт сценарий
 * 2. Edge-TTS озвучивает
 * 3. FFmpeg собирает слайдшоу из цветных слайдов + текст + аудио
 *
 * Использование:
 *   node blogger.js                    — полный цикл (сценарий → аудио → видео)
 *   node blogger.js script             — только сценарий
 *   node blogger.js video "тема"       — видео на конкретную тему
 */

const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const { execSync, exec } = require("child_process");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "../data/database.sqlite");
const CONTENT_DIR = path.join(__dirname, "../content");
const AGENT_ID = "tema"; // используем tema — дизайнер/блогер
const { generate } = require("./lib/llm");

const EDGE_TTS = path.join(process.env.LOCALAPPDATA || "", "Programs/Python/Python312/Scripts/edge-tts.exe");
const PYTHON = "C:\\Users\\user\\AppData\\Local\\Programs\\Python\\Python312\\python.exe";

// TTS голоса
const VOICE = "ru-RU-DmitryNeural"; // мужской русский

function setStatus(status, statusText) {
  try {
    const db = new Database(DB_PATH);
    db.prepare("UPDATE agents SET current_status = ? WHERE id = ?").run(status, AGENT_ID);
    db.prepare(`
      INSERT INTO activity_logs (id, entity_type, entity_id, action, details, created_at)
      VALUES (?, 'agent', ?, ?, ?, datetime('now'))
    `).run(randomUUID(), AGENT_ID, "status_change", JSON.stringify({ status, statusText }));
    db.close();
  } catch {}
  console.log(`[${new Date().toLocaleTimeString()}] ${status}: ${statusText}`);
}

// Генерация сценария
async function generateScript(topic) {
  const prompt = `Ты — популярный TikTok блогер про 3D-печать. Напиши короткий сценарий для вертикального видео (30-60 секунд).

${topic ? `Тема: ${topic}` : "Выбери актуальную тему про 3D-печать"}

Формат ответа — СТРОГО JSON:
{
  "title": "заголовок видео",
  "slides": [
    {"text": "текст на экране (короткий, 5-10 слов)", "voiceover": "что говорить (1-2 предложения)"},
    {"text": "...", "voiceover": "..."},
    {"text": "...", "voiceover": "..."},
    {"text": "...", "voiceover": "..."}
  ],
  "hashtags": ["#3dprint", "#3dprinting", "..."]
}

4-6 слайдов. Текст на экране — крупный и короткий. Озвучка — разговорная, энергичная.
Отвечай ТОЛЬКО JSON, без пояснений.`;

  const raw = (await generate(prompt)).text;

  // Извлечь JSON из ответа
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Не удалось извлечь JSON из ответа");

  return JSON.parse(jsonMatch[0]);
}

// Озвучка через edge-tts
async function generateAudio(text, outputPath) {
  return new Promise((resolve, reject) => {
    const cmd = `"${PYTHON}" -m edge_tts --voice "${VOICE}" --text "${text.replace(/"/g, '\\"')}" --write-media "${outputPath}"`;
    exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`TTS error: ${stderr || err.message}`));
      else resolve(outputPath);
    });
  });
}

// Создать слайд через ffmpeg lavfi (цветной фон + drawtext)
function createSlideImage(text, index) {
  // Возвращаем параметры для ffmpeg lavfi вместо файла
  const colors = ["FF6B6B", "4ECDC4", "45B7D1", "96CEB4", "FFEAA7", "DDA0DD"];
  const bgColor = colors[index % colors.length];
  return { text, bgColor };
}

function escapeXml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Собрать видео из слайдов + аудио
async function assembleVideo(slides, audioFiles, outputPath) {
  // Найти FFmpeg
  const ffmpegPaths = [
    "C:\\Users\\user\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1-full_build\\bin\\ffmpeg.exe",
    path.join(process.env.LOCALAPPDATA || "", "Microsoft/WinGet/Links/ffmpeg.exe"),
    "C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe",
    "C:\\ffmpeg\\bin\\ffmpeg.exe",
    "ffmpeg",
  ];

  let ffmpeg = null;
  for (const p of ffmpegPaths) {
    try {
      execSync(`"${p}" -version`, { stdio: "ignore" });
      ffmpeg = p;
      break;
    } catch {}
  }

  if (!ffmpeg) {
    console.log("⚠️ FFmpeg не найден. Видео не собрано, но аудио и сценарий готовы.");
    return null;
  }

  // Создать concat файл для аудио
  const concatFile = path.join(CONTENT_DIR, "audio", "concat.txt");
  const audioConcat = audioFiles.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n");
  fs.writeFileSync(concatFile, audioConcat);

  // Склеить аудио
  const fullAudio = path.join(CONTENT_DIR, "audio", "full.mp3");
  try {
    execSync(`"${ffmpeg}" -y -f concat -safe 0 -i "${concatFile}" -c copy "${fullAudio}"`, { stdio: "ignore" });
  } catch {
    // Если concat не работает — склеить через фильтр
    const inputs = audioFiles.map(f => `-i "${f}"`).join(" ");
    const filter = audioFiles.map((_, i) => `[${i}:a]`).join("") + `concat=n=${audioFiles.length}:v=0:a=1[out]`;
    execSync(`"${ffmpeg}" -y ${inputs} -filter_complex "${filter}" -map "[out]" "${fullAudio}"`, { stdio: "ignore" });
  }

  // Получить длительность каждого аудио для тайминга слайдов
  const durations = [];
  for (const af of audioFiles) {
    try {
      const probe = execSync(`"${ffmpeg}" -i "${af}" 2>&1`, { encoding: "utf-8" });
      const match = probe.match(/Duration: (\d+):(\d+):(\d+)\.(\d+)/);
      if (match) {
        durations.push(parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 100);
      } else {
        durations.push(4); // default 4 sec
      }
    } catch (e) {
      const probe = e.stderr || e.stdout || "";
      const match = probe.match(/Duration: (\d+):(\d+):(\d+)\.(\d+)/);
      if (match) {
        durations.push(parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 100);
      } else {
        durations.push(4);
      }
    }
  }

  // Собрать видео: для каждого слайда генерируем цветной фон с текстом через lavfi
  // Сначала создадим отдельные видео-фрагменты для каждого слайда, потом склеим
  const segmentFiles = [];
  const colors = ["0xFF6B6B", "0x4ECDC4", "0x45B7D1", "0x96CEB4", "0xFFEAA7", "0xDDA0DD"];

  for (let i = 0; i < slides.length; i++) {
    const dur = durations[i] || 4;
    const color = colors[i % colors.length];
    const segPath = path.join(CONTENT_DIR, "images", `seg_${i}.mp4`);
    const safeText = slides[i].text.replace(/'/g, "").replace(/:/g, " ").replace(/"/g, "");

    try {
      execSync(
        `"${ffmpeg}" -y -f lavfi -i "color=c=${color}:s=1080x1920:d=${dur}" -i "${audioFiles[i]}" -vf "drawtext=text='${safeText}':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:fontfile=C\\\\:/Windows/Fonts/arial.ttf" -c:v libx264 -c:a aac -pix_fmt yuv420p -shortest "${segPath}"`,
        { stdio: "ignore", timeout: 30000 }
      );
      segmentFiles.push(segPath);
    } catch (err) {
      console.log(`⚠️ Ошибка слайда ${i}:`, err.message);
    }
  }

  if (segmentFiles.length === 0) {
    console.log("⚠️ Не удалось создать ни одного слайда");
    return null;
  }

  // Склеить сегменты
  const concatVideo = path.join(CONTENT_DIR, "images", "concat_video.txt");
  fs.writeFileSync(concatVideo, segmentFiles.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n"));

  try {
    execSync(
      `"${ffmpeg}" -y -f concat -safe 0 -i "${concatVideo}" -c copy "${outputPath}"`,
      { stdio: "ignore", timeout: 60000 }
    );
    return outputPath;
  } catch (err) {
    console.log("⚠️ Ошибка склейки:", err.message);
    return null;
  }
}

// ── Полный цикл ──
async function run(topic) {
  const db = new Database(DB_PATH);

  // Добавить агента если нет
  const existing = db.prepare("SELECT id FROM agents WHERE id = ?").get(AGENT_ID);
  if (!existing) {
    db.prepare(`INSERT INTO agents (id, name, emoji, role, description, position_x, position_y, current_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(AGENT_ID, "Блогер", "🎬", "TikTok блогер", "Создаёт видео про 3D-печать", 310, 310, "idle");
  }
  db.close();

  try {
    setStatus("working", "Придумываю сценарий...");

    // 1. Сценарий
    const script = await generateScript(topic);
    console.log(`\n📝 Сценарий: "${script.title}"`);
    console.log(`   Слайдов: ${script.slides.length}`);
    console.log(`   Хэштеги: ${script.hashtags?.join(" ") || ""}\n`);

    const dateStr = new Date().toISOString().split("T")[0];
    const scriptPath = path.join(CONTENT_DIR, "scripts", `script-${dateStr}.json`);
    fs.writeFileSync(scriptPath, JSON.stringify(script, null, 2), "utf-8");

    // 2. Озвучка каждого слайда
    setStatus("working", "Озвучиваю...");
    const audioFiles = [];
    for (let i = 0; i < script.slides.length; i++) {
      const slide = script.slides[i];
      const audioPath = path.join(CONTENT_DIR, "audio", `slide_${i}.mp3`);
      console.log(`   🎙️ Озвучка [${i + 1}/${script.slides.length}]: "${slide.voiceover.substring(0, 50)}..."`);
      await generateAudio(slide.voiceover, audioPath);
      audioFiles.push(audioPath);
    }

    // 3. Сборка видео
    setStatus("working", "Собираю видео...");
    const videoPath = path.join(CONTENT_DIR, "videos", `tiktok-${dateStr}.mp4`);
    const result = await assembleVideo(script.slides, audioFiles, videoPath);

    if (result) {
      console.log(`\n🎬 Видео готово: ${result}`);
      setStatus("idle", `Видео готово: tiktok-${dateStr}.mp4`);
    } else {
      console.log(`\n📝 Сценарий и аудио готовы (видео требует FFmpeg)`);
      setStatus("idle", `Контент готов: ${scriptPath}`);
    }

    // Сохранить в лог
    const logDb = new Database(DB_PATH);
    logDb.prepare(`
      INSERT INTO activity_logs (id, entity_type, entity_id, action, details, created_at)
      VALUES (?, 'agent', ?, 'video_created', ?, datetime('now'))
    `).run(randomUUID(), AGENT_ID, JSON.stringify({ title: script.title, video: result || null, script: scriptPath }));
    logDb.close();

  } catch (err) {
    console.error(`\n❌ Ошибка: ${err.message}`);
    setStatus("idle", `Ошибка: ${err.message}`);
  }
}

// CLI
const [,, command, ...args] = process.argv;
const topic = command === "video" ? args.join(" ") : null;
run(topic);
