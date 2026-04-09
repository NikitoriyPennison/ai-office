#!/usr/bin/env node
/**
 * Дейви — секретарь-переводчик
 * Звонит на эстонском, русском и английском через Twilio
 *
 * Использование:
 *   node scripts/secretary.js call +37255123456 "Здравствуйте, это Дейви" ru
 *   node scripts/secretary.js call +37255123456 "Hello, this is Davy" en
 *   node scripts/secretary.js call +37255123456 "Tere, see on Davy" et
 *   node scripts/secretary.js say "текст" ru          — просто озвучить (тест)
 *   node scripts/secretary.js status                   — проверить Twilio
 */

const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");

// Загрузить .env
const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
}

const twilio = require("twilio");
const Database = require("better-sqlite3");

const DB_PATH = path.join(__dirname, "../data/database.sqlite");
const AGENT_ID = "pushkin";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_NUMBER = process.env.TWILIO_PHONE_NUMBER;

if (!ACCOUNT_SID || !AUTH_TOKEN || !TWILIO_NUMBER) {
  console.error("❌ Twilio credentials not found in .env");
  process.exit(1);
}

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

// Языковые коды для Twilio TTS
// Google TTS поддерживает эстонский через language tag
const VOICES = {
  ru: { language: "ru-RU", voice: "Polly.Tatyana" },
  en: { language: "en-US", voice: "Polly.Joanna" },
  et: { language: "en-US", voice: null }, // Эстонского нет в Polly/Google — fallback на английский произношение
};

// Fallback голоса если Polly недоступен
const VOICE_FALLBACK = {
  ru: "alice",
  en: "alice",
  et: "alice",
};

function setStatus(status, statusText) {
  try {
    const db = new Database(DB_PATH);
    db.prepare("UPDATE agents SET current_status = ? WHERE id = ?").run(status, AGENT_ID);
    db.prepare(`
      INSERT INTO activity_logs (id, entity_type, entity_id, action, details, created_at)
      VALUES (?, 'agent', ?, ?, ?, datetime('now'))
    `).run(randomUUID(), AGENT_ID, "status_change", JSON.stringify({ status, statusText }));
    db.close();
  } catch (err) {
    console.error("DB error:", err.message);
  }
  console.log(`[${new Date().toLocaleTimeString()}] ${status}: ${statusText}`);
}

function logCall(toNumber, text, lang, callSid, status) {
  try {
    const db = new Database(DB_PATH);
    db.prepare(`
      INSERT INTO activity_logs (id, entity_type, entity_id, action, details, created_at)
      VALUES (?, 'agent', ?, 'call', ?, datetime('now'))
    `).run(randomUUID(), AGENT_ID, JSON.stringify({ to: toNumber, text, lang, callSid, status }));
    db.close();
  } catch (err) {
    console.error("DB error:", err.message);
  }
}

// ── Позвонить ──
async function makeCall(toNumber, text, lang = "ru") {
  const voiceConfig = VOICES[lang] || VOICES.ru;

  setStatus("working", `Звоню на ${toNumber} (${lang})...`);

  try {
    // TwiML — инструкция что сказать при звонке
    const voiceAttr = voiceConfig.voice ? `voice="${voiceConfig.voice}"` : "";
    const twiml = `<Response><Say ${voiceAttr} language="${voiceConfig.language}">${escapeXml(text)}</Say><Pause length="1"/><Say ${voiceAttr} language="${voiceConfig.language}">${escapeXml(text)}</Say></Response>`;

    const call = await client.calls.create({
      twiml: twiml,
      to: toNumber,
      from: TWILIO_NUMBER,
    });

    console.log(`✅ Звонок инициирован!`);
    console.log(`   SID: ${call.sid}`);
    console.log(`   Куда: ${toNumber}`);
    console.log(`   Язык: ${lang}`);
    console.log(`   Текст: "${text}"`);

    logCall(toNumber, text, lang, call.sid, "initiated");
    setStatus("working", `Звонок ${call.sid} — ${toNumber}`);

    // Ждём завершения звонка (проверяем каждые 3 сек)
    let attempts = 0;
    while (attempts < 40) { // макс 2 минуты
      await new Promise(r => setTimeout(r, 3000));
      const updated = await client.calls(call.sid).fetch();
      console.log(`   Статус: ${updated.status}`);

      if (["completed", "failed", "busy", "no-answer", "canceled"].includes(updated.status)) {
        logCall(toNumber, text, lang, call.sid, updated.status);

        if (updated.status === "completed") {
          setStatus("idle", `Звонок завершён: ${toNumber}`);
          console.log(`\n✅ Звонок завершён успешно!`);
        } else {
          setStatus("idle", `Звонок ${updated.status}: ${toNumber}`);
          console.log(`\n⚠️ Звонок: ${updated.status}`);
        }
        return;
      }
      attempts++;
    }

    setStatus("idle", "Звонок — таймаут");
  } catch (err) {
    console.error(`\n❌ Ошибка: ${err.message}`);
    setStatus("idle", `Ошибка: ${err.message}`);
    logCall(toNumber, text, lang, "", `error: ${err.message}`);
  }
}

// ── Проверить статус Twilio ──
async function checkStatus() {
  try {
    const account = await client.api.accounts(ACCOUNT_SID).fetch();
    console.log("✅ Twilio подключён!");
    console.log(`   Аккаунт: ${account.friendlyName}`);
    console.log(`   Статус: ${account.status}`);
    console.log(`   Номер: ${TWILIO_NUMBER}`);

    // Проверить баланс
    const balance = await client.api.accounts(ACCOUNT_SID).balance.fetch();
    console.log(`   Баланс: ${balance.balance} ${balance.currency}`);
  } catch (err) {
    console.error(`❌ Ошибка: ${err.message}`);
  }
}

function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── CLI ──
const [,, command, ...args] = process.argv;

switch (command) {
  case "call": {
    const [number, text, lang] = args;
    if (!number || !text) {
      console.log("Использование: node secretary.js call +37255123456 \"Текст\" ru|en|et");
      process.exit(1);
    }
    makeCall(number, text, lang || "ru");
    break;
  }

  case "status":
    checkStatus();
    break;

  default:
    console.log(`
📞 Дейви — секретарь-переводчик

Команды:
  node secretary.js status                              — проверить Twilio
  node secretary.js call +NUMBER "текст" ru             — позвонить (русский)
  node secretary.js call +NUMBER "text" en              — позвонить (английский)
  node secretary.js call +NUMBER "tekst" et             — позвонить (эстонский)

Языки: ru (русский), en (английский), et (эстонский)
    `);
}
