import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  const base = path.resolve("C:/Users/user/alex11");
  const reportsDir = path.join(base, "reports");
  const whitelistDir = path.join(base, "reports", "whitelist");
  const videosDir = path.join(base, "content", "videos");
  const scriptsDir = path.join(base, "content", "scripts");

  // Отчёты Стика
  let stikReport = "";
  try {
    const latestPath = path.join(reportsDir, "latest.md");
    if (fs.existsSync(latestPath)) stikReport = fs.readFileSync(latestPath, "utf-8");
  } catch {}

  // Все отчёты Стика (список)
  let stikReports: string[] = [];
  try {
    if (fs.existsSync(reportsDir)) {
      stikReports = fs.readdirSync(reportsDir)
        .filter(f => f.startsWith("report-") && f.endsWith(".md"))
        .sort().reverse().slice(0, 10);
    }
  } catch {}

  // Белый список Советника
  let advisorReport = "";
  try {
    const latestPath = path.join(whitelistDir, "latest.md");
    if (fs.existsSync(latestPath)) advisorReport = fs.readFileSync(latestPath, "utf-8");
  } catch {}

  // Видео блогера
  let videos: { name: string; date: string; script: any }[] = [];
  try {
    if (fs.existsSync(videosDir)) {
      const videoFiles = fs.readdirSync(videosDir)
        .filter(f => f.endsWith(".mp4")).sort().reverse().slice(0, 10);
      for (const vf of videoFiles) {
        const dateMatch = vf.match(/(\d{4}-\d{2}-\d{2})/);
        const date = dateMatch ? dateMatch[1] : "";
        let script = null;
        try {
          const scriptPath = path.join(scriptsDir, `script-${date}.json`);
          if (fs.existsSync(scriptPath)) {
            script = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
          }
        } catch {}
        videos.push({ name: vf, date, script });
      }
    }
  } catch {}

  // Логи Надзирателя
  let overseerLogs: { action: string; details: any; createdAt: string }[] = [];
  try {
    const Database = require("better-sqlite3");
    const db = new Database(path.join(base, "data", "database.sqlite"));
    const rows = db.prepare(`
      SELECT action, details, created_at as createdAt FROM activity_logs
      WHERE entity_id = 'stoyanov'
      ORDER BY created_at DESC LIMIT 20
    `).all();
    overseerLogs = rows.map((r: any) => ({
      action: r.action,
      details: r.details ? JSON.parse(r.details) : {},
      createdAt: r.createdAt,
    }));
    db.close();
  } catch {}

  return NextResponse.json({
    stik: { latest: stikReport, reports: stikReports },
    advisor: { latest: advisorReport },
    blogger: { videos },
    overseer: { logs: overseerLogs },
  });
}
