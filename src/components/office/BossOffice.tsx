"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import { createAgentSprite, createAgentLabel } from "./drawAgent";
import ReactMarkdown from "react-markdown";

interface BossOfficeProps {
  className?: string;
}

interface DashboardData {
  stik: { latest: string; reports: string[] };
  advisor: { latest: string };
  blogger: { videos: { name: string; date: string; script: any }[] };
  overseer: { logs: { action: string; details: any; createdAt: string }[] };
}

const CANVAS_W = 960;
const CANVAS_H = 600;

const ACCENT = 0xecb00a;
const WOOD_DARK = 0x3a2a1a;
const WOOD_MID = 0x4a3a28;

function drawBossRoom(): Container {
  const room = new Container();

  // ── FLOOR: herringbone parquet ──
  const floor = new Graphics();
  for (let row = 0; row < 25; row++) {
    for (let col = 0; col < 40; col++) {
      const x = col * 24;
      const y = row * 24;
      const variant = ((row + col) % 3);
      const colors = [0x2a2018, 0x251c14, 0x2e2419];
      floor.rect(x, y, 24, 24);
      floor.fill(colors[variant]);
      if (variant === 0) {
        floor.rect(x + 11, y, 1, 24);
        floor.fill({ color: 0x1a1610, alpha: 0.3 });
      } else {
        floor.rect(x, y + 11, 24, 1);
        floor.fill({ color: 0x1a1610, alpha: 0.3 });
      }
    }
  }
  room.addChild(floor);

  // ── WALLS: dark paneled with molding ──
  const walls = new Graphics();
  walls.rect(0, 0, CANVAS_W, 130);
  walls.fill(0x18131e);
  for (let p = 0; p < 8; p++) {
    const px = 15 + p * 118;
    walls.roundRect(px, 10, 110, 80, 2);
    walls.stroke({ color: 0x2a2030, width: 1.5 });
    walls.roundRect(px + 5, 15, 100, 70, 1);
    walls.fill({ color: 0x1e1825, alpha: 0.5 });
  }
  walls.rect(0, 95, CANVAS_W, 35);
  walls.fill(0x201a28);
  walls.rect(0, 93, CANVAS_W, 2);
  walls.fill({ color: ACCENT, alpha: 0.35 });
  walls.rect(0, 128, CANVAS_W, 2);
  walls.fill({ color: ACCENT, alpha: 0.25 });
  walls.rect(0, 105, CANVAS_W, 1);
  walls.fill({ color: 0x2a2030, alpha: 0.5 });
  walls.rect(0, 130, 8, CANVAS_H);
  walls.fill(0x14101a);
  walls.rect(8, 130, 2, CANVAS_H);
  walls.fill({ color: ACCENT, alpha: 0.1 });
  walls.rect(CANVAS_W - 8, 130, 8, CANVAS_H);
  walls.fill(0x14101a);
  walls.rect(CANVAS_W - 10, 130, 2, CANVAS_H);
  walls.fill({ color: ACCENT, alpha: 0.1 });
  room.addChild(walls);

  // ── WINDOWS ──
  for (const wx of [500, 720]) {
    const win = new Graphics();
    win.roundRect(wx, 8, 160, 88, 4);
    win.fill(0x08121f);
    win.rect(wx + 5, 13, 150, 78);
    win.fill(0x0d1a2d);
    win.rect(wx + 5, 13, 150, 30);
    win.fill({ color: 0x0a1628, alpha: 0.8 });
    for (let s = 0; s < 8; s++) {
      win.circle(wx + 15 + Math.random() * 130, 20 + Math.random() * 20, 0.8);
      win.fill({ color: 0xffffff, alpha: 0.3 + Math.random() * 0.4 });
    }
    if (wx === 720) {
      win.circle(wx + 130, 28, 10);
      win.fill({ color: 0xffeaa7, alpha: 0.25 });
      win.circle(wx + 132, 27, 8);
      win.fill({ color: 0x0d1a2d });
    }
    const blds = [
      { dx: 8, w: 22, h: 35 }, { dx: 33, w: 15, h: 50 },
      { dx: 52, w: 30, h: 30 }, { dx: 85, w: 18, h: 45 },
      { dx: 106, w: 25, h: 38 }, { dx: 134, w: 12, h: 52 },
    ];
    for (const b of blds) {
      win.rect(wx + b.dx, 91 - b.h, b.w, b.h);
      win.fill({ color: 0x1a2a3a, alpha: 0.85 });
      for (let wy = 4; wy < b.h - 5; wy += 7) {
        for (let bwx = 3; bwx < b.w - 3; bwx += 6) {
          if (Math.random() > 0.35) {
            win.rect(wx + b.dx + bwx, 91 - b.h + wy, 3, 3);
            win.fill({ color: 0xffeaa7, alpha: 0.2 + Math.random() * 0.5 });
          }
        }
      }
    }
    win.rect(wx + 5 + 73, 13, 3, 78);
    win.fill({ color: WOOD_MID, alpha: 0.7 });
    win.rect(wx + 5, 13 + 38, 150, 3);
    win.fill({ color: WOOD_MID, alpha: 0.5 });
    win.rect(wx - 5, 5, 18, 95);
    win.fill({ color: 0x6b1515, alpha: 0.6 });
    win.rect(wx + 5 + 150 - 8, 5, 18, 95);
    win.fill({ color: 0x6b1515, alpha: 0.6 });
    for (let f = 0; f < 4; f++) {
      win.rect(wx - 3 + f * 4, 5, 1, 95);
      win.fill({ color: 0x8b2020, alpha: 0.2 });
      win.rect(wx + 5 + 150 - 6 + f * 4, 5, 1, 95);
      win.fill({ color: 0x8b2020, alpha: 0.2 });
    }
    win.rect(wx - 10, 3, 185, 3);
    win.fill(ACCENT);
    win.circle(wx - 10, 4, 4);
    win.fill(ACCENT);
    win.circle(wx + 175, 4, 4);
    win.fill(ACCENT);
    room.addChild(win);
  }

  // ── WALL ART ──
  const painting1 = new Graphics();
  painting1.roundRect(290, 15, 140, 80, 3);
  painting1.fill(ACCENT);
  painting1.roundRect(295, 20, 130, 70, 2);
  painting1.fill(0x0d1a2d);
  painting1.rect(295, 60, 130, 30);
  painting1.fill({ color: 0x27ae60, alpha: 0.3 });
  painting1.circle(350, 45, 12);
  painting1.fill({ color: 0xf39c12, alpha: 0.3 });
  painting1.moveTo(310, 60); painting1.lineTo(340, 35); painting1.lineTo(370, 60);
  painting1.fill({ color: 0x2c3e50, alpha: 0.4 });
  painting1.moveTo(360, 60); painting1.lineTo(400, 30); painting1.lineTo(425, 60);
  painting1.fill({ color: 0x34495e, alpha: 0.3 });
  room.addChild(painting1);

  const cert = new Graphics();
  cert.roundRect(250, 108, 50, 22, 1);
  cert.fill(WOOD_DARK);
  cert.roundRect(252, 110, 46, 18, 1);
  cert.fill(0xfaebd7);
  room.addChild(cert);

  // ── CLOCK ──
  const clock = new Graphics();
  clock.circle(460, 50, 20);
  clock.fill(0x1a1a1a);
  clock.circle(460, 50, 18);
  clock.fill(0x0f0f0f);
  clock.circle(460, 50, 18);
  clock.stroke({ color: ACCENT, width: 1.5 });
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2 - Math.PI / 2;
    clock.circle(460 + Math.cos(a) * 14, 50 + Math.sin(a) * 14, 1);
    clock.fill(ACCENT);
  }
  clock.moveTo(460, 50); clock.lineTo(460, 38);
  clock.stroke({ color: ACCENT, width: 1.5 });
  clock.moveTo(460, 50); clock.lineTo(470, 48);
  clock.stroke({ color: 0xffffff, width: 1 });
  clock.circle(460, 50, 2);
  clock.fill(ACCENT);
  room.addChild(clock);

  // ── BOSS DESK (L-shaped, center) ──
  const desk = new Graphics();
  // Main surface
  desk.roundRect(300, 280, 360, 90, 5);
  desk.fill(WOOD_DARK);
  desk.roundRect(303, 283, 354, 84, 4);
  desk.fill(WOOD_MID);
  // Leather inlay
  desk.roundRect(320, 290, 320, 65, 3);
  desk.fill({ color: 0x1a3020, alpha: 0.4 });
  desk.roundRect(322, 292, 316, 61, 2);
  desk.stroke({ color: ACCENT, width: 0.5, alpha: 0.3 });
  // Front panel with drawers
  desk.roundRect(310, 365, 340, 50, 4);
  desk.fill(0x2a1a10);
  desk.roundRect(315, 370, 330, 40, 3);
  desk.fill(0x321e12);
  for (let d = 0; d < 3; d++) {
    const dx = 325 + d * 108;
    desk.roundRect(dx, 375, 95, 30, 2);
    desk.stroke({ color: 0x4a3520, width: 1 });
    desk.roundRect(dx + 35, 388, 25, 4, 2);
    desk.fill(ACCENT);
  }
  // Side extension (L-shape)
  desk.roundRect(640, 300, 80, 120, 4);
  desk.fill(WOOD_DARK);
  desk.roundRect(643, 303, 74, 114, 3);
  desk.fill(WOOD_MID);
  room.addChild(desk);

  // ── MONITORS + PERIPHERALS ──
  const pc = new Graphics();
  // Left monitor
  pc.roundRect(360, 245, 75, 48, 3);
  pc.fill(0x0a0a14);
  pc.rect(365, 250, 65, 38);
  pc.fill(0x0f1a2a);
  for (let ln = 0; ln < 5; ln++) {
    const lw = 15 + Math.random() * 35;
    pc.rect(370, 255 + ln * 7, lw, 3);
    pc.fill({ color: 0x55efc4, alpha: 0.4 + Math.random() * 0.3 });
  }
  pc.rect(392, 293, 6, 8);
  pc.fill(0x222222);
  // Center monitor (main)
  pc.roundRect(445, 240, 90, 55, 3);
  pc.fill(0x0a0a14);
  pc.rect(450, 245, 80, 45);
  pc.fill(0x111828);
  pc.rect(455, 250, 30, 15);
  pc.fill({ color: 0x2980b9, alpha: 0.5 });
  pc.rect(490, 250, 35, 15);
  pc.fill({ color: 0x27ae60, alpha: 0.4 });
  pc.rect(455, 270, 70, 12);
  pc.fill({ color: 0xecb00a, alpha: 0.3 });
  pc.rect(485, 293, 10, 8);
  pc.fill(0x222222);
  // Right monitor
  pc.roundRect(545, 245, 75, 48, 3);
  pc.fill(0x0a0a14);
  pc.rect(550, 250, 65, 38);
  pc.fill(0x0f1a2a);
  for (let ln = 0; ln < 4; ln++) {
    pc.roundRect(555, 255 + ln * 8, 20 + Math.random() * 30, 5, 2);
    pc.fill({ color: ln % 2 === 0 ? 0x74b9ff : 0xffeaa7, alpha: 0.4 });
  }
  pc.rect(578, 293, 6, 8);
  pc.fill(0x222222);
  // Keyboard
  pc.roundRect(400, 310, 160, 25, 3);
  pc.fill(0x1a1a1a);
  for (let kr = 0; kr < 3; kr++) {
    for (let kc = 0; kc < 14; kc++) {
      pc.roundRect(405 + kc * 11, 313 + kr * 7, 9, 5, 1);
      pc.fill(0x2a2a2a);
    }
  }
  // Mouse + pad
  pc.roundRect(568, 308, 32, 38, 3);
  pc.fill({ color: 0x111118, alpha: 0.5 });
  pc.roundRect(575, 315, 18, 25, 6);
  pc.fill(0x1a1a1a);
  pc.rect(582, 318, 4, 8);
  pc.fill(0x333333);
  room.addChild(pc);

  // ── SECOND DESK (left side, near left window) ──
  const desk2 = new Graphics();
  // Desk surface
  desk2.roundRect(50, 160, 160, 70, 4);
  desk2.fill(WOOD_DARK);
  desk2.roundRect(53, 163, 154, 64, 3);
  desk2.fill(WOOD_MID);
  // Front panel
  desk2.roundRect(55, 225, 150, 35, 3);
  desk2.fill(0x2a1a10);
  // Drawer
  desk2.roundRect(95, 232, 70, 22, 2);
  desk2.stroke({ color: 0x4a3520, width: 1 });
  desk2.roundRect(120, 241, 20, 4, 1);
  desk2.fill(ACCENT);
  // Monitor
  desk2.roundRect(100, 128, 65, 42, 3);
  desk2.fill(0x0a0a14);
  desk2.rect(105, 133, 55, 32);
  desk2.fill(0x0f1a2a);
  // Code on screen
  for (let ln = 0; ln < 4; ln++) {
    const lw = 12 + Math.random() * 28;
    desk2.rect(110, 138 + ln * 7, lw, 3);
    desk2.fill({ color: 0x55efc4, alpha: 0.3 + Math.random() * 0.3 });
  }
  desk2.rect(128, 170, 8, 6);
  desk2.fill(0x222222);
  // Keyboard
  desk2.roundRect(90, 180, 80, 16, 2);
  desk2.fill(0x1a1a1a);
  // Notepad
  desk2.rect(60, 175, 25, 35);
  desk2.fill(0xffffff);
  desk2.rect(62, 178, 21, 2);
  desk2.fill({ color: 0xe74c3c, alpha: 0.3 });
  desk2.rect(62, 183, 18, 2);
  desk2.fill({ color: 0xe74c3c, alpha: 0.3 });
  // Pen
  desk2.rect(58, 172, 2, 18);
  desk2.fill(0xe74c3c);
  // Coffee
  desk2.roundRect(190, 175, 14, 12, 2);
  desk2.fill(0xffeaa7);
  desk2.roundRect(192, 177, 10, 8, 1);
  desk2.fill(0x6f4e37);
  // Chair
  desk2.roundRect(100, 265, 50, 30, 4);
  desk2.fill(0x2d1f1f);
  desk2.roundRect(103, 268, 44, 24, 3);
  desk2.fill(0x3d2828);
  desk2.roundRect(105, 258, 40, 10, 3);
  desk2.fill(0x2d1f1f);
  // Nameplate
  desk2.roundRect(105, 215, 50, 10, 1);
  desk2.fill(ACCENT);
  desk2.roundRect(107, 217, 46, 6, 1);
  desk2.fill(0x1a1a1a);
  room.addChild(desk2);

  // ── OVERSEER AGENT SPRITE (left desk) ──
  // (rendered in useEffect below, not here — just a marker)

  // ── ADVISOR DESK (near right window) ──
  const advDesk = new Graphics();
  // Desk surface
  advDesk.roundRect(750, 160, 160, 70, 4);
  advDesk.fill(WOOD_DARK);
  advDesk.roundRect(753, 163, 154, 64, 3);
  advDesk.fill(WOOD_MID);
  // Front panel
  advDesk.roundRect(755, 225, 150, 35, 3);
  advDesk.fill(0x2a1a10);
  // Drawer
  advDesk.roundRect(795, 232, 70, 22, 2);
  advDesk.stroke({ color: 0x4a3520, width: 1 });
  advDesk.roundRect(820, 241, 20, 4, 1);
  advDesk.fill(ACCENT);
  // Monitor
  advDesk.roundRect(800, 128, 65, 42, 3);
  advDesk.fill(0x0a0a14);
  advDesk.rect(805, 133, 55, 32);
  advDesk.fill(0x0f1a2a);
  // Charts on screen
  advDesk.rect(810, 140, 20, 10);
  advDesk.fill({ color: 0xecb00a, alpha: 0.4 });
  advDesk.rect(835, 138, 20, 12);
  advDesk.fill({ color: 0x27ae60, alpha: 0.4 });
  advDesk.rect(810, 153, 45, 6);
  advDesk.fill({ color: 0x74b9ff, alpha: 0.3 });
  advDesk.rect(828, 170, 8, 6);
  advDesk.fill(0x222222);
  // Keyboard (small)
  advDesk.roundRect(790, 180, 80, 16, 2);
  advDesk.fill(0x1a1a1a);
  // Notepad
  advDesk.rect(760, 175, 25, 35);
  advDesk.fill(0xffffff);
  advDesk.rect(762, 178, 21, 2);
  advDesk.fill({ color: 0x74b9ff, alpha: 0.3 });
  advDesk.rect(762, 183, 18, 2);
  advDesk.fill({ color: 0x74b9ff, alpha: 0.3 });
  advDesk.rect(762, 188, 15, 2);
  advDesk.fill({ color: 0x74b9ff, alpha: 0.3 });
  // Pen
  advDesk.rect(758, 172, 2, 18);
  advDesk.fill(0x2980b9);
  // Coffee
  advDesk.roundRect(890, 175, 14, 12, 2);
  advDesk.fill(0xffeaa7);
  advDesk.roundRect(892, 177, 10, 8, 1);
  advDesk.fill(0x6f4e37);
  // Chair
  advDesk.roundRect(800, 265, 50, 30, 4);
  advDesk.fill(0x2d1f1f);
  advDesk.roundRect(803, 268, 44, 24, 3);
  advDesk.fill(0x3d2828);
  advDesk.roundRect(805, 258, 40, 10, 3);
  advDesk.fill(0x2d1f1f);
  // Nameplate
  advDesk.roundRect(805, 215, 50, 10, 1);
  advDesk.fill(ACCENT);
  advDesk.roundRect(807, 217, 46, 6, 1);
  advDesk.fill(0x1a1a1a);
  room.addChild(advDesk);

  // ── WALL SCONCES ──
  const lights = new Graphics();
  for (const sx of [250, 710]) {
    lights.circle(sx, 110, 25);
    lights.fill({ color: 0xffd700, alpha: 0.04 });
    lights.roundRect(sx - 5, 100, 10, 15, 3);
    lights.fill(ACCENT);
    lights.circle(sx, 100, 5);
    lights.fill({ color: 0xffd700, alpha: 0.3 });
  }
  lights.circle(480, 130, 90);
  lights.fill({ color: 0xffd700, alpha: 0.02 });
  lights.circle(480, 130, 50);
  lights.fill({ color: 0xffd700, alpha: 0.03 });
  room.addChild(lights);

  return room;
}

export function BossOffice({ className }: BossOfficeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<"stik" | "advisor" | "blogger" | "overseer">("stik");
  const [dashData, setDashData] = useState<DashboardData | null>(null);

  const openPanel = useCallback(() => {
    setPanelOpen(true);
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(setDashData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const app = new Application();
    appRef.current = app;

    (async () => {
      await app.init({
        width: CANVAS_W,
        height: CANVAS_H,
        backgroundColor: 0x0a0a12,
        antialias: false,
        resolution: 1,
        autoDensity: true,
      });

      app.canvas.style.width = "100%";
      app.canvas.style.height = "100%";
      app.canvas.style.objectFit = "contain";
      app.canvas.style.imageRendering = "pixelated";

      el.appendChild(app.canvas);

      const room = drawBossRoom();
      app.stage.addChild(room);

      // ── CLICKABLE MONITORS (open dashboard panel) ──
      const monitorZone = new Container();
      monitorZone.eventMode = "static";
      monitorZone.cursor = "pointer";
      const monitorHit = new Graphics();
      monitorHit.rect(355, 235, 270, 70);
      monitorHit.fill({ color: 0xffffff, alpha: 0.001 });
      monitorZone.addChild(monitorHit);
      // Hover glow
      const monitorGlow = new Graphics();
      monitorGlow.visible = false;
      monitorZone.addChild(monitorGlow);
      monitorZone.on("pointerover", () => {
        monitorGlow.clear();
        monitorGlow.rect(355, 235, 270, 70);
        monitorGlow.fill({ color: 0xecb00a, alpha: 0.15 });
        monitorGlow.visible = true;
      });
      monitorZone.on("pointerout", () => { monitorGlow.visible = false; });
      monitorZone.on("pointertap", () => { openPanel(); });
      app.stage.addChild(monitorZone);

      // "Нажми" hint text
      const hintText = new Text({
        text: "💻 Нажми",
        style: new TextStyle({ fontFamily: '"Courier New", monospace', fontSize: 10, fill: 0xecb00a }),
      });
      hintText.x = 460; hintText.y = 310;
      hintText.alpha = 0.4;
      app.stage.addChild(hintText);

      // ── OVERSEER AGENT (left desk) ──
      const overseerContainer = new Container();
      overseerContainer.scale.set(1.8);
      overseerContainer.x = 125;
      overseerContainer.y = 280;
      const overseerSprite = createAgentSprite("stoyanov");
      overseerSprite.y = -10;
      overseerContainer.addChild(overseerSprite);
      const overseerLabel = createAgentLabel("Надзиратель");
      overseerLabel.y = -50;
      overseerLabel.scale.set(0.5);
      overseerContainer.addChild(overseerLabel);
      const overseerDot = new Graphics();
      overseerContainer.addChild(overseerDot);
      app.stage.addChild(overseerContainer);

      // ── ADVISOR AGENT (right desk) ──
      const advisorContainer = new Container();
      advisorContainer.scale.set(1.8);
      advisorContainer.x = 825;
      advisorContainer.y = 280;

      const advisorSprite = createAgentSprite("vanya");
      advisorSprite.y = -10;
      advisorContainer.addChild(advisorSprite);

      const advisorLabel = createAgentLabel("Советник");
      advisorLabel.y = -50;
      advisorLabel.scale.set(0.5);
      advisorContainer.addChild(advisorLabel);

      app.stage.addChild(advisorContainer);

      // Poll agent status from API
      let agentStatus = "idle";
      let overseerStatus = "idle";
      async function pollStatus() {
        try {
          const res = await fetch("/api/agents");
          if (res.ok) {
            const data = await res.json();
            const advisor = data.agents?.find((a: any) => a.id === "vanya");
            if (advisor) agentStatus = advisor.currentStatus || "idle";
            const overseer = data.agents?.find((a: any) => a.id === "stoyanov");
            if (overseer) overseerStatus = overseer.currentStatus || "idle";
          }
        } catch {}
      }
      pollStatus();
      const statusInterval = setInterval(pollStatus, 5000);

      // Status indicator dot
      const statusDot = new Graphics();
      advisorContainer.addChild(statusDot);

      let time = 0;
      let lookTimer = 0;
      let lookDir = 0;
      let rafId: number;
      let lastTime = performance.now();

      function animate(now: number) {
        const dt = (now - lastTime) / 1000;
        lastTime = now;
        time += dt;

        // Update status dot color
        statusDot.clear();
        const dotColor = agentStatus === "working" ? 0x00b894 :
                         agentStatus === "thinking" ? 0xfdcb6e :
                         agentStatus === "busy" ? 0xe17055 :
                         agentStatus === "offline" ? 0x555555 : 0x636e72;
        statusDot.circle(0, -42, 3);
        statusDot.fill(dotColor);
        // Pulse when active
        if (agentStatus === "working" || agentStatus === "thinking" || agentStatus === "busy") {
          statusDot.circle(0, -42, 5);
          statusDot.fill({ color: dotColor, alpha: 0.3 + Math.sin(time * 4) * 0.2 });
        }

        // ── WORKING / BUSY: typing animation ──
        if (agentStatus === "working" || agentStatus === "busy") {
          advisorSprite.y = -10 + Math.sin(time * 3) * 1.5;
          lookTimer += dt;
          if (lookTimer > 1.5) {
            lookTimer = 0;
            lookDir = lookDir === 0 ? -1 : lookDir === -1 ? 1 : 0;
          }
          advisorSprite.x = lookDir * 2;
        }

        // ── THINKING: slow sway ──
        else if (agentStatus === "thinking") {
          advisorSprite.y = -10 + Math.sin(time * 1.2) * 1;
          advisorSprite.x = Math.sin(time * 0.5) * 1.5;
        }

        // ── OFFLINE: slumped ──
        else if (agentStatus === "offline") {
          advisorSprite.y = -8;
          advisorSprite.rotation = 0.05;
          advisorSprite.x = 0;
        }

        // ── IDLE: gentle breathing ──
        else {
          advisorSprite.y = -10 + Math.sin(time * 1.2) * 0.6;
          advisorSprite.rotation = 0;
          lookTimer += dt;
          if (lookTimer > 4 + Math.random() * 3) {
            lookTimer = 0;
            lookDir = lookDir === 0 ? (Math.random() > 0.5 ? 1 : -1) : 0;
          }
          advisorSprite.x = lookDir * 1;
        }

        // ── OVERSEER animations ──
        const osDotColor = overseerStatus === "working" ? 0x00b894 :
                           overseerStatus === "thinking" ? 0xfdcb6e :
                           overseerStatus === "busy" ? 0xe17055 : 0x636e72;
        overseerDot.clear();
        overseerDot.circle(0, -42, 3);
        overseerDot.fill(osDotColor);
        if (overseerStatus === "working" || overseerStatus === "thinking" || overseerStatus === "busy") {
          overseerDot.circle(0, -42, 5);
          overseerDot.fill({ color: osDotColor, alpha: 0.3 + Math.sin(time * 4) * 0.2 });
          overseerSprite.y = -10 + Math.sin(time * 3) * 1.5;
        } else {
          overseerSprite.y = -10 + Math.sin(time * 1.2) * 0.6;
        }

        rafId = requestAnimationFrame(animate);
      }
      rafId = requestAnimationFrame(animate);

      // Cleanup stored for unmount
      (appRef.current as any).__cleanup = () => {
        clearInterval(statusInterval);
        cancelAnimationFrame(rafId);
      };
    })();

    return () => {
      try {
        (appRef.current as any)?.__cleanup?.();
        app.destroy(true);
      } catch (_) {}
      appRef.current = null;
    };
  }, []);

  return (
    <div className={`relative ${className || ""}`}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Dashboard Panel */}
      {panelOpen && (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-auto">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setPanelOpen(false)} />

          {/* Panel */}
          <div className="relative bg-[#0f0f18] border border-[#2a2a3a] rounded-lg w-[85%] h-[80%] flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#2a2a3a] bg-[#13131f]">
              <div className="flex gap-1">
                <button
                  onClick={() => setPanelTab("stik")}
                  className={`text-xs px-3 py-1.5 rounded transition-colors ${panelTab === "stik" ? "bg-[#ecb00a]/20 text-[#ecb00a] border border-[#ecb00a]/30" : "text-[#6b7280] hover:text-white"}`}
                >
                  📊 Отчёты Стика
                </button>
                <button
                  onClick={() => setPanelTab("advisor")}
                  className={`text-xs px-3 py-1.5 rounded transition-colors ${panelTab === "advisor" ? "bg-[#ecb00a]/20 text-[#ecb00a] border border-[#ecb00a]/30" : "text-[#6b7280] hover:text-white"}`}
                >
                  🧠 Советник
                </button>
                <button
                  onClick={() => setPanelTab("blogger")}
                  className={`text-xs px-3 py-1.5 rounded transition-colors ${panelTab === "blogger" ? "bg-[#ecb00a]/20 text-[#ecb00a] border border-[#ecb00a]/30" : "text-[#6b7280] hover:text-white"}`}
                >
                  🎬 Блогер
                </button>
                <button
                  onClick={() => setPanelTab("overseer")}
                  className={`text-xs px-3 py-1.5 rounded transition-colors ${panelTab === "overseer" ? "bg-[#ecb00a]/20 text-[#ecb00a] border border-[#ecb00a]/30" : "text-[#6b7280] hover:text-white"}`}
                >
                  👁️ Надзиратель
                </button>
              </div>
              <button onClick={() => setPanelOpen(false)} className="text-[#6b7280] hover:text-white text-lg cursor-pointer">✕</button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 text-sm text-[#e4e6f0]">
              {!dashData && <div className="text-[#6b7280] text-center py-10">Загрузка...</div>}

              {/* Стик */}
              {dashData?.stik && panelTab === "stik" && (
                <div>
                  <h2 className="text-[#ecb00a] font-bold mb-3 text-base">📊 Последний отчёт Стика</h2>
                  {dashData.stik.latest ? (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{dashData.stik.latest}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="text-[#6b7280]">Отчётов пока нет. Запусти: node scripts/market-analyst.js</div>
                  )}
                  {dashData.stik.reports.length > 1 && (
                    <div className="mt-4 pt-3 border-t border-[#2a2a3a]">
                      <h3 className="text-xs text-[#6b7280] uppercase mb-2">Архив отчётов</h3>
                      {dashData.stik.reports.map(r => (
                        <div key={r} className="text-xs text-[#9ca3af] py-0.5">📄 {r}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Советник */}
              {dashData?.advisor && panelTab === "advisor" && (
                <div>
                  <h2 className="text-[#ecb00a] font-bold mb-3 text-base">🧠 Белый список Советника</h2>
                  {dashData.advisor.latest ? (
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown>{dashData.advisor.latest}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="text-[#6b7280]">Рекомендаций пока нет. Запусти: node scripts/advisor.js</div>
                  )}
                </div>
              )}

              {/* Надзиратель */}
              {dashData?.overseer && panelTab === "overseer" && (
                <div>
                  <h2 className="text-[#ecb00a] font-bold mb-3 text-base">👁️ Журнал Надзирателя</h2>
                  <div className="mb-4 bg-[#1a1a2e] rounded-lg p-3 border border-[#2a2a3a]">
                    <div className="text-xs text-[#6b7280] mb-1">Как дать задание:</div>
                    <code className="text-xs text-[#55efc4]">node scripts/overseer.js &quot;ваше указание&quot;</code>
                  </div>
                  {dashData.overseer.logs.length > 0 ? (
                    <div className="space-y-2">
                      {dashData.overseer.logs.map((log, i) => {
                        const isTask = log.action === "task_plan";
                        const isStatus = log.action === "status_change";
                        return (
                          <div key={i} className="bg-[#1a1a2e] rounded-lg p-3 border border-[#2a2a3a]">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs">
                                {isTask ? "📋" : isStatus ? "🔄" : "📝"}
                              </span>
                              <span className="text-xs text-[#6b7280]">
                                {log.createdAt ? new Date(log.createdAt).toLocaleString("ru") : ""}
                              </span>
                              <span className="text-xs text-[#ecb00a]">{log.action}</span>
                            </div>
                            {isTask && log.details?.order && (
                              <div className="mt-1">
                                <div className="text-xs text-white font-medium">Указание: {log.details.order}</div>
                                {log.details.plan?.summary && (
                                  <div className="text-xs text-[#9ca3af] mt-1">План: {log.details.plan.summary}</div>
                                )}
                                {log.details.plan?.tasks && (
                                  <div className="mt-1 space-y-0.5">
                                    {log.details.plan.tasks.map((t: any, j: number) => (
                                      <div key={j} className="text-xs text-[#4ECDC4]">
                                        → {t.bot}: {t.action}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {isStatus && log.details?.statusText && (
                              <div className="text-xs text-[#9ca3af]">{log.details.statusText}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-[#6b7280]">Пока нет записей. Дай первое задание!</div>
                  )}
                </div>
              )}

              {/* Блогер */}
              {dashData?.blogger && panelTab === "blogger" && (
                <div>
                  <h2 className="text-[#ecb00a] font-bold mb-3 text-base">🎬 Видео Блогера</h2>
                  {dashData.blogger.videos.length > 0 ? (
                    <div className="space-y-4">
                      {dashData.blogger.videos.map(v => (
                        <div key={v.name} className="bg-[#1a1a2e] rounded-lg p-4 border border-[#2a2a3a]">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="text-2xl">🎬</span>
                            <div>
                              <div className="font-bold text-white">{v.script?.title || v.name}</div>
                              <div className="text-xs text-[#6b7280]">{v.date} • {v.name}</div>
                            </div>
                          </div>
                          {v.script?.slides && (
                            <div className="space-y-1 mt-2">
                              {v.script.slides.map((s: any, i: number) => (
                                <div key={i} className="text-xs text-[#9ca3af] flex gap-2">
                                  <span className="text-[#ecb00a]">{i + 1}.</span>
                                  <span>{s.text}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {v.script?.hashtags && (
                            <div className="mt-2 text-xs text-[#4ECDC4]">
                              {v.script.hashtags.join(" ")}
                            </div>
                          )}
                          <div className="mt-2 text-xs text-[#6b7280]">
                            📁 content/videos/{v.name}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[#6b7280]">Видео пока нет. Запусти: node scripts/blogger.js</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
