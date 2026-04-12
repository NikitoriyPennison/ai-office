/**
 * LLM модуль — использует Groq (бесплатно, облако) с fallback на Ollama (локально).
 */
const https = require("https");
const http = require("http");
const path = require("path");
const fs = require("fs");

// Загрузить .env
const envPath = path.join(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
}

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
if (GROQ_API_KEY) console.log("✅ Groq API key found (" + GROQ_API_KEY.substring(0, 8) + "...)");
else console.log("⚠️ No GROQ_API_KEY in env");
const GROQ_MODEL = "llama-3.1-8b-instant";
const OLLAMA_URL = "http://localhost:11434";

// ── Groq API ──
function groqGenerate(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 1024,
    });
    const req = https.request({
      hostname: "api.groq.com",
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.choices?.[0]?.message?.content) {
            resolve(json.choices[0].message.content);
          } else {
            reject(new Error(json.error?.message || "Groq: пустой ответ"));
          }
        } catch { reject(new Error("Groq: ошибка разбора")); }
      });
    });
    req.on("error", reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error("Groq timeout")); });
    req.write(body);
    req.end();
  });
}

// ── Ollama API (fallback) ──
function ollamaGenerate(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: "llama3.2:3b", prompt, stream: false });
    const req = http.request(
      `${OLLAMA_URL}/api/generate`,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try { resolve(JSON.parse(data).response || ""); }
          catch { reject(new Error("Ollama: ошибка разбора")); }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(120000, () => { req.destroy(); reject(new Error("Ollama timeout")); });
    req.write(body);
    req.end();
  });
}

// ── Retry with delay ──
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Главная функция — Groq с retry, потом Ollama fallback ──
async function generate(prompt) {
  if (GROQ_API_KEY) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await groqGenerate(prompt);
        return { text: result, provider: "groq" };
      } catch (err) {
        if (err.message.includes("Rate limit") && attempt < 2) {
          const waitMatch = err.message.match(/try again in ([\d.]+)s/);
          const wait = waitMatch ? parseFloat(waitMatch[1]) * 1000 + 500 : 10000;
          console.log(`⏳ Rate limit, жду ${(wait/1000).toFixed(1)}с...`);
          await sleep(wait);
          continue;
        }
        console.log(`⚠️ Groq error: ${err.message}, trying Ollama...`);
        break;
      }
    }
  }

  try {
    const result = await ollamaGenerate(prompt);
    return { text: result, provider: "ollama" };
  } catch (err) {
    throw new Error(`LLM недоступен: Groq и Ollama не отвечают (${err.message})`);
  }
}

module.exports = { generate, groqGenerate, ollamaGenerate };
