"use client";

import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import { Application, Container, Graphics, Text, TextStyle, Assets, Sprite as PixiSprite, Texture } from "pixi.js";
import {
  createAgentSprite,
  createAgentLabel,
  createWalkingSprite,
  createStretchSprite,
  createCoolerSprite,
  type AgentId,
} from "./drawAgent";
import { createOfficeEnvironment, DESK_POSITIONS, WATER_COOLER_POS, MEETING_TABLE_POS, MEETING_SEATS, GAMING_AREA_POS } from "./drawOffice";
import type { Agent, AgentStatus } from "@/lib/utils/types";

// NPC agents don't show in meetings and have different movement patterns
const NPC_IDS = new Set<string>();
function isNpcAgent(id: string): boolean { return NPC_IDS.has(id); }
function registerNpc(id: string) { NPC_IDS.add(id); }

// ---------- types ----------

interface PixelOfficeProps {
  agents: Agent[];
  onAgentClick?: (agentId: string) => void;
  className?: string;
}

export interface PixelOfficeHandle {
  triggerInteraction: (fromId: string, toId: string) => void;
  triggerCoolerVisit: (agentId: string) => void;
  triggerMeeting: (agentIds: string[]) => void;
  triggerAllMeeting: () => void;
}

/** Movement state machine states */
type MovementState =
  | "SITTING"
  | "WALKING_TO"
  | "AT_COOLER"
  | "AT_GAMING"
  | "INTERACTING"
  | "WALKING_BACK"
  | "STRETCHING"
  | "LOOKING_AROUND"
  | "AT_MEETING";

interface AgentNode {
  container: Container;
  // Sprite variants (only one visible at a time)
  sprite: Container;           // sitting (original)
  walkFrames: [Container, Container]; // walk frame 0, 1
  stretchSprite: Container;
  coolerSprite: Container;
  label: Text;
  statusBubble: Container;
  particles: Container;
  glowOverlay: Graphics;
  // API status from props
  apiStatus: AgentStatus;
  // Movement state machine
  moveState: MovementState;
  // Animation
  animTime: number;
  particleTimer: number;
  // Movement
  homeX: number;
  homeY: number;
  targetX: number;
  targetY: number;
  walkFrame: 0 | 1;
  walkFrameTimer: number;
  // Idle behavior timer
  idleTimer: number;
  idleInterval: number; // 45-90s random
  // State timer (for AT_COOLER, INTERACTING, STRETCHING, LOOKING_AROUND)
  stateTimer: number;
  stateDuration: number;
  // Interaction target (who we're chatting with)
  interactTarget: string | null;
  // Look-around direction
  lookDir: -1 | 0 | 1;
  lookTimer: number;
  // Agent ID for reference
  agentId: AgentId;
}

// ---------- constants ----------

const CANVAS_W = 960;
const CANVAS_H = 600;
const BG_COLOR = 0x0f0f0f;
const WALK_SPEED = 60; // px/sec
const WALK_FRAME_INTERVAL = 0.25; // seconds between frame swaps

const STATUS_COLORS: Record<string, number> = {
  idle: 0x636e72,
  working: 0x00b894,
  thinking: 0xfdcb6e,
  busy: 0xe17055,
  offline: 0x555555,
};

const BUBBLE_STYLE = new TextStyle({
  fontFamily: '"Courier New", monospace',
  fontSize: 11,
  fontWeight: "bold",
  fill: 0xffffff,
  wordWrap: true,
  wordWrapWidth: 130,
});

const CHAT_BUBBLE_STYLE = new TextStyle({
  fontFamily: '"Courier New", monospace',
  fontSize: 14,
  fill: 0xffffff,
});

// Agent names loaded from config (passed as prop)
// Agent names — loaded dynamically from /api/agents
// Override via config/office.json
let AGENT_NAMES: Record<string, string> = {};

// Will be populated from API response
function setAgentNames(agents: Array<{id: string, name: string}>) {
  AGENT_NAMES = {};
  for (const a of agents) {
    AGENT_NAMES[a.id] = a.name;
  }
}

// ---------- helpers ----------

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Show only one sprite variant; hide the rest. */
function showSpriteVariant(
  node: AgentNode,
  which: "sit" | "walk" | "stretch" | "cooler",
) {
  node.sprite.visible = which === "sit";
  node.walkFrames[0].visible = which === "walk" && node.walkFrame === 0;
  node.walkFrames[1].visible = which === "walk" && node.walkFrame === 1;
  node.stretchSprite.visible = which === "stretch";
  node.coolerSprite.visible = which === "cooler";
}

// ---------- component ----------

export const PixelOffice = forwardRef<PixelOfficeHandle, PixelOfficeProps>(
  function PixelOffice({ agents, onAgentClick, className }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);
    const nodesRef = useRef<Map<string, AgentNode>>(new Map());
    const destroyedRef = useRef(false);

    // Expose imperative handles
    useImperativeHandle(ref, () => ({
      triggerInteraction(fromId: string, toId: string) {
        const fromNode = nodesRef.current.get(fromId);
        const toNode = nodesRef.current.get(toId);
        if (!fromNode || !toNode) return;
        // Only trigger if the agent is sitting idle
        if (fromNode.moveState !== "SITTING") return;

        fromNode.interactTarget = toId;
        fromNode.targetX = toNode.homeX;
        fromNode.targetY = toNode.homeY;
        transitionTo(fromNode, "WALKING_TO");
      },
      triggerCoolerVisit(agentId: string) {
        const node = nodesRef.current.get(agentId);
        if (!node) return;
        if (node.moveState !== "SITTING") return;

        node.interactTarget = null;
        node.targetX = WATER_COOLER_POS.x;
        node.targetY = WATER_COOLER_POS.y;
        transitionTo(node, "WALKING_TO");
      },
      triggerMeeting(agentIds: string[]) {
        const seats = MEETING_SEATS;
        agentIds.forEach((id, i) => {
          const node = nodesRef.current.get(id);
          if (!node) return;
          if (node.moveState !== "SITTING") return;
          const seat = seats[i % seats.length];
          node.interactTarget = "__meeting__";
          node.targetX = MEETING_TABLE_POS.x + seat.x;
          node.targetY = MEETING_TABLE_POS.y + seat.y;
          transitionTo(node, "WALKING_TO");
        });
      },
      triggerAllMeeting() {
        const seats = MEETING_SEATS;
        const allAgents = Array.from(nodesRef.current.entries())
          .filter(([id]) => !isNpcAgent(id)); // Дед и Леночка не ходят на общие митинги
        allAgents.forEach(([, node], i) => {
          const seat = seats[i % seats.length];
          node.interactTarget = "__meeting__";
          node.targetX = MEETING_TABLE_POS.x + seat.x;
          node.targetY = MEETING_TABLE_POS.y + seat.y;
          transitionTo(node, "WALKING_TO");
        });
      },
    }));

    // Build / tear-down the PixiJS application
    useEffect(() => {
      if (!containerRef.current) return;
      destroyedRef.current = false;

      const el = containerRef.current;

      const app = new Application();
      appRef.current = app;

      let rafId: number;

      (async () => {
        try {
        const initPromise = app.init({
          width: CANVAS_W,
          height: CANVAS_H,
          backgroundColor: BG_COLOR,
          antialias: false,
          resolution: 1,
          autoDensity: true,
          preference: "webgl",
        });
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Pixi init timeout")), 8000));
        await Promise.race([initPromise, timeout]);

        if (destroyedRef.current) {
          app.destroy(true);
          return;
        }

        // Scale canvas to fill container while preserving aspect
        app.canvas.style.width = "100%";
        app.canvas.style.height = "100%";
        app.canvas.style.objectFit = "contain";
        app.canvas.style.imageRendering = "pixelated";

        el.appendChild(app.canvas);

        // Office environment — programmatic base + optional sprite overlay
        const environment = createOfficeEnvironment(CANVAS_W, CANVAS_H);
        app.stage.addChild(environment);

        // Try to overlay pixel-art background on top
        const bgImg = new Image();
        bgImg.crossOrigin = "anonymous";
        bgImg.src = "/office-bg.png";
        bgImg.onload = () => {
          try {
            const texture = Texture.from(bgImg);
            const bg = new PixiSprite(texture);
            bg.width = CANVAS_W;
            bg.height = CANVAS_H;
            // Insert at bottom of environment (behind everything)
            environment.addChildAt(bg, 0);
            // Hide all programmatic children except bg
            for (let i = 1; i < environment.children.length; i++) {
              environment.children[i].visible = false;
            }
            console.log("✅ office-bg.png overlaid");
          } catch (err) {
            console.warn("Failed to create sprite from bg image", err);
          }
        };

        // Agents layer (on top — renders above furniture)
        const agentsLayer = new Container();
        agentsLayer.label = "agents-layer";
        agentsLayer.sortableChildren = true;
        app.stage.addChild(agentsLayer);

        // Леночка NPC on lounge couch (client-side only)
        {
          const lenNode = createAgentNode("npc" as AgentId, 805, 518);
          lenNode.apiStatus = "idle";
          lenNode.idleTimer = 0;
          lenNode.idleInterval = randomRange(15, 30);
          // Hide status bubble and context bar for NPC
          const sb = lenNode.container.children.find(c => c.label === "status-bubble");
          if (sb) sb.visible = false;
          const cb = lenNode.container.children.find(c => c.label === "context-bar");
          if (cb) cb.visible = false;
          nodesRef.current.set("__npc__", lenNode);
          agentsLayer.addChild(lenNode.container);
        }

        // Animation loop
        let lastTime = performance.now();
        let meetingTimer = randomRange(120, 240); // first meeting in 2-4 min
        let meetingActive = false;
        let meetingDuration = 0;

        function animate() {
          if (destroyedRef.current) return;
          const now = performance.now();
          const dt = (now - lastTime) / 1000;
          lastTime = now;

          // Auto-meeting logic
          meetingTimer -= dt;
          if (meetingActive) {
            meetingDuration -= dt;
            if (meetingDuration <= 0) {
              // End meeting — send agents back
              for (const [, node] of nodesRef.current) {
                if (node.moveState === "AT_MEETING") {
                  transitionTo(node, "WALKING_BACK");
                }
              }
              meetingActive = false;
              meetingTimer = randomRange(180, 360); // next in 3-6 min
            }
          } else if (meetingTimer <= 0) {
            // Start meeting — pick 2-3 idle agents (not Дед)
            const idleAgents = Array.from(nodesRef.current.entries())
              .filter(([id, n]) => !isNpcAgent(id) && n.apiStatus === "idle" && n.moveState === "SITTING");
            if (idleAgents.length >= 2) {
              const count = Math.min(idleAgents.length, 2 + Math.floor(Math.random() * 2)); // 2-3
              const shuffled = idleAgents.sort(() => Math.random() - 0.5).slice(0, count);
              const seats = MEETING_SEATS;
              shuffled.forEach(([, node], i) => {
                const seat = seats[i % seats.length];
                node.interactTarget = "__meeting__";
                node.targetX = MEETING_TABLE_POS.x + seat.x;
                node.targetY = MEETING_TABLE_POS.y + seat.y;
                transitionTo(node, "WALKING_TO");
              });
              meetingActive = true;
              meetingDuration = randomRange(20, 40); // meeting lasts 20-40 sec
            } else {
              meetingTimer = randomRange(60, 120); // retry in 1-2 min
            }
          }

          for (const [, node] of nodesRef.current) {
            node.animTime += dt;
            updateMovement(node, dt, nodesRef.current);
            animateAgent(node, dt);
            // Sort by Y for z-ordering
            node.container.zIndex = node.container.y;
          }
          rafId = requestAnimationFrame(animate);
        }
        rafId = requestAnimationFrame(animate);
        } catch (err) {
          console.error("Pixi init failed:", err);
          if (el) { while (el.firstChild) el.removeChild(el.firstChild);
            const bg = document.createElement('div');
            bg.style.cssText = 'position:absolute;inset:0;background:url(/office-bg.png) center/cover no-repeat #0a0a12;z-index:1;';
            el.appendChild(bg); }
        }
      })();

      return () => {
        destroyedRef.current = true;
        cancelAnimationFrame(rafId);
        nodesRef.current.clear();
        try {
          app.destroy(true);
        } catch (_) {
          // PixiJS 8.x cleanup
        }
        appRef.current = null;
      };
    }, []); // mount once

    // Sync agent data into PixiJS nodes
    const syncAgents = useCallback(
      (agentList: Agent[]) => {
        const app = appRef.current;
        if (!app || destroyedRef.current) return;

        const agentsLayer = app.stage.children.find(
          (c) => c.label === "agents-layer",
        ) as Container | undefined;
        if (!agentsLayer) return;

        setAgentNames(agentList);
        const validIds = new Set(agentList.map((a) => a.id));

        // Remove agents no longer present (keep NPC lenochka)
        for (const [id, node] of nodesRef.current) {
          if (!validIds.has(id) && !isNpcAgent(id)) {
            agentsLayer.removeChild(node.container);
            nodesRef.current.delete(id);
          }
        }

        // Create or update agents
        // Agents assigned to other rooms (boss office)
        const BOSS_OFFICE_AGENTS = new Set(["vanya", "stoyanov"]);
        for (const agent of agentList) {
          if (BOSS_OFFICE_AGENTS.has(agent.id)) continue;
          const pos = DESK_POSITIONS[agent.id];
          if (!pos) continue;

          let node = nodesRef.current.get(agent.id);

          if (!node) {
            node = createAgentNode(
              agent.id as AgentId,
              pos.x,
              pos.y,
              onAgentClick,
            );
            nodesRef.current.set(agent.id, node);
            agentsLayer.addChild(node.container);
            // Initialize bubble on first render
            const initStatus = (agent.currentStatus || "idle") as AgentStatus;
            node.apiStatus = initStatus;
            updateStatusBubble(node, initStatus, agent);
          }

          // Update API status
          const status = (agent.currentStatus || "idle") as AgentStatus;
          if (node.apiStatus !== status) {
            const oldStatus = node.apiStatus;
            node.apiStatus = status;
            node.animTime = 0;

            // If agent is now working/thinking/busy, cancel any movement and go home
            if (status !== "idle" && status !== "offline") {
              if (node.moveState !== "SITTING") {
                node.container.x = node.homeX;
                node.container.y = node.homeY;
                transitionTo(node, "SITTING");
              }
            }

            // If agent went idle from non-idle, reset idle timer
            if (status === "idle" && oldStatus !== "idle") {
              node.idleTimer = 0;
              node.idleInterval = randomRange(45, 90);
            }

            updateStatusBubble(node, status, agent);
          } else {
            // Status unchanged but text may have changed — refresh bubble
            updateStatusBubble(node, status, agent);
          }

          // Update context bar
          const pct = (agent as any).contextPct || 0;
          const ctxBar = node.container.children.find(c => c.label === "context-bar");
          if (ctxBar) {
            const fill = (ctxBar as Container).children.find(c => c.label === "bar-fill") as Graphics | undefined;
            if (fill) {
              fill.clear();
              const barW = Math.max(1, Math.round(38 * pct / 100));
              const color = pct > 80 ? 0xff1744 : pct > 50 ? 0xfdcb6e : 0x00b894;
              fill.roundRect(-19, 0.5, barW, 3, 1);
              fill.fill(color);
            }
          }
        }
      },
      [onAgentClick],
    );

    // Re-sync whenever agents array changes
    useEffect(() => {
      syncAgents(agents);
    }, [agents, syncAgents]);

    return (
      <div
        ref={containerRef}
        className={`relative overflow-hidden bg-[#0a0a12] ${className ?? ""}`}
        style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
      >
      </div>
    );
  },
);

// ---------- agent node factory ----------

function createAgentNode(
  agentId: AgentId,
  x: number,
  y: number,
  onClick?: (id: string) => void,
): AgentNode {
  const container = new Container();
  container.label = `agent-node-${agentId}`;
  container.x = x;
  container.y = y;
  container.scale.set(1.8); // Scale up agents to match new art background

  // Glow overlay (behind sprite)
  const glowOverlay = new Graphics();
  glowOverlay.circle(0, 0, 20);
  glowOverlay.fill({ color: 0xffffff, alpha: 0 });
  glowOverlay.y = -10;
  container.addChild(glowOverlay);

  // Agent sprite (sitting — default)
  const sprite = createAgentSprite(agentId);
  sprite.y = -10;
  container.addChild(sprite);

  // Walking frames
  const walk0 = createWalkingSprite(agentId, 0);
  walk0.y = -10;
  walk0.visible = false;
  container.addChild(walk0);

  const walk1 = createWalkingSprite(agentId, 1);
  walk1.y = -10;
  walk1.visible = false;
  container.addChild(walk1);

  // Stretch sprite
  const stretchSprite = createStretchSprite(agentId);
  stretchSprite.y = -10;
  stretchSprite.visible = false;
  container.addChild(stretchSprite);

  // Cooler sprite (holding cup)
  const coolerSprite = createCoolerSprite(agentId);
  coolerSprite.y = -10;
  coolerSprite.visible = false;
  container.addChild(coolerSprite);

  // Label — ABOVE head like MMORPG (scale down to compensate container scale)
  const label = createAgentLabel(AGENT_NAMES[agentId] || agentId);
  label.y = -50;
  label.scale.set(0.5); // counteract 1.8x container scale
  container.addChild(label);

  // Context bar (token usage) — below name, above head
  const contextBar = new Container();
  contextBar.label = "context-bar";
  contextBar.y = -43;
  contextBar.scale.set(0.5);
  // Bar background
  const barBg = new Graphics();
  barBg.roundRect(-20, 0, 40, 4, 2);
  barBg.fill({ color: 0x1a1a2e, alpha: 0.8 });
  barBg.stroke({ color: 0x363a4a, width: 0.5 });
  contextBar.addChild(barBg);
  // Bar fill (will be updated dynamically)
  const barFill = new Graphics();
  barFill.label = "bar-fill";
  barFill.roundRect(-19, 0.5, 1, 3, 1);
  barFill.fill(0x00b894);
  contextBar.addChild(barFill);
  container.addChild(contextBar);

  // Status bubble (starts hidden — highest, above everything)
  const statusBubble = new Container();
  statusBubble.label = "status-bubble";
  statusBubble.visible = false;
  statusBubble.y = -60;
  statusBubble.scale.set(0.45);
  container.addChild(statusBubble);

  // Particle container
  const particles = new Container();
  particles.label = "particles";
  container.addChild(particles);

  // Interactivity
  container.eventMode = "static";
  container.cursor = "pointer";
  container.hitArea = {
    contains: (px: number, py: number) =>
      px >= -20 && px <= 20 && py >= -55 && py <= 15,
  };

  container.on("pointerover", () => {
    glowOverlay.clear();
    glowOverlay.circle(0, 0, 22);
    glowOverlay.fill({ color: 0x6c5ce7, alpha: 0.2 });
    glowOverlay.circle(0, 0, 18);
    glowOverlay.fill({ color: 0x6c5ce7, alpha: 0.15 });
  });

  container.on("pointerout", () => {
    glowOverlay.clear();
    glowOverlay.circle(0, 0, 20);
    glowOverlay.fill({ color: 0xffffff, alpha: 0 });
  });

  if (onClick) {
    container.on("pointertap", () => onClick(agentId));
  }

  return {
    container,
    sprite,
    walkFrames: [walk0, walk1],
    stretchSprite,
    coolerSprite,
    label,
    statusBubble,
    particles,
    glowOverlay,
    agentId,
    apiStatus: "idle",
    moveState: "SITTING",
    animTime: Math.random() * 10, // stagger initial phase
    particleTimer: 0,
    homeX: x,
    homeY: y,
    targetX: x,
    targetY: y,
    walkFrame: 0,
    walkFrameTimer: 0,
    idleTimer: randomRange(5, 15), // first wander comes sooner
    idleInterval: false /* custom agent speed */ ? randomRange(15, 30) : randomRange(45, 90),
    stateTimer: 0,
    stateDuration: 0,
    interactTarget: null,
    lookDir: 0,
    lookTimer: 0,
  };
}

// ---------- state machine ----------

function transitionTo(node: AgentNode, newState: MovementState) {
  node.moveState = newState;
  node.stateTimer = 0;

  switch (newState) {
    case "SITTING":
      node.container.x = node.homeX;
      node.container.y = node.homeY;
      showSpriteVariant(node, "sit");
      node.sprite.rotation = 0;
      node.interactTarget = null;
      // Reset idle timer for next wander
      node.idleTimer = 0;
      node.idleInterval = false ? randomRange(15, 30) : randomRange(45, 90);
      // Hide chat/gaming bubble if showing
      hideChatBubble(node);
      hideGamingBubble(node);
      break;

    case "WALKING_TO":
    case "WALKING_BACK":
      showSpriteVariant(node, "walk");
      node.walkFrameTimer = 0;
      break;

    case "AT_COOLER":
      showSpriteVariant(node, "cooler");
      node.stateDuration = isNpcAgent(node.agentId) ? randomRange(5, 8) : randomRange(3, 5);
      break;

    case "AT_GAMING":
      showSpriteVariant(node, "sit");
      node.stateDuration = randomRange(8, 15);
      break;

    case "INTERACTING":
      showSpriteVariant(node, "sit");
      node.stateDuration = isNpcAgent(node.agentId) ? randomRange(5, 10) : randomRange(3, 5);
      break;

    case "STRETCHING":
      showSpriteVariant(node, "stretch");
      node.stateDuration = randomRange(2, 3.5);
      break;

    case "LOOKING_AROUND":
      showSpriteVariant(node, "sit");
      node.stateDuration = randomRange(2, 4);
      node.lookDir = Math.random() < 0.5 ? -1 : 1;
      node.lookTimer = 0;
      break;

    case "AT_MEETING":
      showSpriteVariant(node, "sit");
      node.stateDuration = randomRange(8, 10);
      break;
  }
}

function updateMovement(
  node: AgentNode,
  dt: number,
  allNodes: Map<string, AgentNode>,
) {
  // Ded never leaves his desk — always sitting, but flips book pages periodically
  if (isNpcAgent(node.agentId)) {
    if (node.moveState !== "SITTING") {
      node.container.x = node.homeX;
      node.container.y = node.homeY;
      transitionTo(node, "SITTING");
    }
    // Book page flip animation
    node.idleTimer += dt;
    if (node.idleTimer >= node.idleInterval) {
      node.idleTimer = 0;
      node.idleInterval = randomRange(8, 20); // flip every 8-20 seconds
      // Find or create book page particle
      const pageFlip = new Graphics();
      // Small white page flipping
      pageFlip.rect(-3, -2, 6, 4);
      pageFlip.fill(0xfff9c4);
      pageFlip.rect(-2, -1, 4, 2);
      pageFlip.fill(0xffffff);
      pageFlip.x = node.homeX + 8;
      pageFlip.y = node.homeY - 5;
      pageFlip.alpha = 1;
      node.container.parent?.addChild(pageFlip);
      // Animate: float up and fade
      let elapsed = 0;
      const animatePageFlip = (ticker: { deltaTime: number }) => {
        elapsed += ticker.deltaTime / 60;
        pageFlip.y -= 0.5;
        pageFlip.x += Math.sin(elapsed * 8) * 0.3;
        pageFlip.alpha = Math.max(0, 1 - elapsed * 1.5);
        pageFlip.rotation = elapsed * 2;
        if (pageFlip.alpha <= 0) {
          pageFlip.destroy();
          node.container.parent?.removeChild(pageFlip);
        }
      };
      // Use requestAnimationFrame-style with simple timeout
      let frames = 0;
      const runFlip = () => {
        frames++;
        animatePageFlip({ deltaTime: 1 });
        if (frames < 60) requestAnimationFrame(runFlip);
      };
      requestAnimationFrame(runFlip);
    }
    return;
  }

  // Lenochka NPC — custom idle behavior (no API status dependency)
  if (isNpcAgent(node.agentId)) {
    if (node.moveState === "SITTING") {
      node.idleTimer += dt;
      if (node.idleTimer >= node.idleInterval) {
        node.idleTimer = 0;
        node.idleInterval = randomRange(15, 30);
        const roll = Math.random();
        if (roll < 0.5) {
          // Go to water cooler
          node.interactTarget = null;
          node.targetX = WATER_COOLER_POS.x + randomRange(-10, 10);
          node.targetY = WATER_COOLER_POS.y + randomRange(-5, 5);
          transitionTo(node, "WALKING_TO");
        } else {
          // Go to random agent desk (not ded)
          const deskKeys = Object.keys(DESK_POSITIONS).filter(k => !isNpcAgent(k));
          const pick = deskKeys[Math.floor(Math.random() * deskKeys.length)];
          const deskPos = DESK_POSITIONS[pick];
          if (deskPos) {
            node.interactTarget = pick;
            node.targetX = deskPos.x + randomRange(-10, 10);
            node.targetY = deskPos.y + 15;
            transitionTo(node, "WALKING_TO");
          }
        }
      }
      return;
    }
    // For walking/at_cooler/interacting states, use the normal switch below
    // but override durations for lenochka
    if (node.moveState === "AT_COOLER") {
      node.stateTimer += dt;
      if (node.stateTimer >= node.stateDuration) {
        transitionTo(node, "WALKING_BACK");
      }
      return;
    }
    if (node.moveState === "INTERACTING") {
      node.stateTimer += dt;
      if (node.stateTimer >= node.stateDuration) {
        if (node.interactTarget) {
          const targetNode = allNodes.get(node.interactTarget);
          if (targetNode) hideChatBubble(targetNode);
        }
        transitionTo(node, "WALKING_BACK");
      }
      return;
    }
    // WALKING_TO / WALKING_BACK — fall through to normal handling below
    if (node.moveState !== "WALKING_TO" && node.moveState !== "WALKING_BACK") {
      return;
    }
  }

  // Working/thinking/busy agents stay at desk, no wandering
  if (
    node.apiStatus === "working" ||
    node.apiStatus === "thinking" ||
    node.apiStatus === "busy"
  ) {
    if (node.moveState !== "SITTING") {
      node.container.x = node.homeX;
      node.container.y = node.homeY;
      transitionTo(node, "SITTING");
    }
    return;
  }

  switch (node.moveState) {
    case "SITTING": {
      // Only idle agents wander
      if (node.apiStatus !== "idle") return;

      node.idleTimer += dt;
      if (node.idleTimer >= node.idleInterval) {
        node.idleTimer = 0;
        // Pick a random idle behavior
        const roll = Math.random();
        if (roll < 0.3) {
          // Go to water cooler
          node.interactTarget = null;
          node.targetX = WATER_COOLER_POS.x + randomRange(-15, 15);
          node.targetY = WATER_COOLER_POS.y + randomRange(-5, 10);
          transitionTo(node, "WALKING_TO");
        } else if (roll < 0.6) {
          // Go to gaming couch
          node.interactTarget = "__gaming__";
          node.targetX = GAMING_AREA_POS.x + randomRange(-20, 20);
          node.targetY = GAMING_AREA_POS.y + 26; // sit on the couch
          transitionTo(node, "WALKING_TO");
        } else if (roll < 0.8) {
          // Stretch at desk
          transitionTo(node, "STRETCHING");
        } else {
          // Look around
          transitionTo(node, "LOOKING_AROUND");
        }
      }
      break;
    }

    case "WALKING_TO":
    case "WALKING_BACK": {
      const tx =
        node.moveState === "WALKING_BACK" ? node.homeX : node.targetX;
      const ty =
        node.moveState === "WALKING_BACK" ? node.homeY : node.targetY;

      const dx = tx - node.container.x;
      const dy = ty - node.container.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 2) {
        // Arrived
        node.container.x = tx;
        node.container.y = ty;

        if (node.moveState === "WALKING_BACK") {
          transitionTo(node, "SITTING");
        } else if (node.interactTarget === "__meeting__") {
          transitionTo(node, "AT_MEETING");
          showMeetingBubble(node);
        } else if (node.interactTarget === "__gaming__") {
          transitionTo(node, "AT_GAMING");
          showGamingBubble(node);
        } else if (node.interactTarget) {
          transitionTo(node, "INTERACTING");
          // Show chat bubbles on both agents
          showChatBubble(node);
          const targetNode = allNodes.get(node.interactTarget);
          if (targetNode) {
            showChatBubble(targetNode);
          }
        } else {
          transitionTo(node, "AT_COOLER");
        }
      } else {
        // Move towards target
        const step = WALK_SPEED * dt;
        const ratio = Math.min(step / dist, 1);
        node.container.x += dx * ratio;
        node.container.y += dy * ratio;

        // Animate walk frames
        node.walkFrameTimer += dt;
        if (node.walkFrameTimer >= WALK_FRAME_INTERVAL) {
          node.walkFrameTimer = 0;
          node.walkFrame = node.walkFrame === 0 ? 1 : 0;
        }
        showSpriteVariant(node, "walk");

        // Bounce (1-2px vertical oscillation)
        const bounce = Math.sin(node.animTime * 10) * 1.5;
        node.walkFrames[0].y = -10 + bounce;
        node.walkFrames[1].y = -10 + bounce;

        // Flip sprite based on horizontal direction
        const scaleX = dx < 0 ? -1 : 1;
        node.walkFrames[0].scale.x = scaleX;
        node.walkFrames[1].scale.x = scaleX;
      }
      break;
    }

    case "AT_COOLER": {
      node.stateTimer += dt;
      if (node.stateTimer >= node.stateDuration) {
        transitionTo(node, "WALKING_BACK");
      }
      break;
    }

    case "AT_GAMING": {
      node.stateTimer += dt;
      if (node.stateTimer >= node.stateDuration) {
        hideGamingBubble(node);
        transitionTo(node, "WALKING_BACK");
      }
      break;
    }

    case "INTERACTING": {
      node.stateTimer += dt;
      if (node.stateTimer >= node.stateDuration) {
        // Hide chat bubble on interaction target
        if (node.interactTarget) {
          const targetNode = allNodes.get(node.interactTarget);
          if (targetNode) {
            hideChatBubble(targetNode);
          }
        }
        transitionTo(node, "WALKING_BACK");
      }
      break;
    }

    case "STRETCHING": {
      node.stateTimer += dt;
      // Slight up/down oscillation during stretch
      node.stretchSprite.y = -10 + Math.sin(node.stateTimer * 2) * 1.5;
      if (node.stateTimer >= node.stateDuration) {
        transitionTo(node, "SITTING");
      }
      break;
    }

    case "LOOKING_AROUND": {
      node.stateTimer += dt;
      node.lookTimer += dt;
      // Switch look direction every ~1s
      if (node.lookTimer > 1) {
        node.lookTimer = 0;
        node.lookDir = node.lookDir === -1 ? 1 : -1;
      }
      // Shift the sitting sprite slightly left/right
      node.sprite.x = node.lookDir * 1.5;

      if (node.stateTimer >= node.stateDuration) {
        node.sprite.x = 0;
        transitionTo(node, "SITTING");
      }
      break;
    }

    case "AT_MEETING": {
      node.stateTimer += dt;
      if (node.stateTimer >= node.stateDuration) {
        hideMeetingBubble(node);
        transitionTo(node, "WALKING_BACK");
      }
      break;
    }
  }
}

// ---------- chat bubble ----------

function showChatBubble(node: AgentNode) {
  // Create a temporary chat bubble with speech emoji
  let chatBubble = node.container.children.find(
    (c) => c.label === "chat-bubble",
  ) as Container | undefined;

  if (chatBubble) {
    chatBubble.visible = true;
    return;
  }

  chatBubble = new Container();
  chatBubble.label = "chat-bubble";
  chatBubble.y = -55;
  chatBubble.scale.set(0.45);

  const bg = new Graphics();
  bg.roundRect(-14, -10, 28, 20, 4);
  bg.fill(0x6c5ce7);
  bg.moveTo(-3, 10);
  bg.lineTo(0, 14);
  bg.lineTo(3, 10);
  bg.closePath();
  bg.fill(0x6c5ce7);
  chatBubble.addChild(bg);

  const emoji = new Text({ text: "\uD83D\uDCAC", style: CHAT_BUBBLE_STYLE });
  emoji.anchor.set(0.5, 0.5);
  chatBubble.addChild(emoji);

  node.container.addChild(chatBubble);
}

function hideChatBubble(node: AgentNode) {
  const chatBubble = node.container.children.find(
    (c) => c.label === "chat-bubble",
  );
  if (chatBubble) {
    node.container.removeChild(chatBubble);
    chatBubble.destroy();
  }
}

// ---------- meeting bubble ----------

function showMeetingBubble(node: AgentNode) {
  let bubble = node.container.children.find(
    (c) => c.label === "meeting-bubble",
  ) as Container | undefined;

  if (bubble) {
    bubble.visible = true;
    return;
  }

  bubble = new Container();
  bubble.label = "meeting-bubble";
  bubble.y = -60;
  bubble.scale.set(0.45);

  const bg = new Graphics();
  bg.roundRect(-30, -10, 60, 20, 4);
  bg.fill(0x5d4037);
  bg.moveTo(-3, 10);
  bg.lineTo(0, 14);
  bg.lineTo(3, 10);
  bg.closePath();
  bg.fill(0x5d4037);
  bubble.addChild(bg);

  const emoji = new Text({ text: "\uD83D\uDCCB Meeting...", style: new TextStyle({
    fontFamily: '"Courier New", monospace',
    fontSize: 10,
    fill: 0xffffff,
  }) });
  emoji.anchor.set(0.5, 0.5);
  bubble.addChild(emoji);

  node.container.addChild(bubble);
}

function hideMeetingBubble(node: AgentNode) {
  const bubble = node.container.children.find(
    (c) => c.label === "meeting-bubble",
  );
  if (bubble) {
    node.container.removeChild(bubble);
    bubble.destroy();
  }
}

// ---------- gaming bubble ----------

function showGamingBubble(node: AgentNode) {
  let bubble = node.container.children.find(
    (c) => c.label === "gaming-bubble",
  ) as Container | undefined;

  if (bubble) {
    bubble.visible = true;
    return;
  }

  bubble = new Container();
  bubble.label = "gaming-bubble";
  bubble.y = -60;
  bubble.scale.set(0.45);

  const bg = new Graphics();
  bg.roundRect(-14, -10, 28, 20, 4);
  bg.fill(0x6c5ce7);
  bg.moveTo(-3, 10);
  bg.lineTo(0, 14);
  bg.lineTo(3, 10);
  bg.closePath();
  bg.fill(0x6c5ce7);
  bubble.addChild(bg);

  const emoji = new Text({ text: "\uD83C\uDFAE", style: CHAT_BUBBLE_STYLE });
  emoji.anchor.set(0.5, 0.5);
  bubble.addChild(emoji);

  node.container.addChild(bubble);
}

function hideGamingBubble(node: AgentNode) {
  const bubble = node.container.children.find(
    (c) => c.label === "gaming-bubble",
  );
  if (bubble) {
    node.container.removeChild(bubble);
    bubble.destroy();
  }
}

// ---------- status bubble ----------

function updateStatusBubble(
  node: AgentNode,
  status: AgentStatus,
  agent: Agent,
) {
  const bubble = node.statusBubble;
  bubble.removeChildren();

  // Show bubble for non-idle/non-offline states, or if there's status text
  const statusText = getStatusText(status, agent);
  if (!statusText) {
    bubble.visible = false;
    return;
  }

  const bg = new Graphics();
  const truncated =
    statusText.length > 30 ? statusText.slice(0, 28) + "\u2026" : statusText;
  const text = new Text({ text: truncated, style: BUBBLE_STYLE });
  text.anchor.set(0.5, 0.5);

  const padX = 6;
  const padY = 3;
  const w = Math.max(text.width + padX * 2, 30);
  const h = text.height + padY * 2;

  // Bubble background
  bg.roundRect(-w / 2, -h / 2, w, h, 3);
  bg.fill(STATUS_COLORS[status] || 0x636e72);
  // Pointer triangle
  bg.moveTo(-3, h / 2);
  bg.lineTo(0, h / 2 + 4);
  bg.lineTo(3, h / 2);
  bg.closePath();
  bg.fill(STATUS_COLORS[status] || 0x636e72);

  bubble.addChild(bg);
  bubble.addChild(text);
  bubble.visible = true;
}

function getStatusText(status: AgentStatus, agent: Agent): string | null {
  switch (status) {
    case "working":
      return agent.description || "Working...";
    case "thinking":
      return "Thinking...";
    case "busy":
      return agent.description || "Busy";
    case "offline":
      return null;
    case "idle":
      return null;
    default:
      return null;
  }
}

// ---------- animation loop (desk animations for API statuses) ----------

function animateAgent(node: AgentNode, dt: number) {
  const t = node.animTime;

  // If the agent is moving/doing idle behaviors, skip desk animations
  if (node.moveState !== "SITTING") {
    // Still update particles and bubble bob
    updateParticles(node.particles, dt);
    if (node.statusBubble.visible) {
      node.statusBubble.y = -60 + Math.sin(t * 2) * 1.5;
    }
    // Bob the chat bubble too
    const chatBubble = node.container.children.find(
      (c) => c.label === "chat-bubble",
    );
    if (chatBubble?.visible) {
      chatBubble.y = -45 + Math.sin(t * 2.5) * 1.5;
    }
    // Bob the meeting bubble too
    const meetingBubble = node.container.children.find(
      (c) => c.label === "meeting-bubble",
    );
    if (meetingBubble?.visible) {
      meetingBubble.y = -45 + Math.sin(t * 2.5) * 1.5;
    }
    // Bob the gaming bubble too
    const gamingBubble = node.container.children.find(
      (c) => c.label === "gaming-bubble",
    );
    if (gamingBubble?.visible) {
      gamingBubble.y = -40 + Math.sin(t * 2.5) * 1.5;
    }
    return;
  }

  // Desk animations (original behavior) — only when SITTING
  switch (node.apiStatus) {
    case "idle":
      node.sprite.y = -10 + Math.sin(t * 1.5) * 0.8;
      break;

    case "working":
      node.sprite.y = -10 + Math.sin(t * 3) * 0.5;
      node.particleTimer += dt;
      if (node.particleTimer > 0.3) {
        node.particleTimer = 0;
        spawnParticle(node.particles, 0xffd700, node.sprite.x, -20);
      }
      break;

    case "thinking":
      node.sprite.y = -10 + Math.sin(t * 1.2) * 1;
      animateThoughtDots(node, t);
      break;

    case "busy":
      node.sprite.y = -10 + Math.sin(t * 4) * 0.6;
      node.particleTimer += dt;
      if (node.particleTimer > 0.2) {
        node.particleTimer = 0;
        spawnParticle(node.particles, 0xe17055, node.sprite.x, -20);
      }
      break;

    case "offline":
      node.sprite.y = -8;
      node.sprite.rotation = 0.05;
      animateZzz(node, t);
      break;

    default:
      node.sprite.y = -10 + Math.sin(t * 1.5) * 0.8;
  }

  // Animate and clean up particles
  updateParticles(node.particles, dt);

  // Bubble bob
  if (node.statusBubble.visible) {
    node.statusBubble.y = -60 + Math.sin(t * 2) * 1.5;
  }
}

// ---------- particle effects ----------

function spawnParticle(
  container: Container,
  color: number,
  baseX: number,
  baseY: number,
) {
  if (container.children.length > 8) return; // pool limit

  const p = new Graphics();
  p.rect(-1, -1, 2, 2);
  p.fill(color);
  p.x = baseX + (Math.random() - 0.5) * 20;
  p.y = baseY;
  p.alpha = 1;
  (p as Graphics & { vy: number; life: number }).vy =
    -15 - Math.random() * 10;
  (p as Graphics & { vy: number; life: number }).life =
    0.8 + Math.random() * 0.4;
  container.addChild(p);
}

function updateParticles(container: Container, dt: number) {
  for (let i = container.children.length - 1; i >= 0; i--) {
    const p = container.children[i] as Graphics & {
      vy: number;
      life: number;
    };
    if (p.vy === undefined) continue;
    p.y += p.vy * dt;
    p.life -= dt;
    p.alpha = Math.max(0, p.life);
    if (p.life <= 0) {
      container.removeChild(p);
      p.destroy();
    }
  }
}

// ---------- thought bubble animation ----------

function animateThoughtDots(node: AgentNode, t: number) {
  if (!node.statusBubble.visible) {
    const bubble = node.statusBubble;
    bubble.removeChildren();

    const bg = new Graphics();
    bg.roundRect(-16, -8, 32, 16, 4);
    bg.fill(0xfdcb6e);
    bg.circle(-4, 12, 3);
    bg.fill(0xfdcb6e);
    bg.circle(-2, 16, 2);
    bg.fill(0xfdcb6e);
    bubble.addChild(bg);

    // Three dots
    for (let i = 0; i < 3; i++) {
      const dot = new Graphics();
      dot.circle(0, 0, 2);
      dot.fill(0x2d3436);
      dot.x = -8 + i * 8;
      dot.y = 0;
      dot.label = `dot-${i}`;
      bubble.addChild(dot);
    }

    bubble.visible = true;
  }

  // Animate the dots bouncing
  for (let i = 1; i <= 3; i++) {
    const dot = node.statusBubble.children[i];
    if (dot) {
      dot.y = Math.sin(t * 3 + i * 0.8) * 2;
    }
  }
}

// ---------- zzZ animation ----------

function animateZzz(node: AgentNode, t: number) {
  const particles = node.particles;

  const phase = Math.floor(t * 0.8);
  const existingZs = particles.children.filter((c) => c.label === "zzz");

  if (existingZs.length < 3 && phase % 2 === 0) {
    const needsNew = existingZs.every(
      (z) => (z as Graphics & { life: number }).life < 1.5,
    );
    if (needsNew || existingZs.length === 0) {
      const z = new Text({
        text: "z",
        style: new TextStyle({
          fontFamily: '"Courier New", monospace',
          fontSize: 8 + existingZs.length * 2,
          fill: 0x9ba1b5,
        }),
      });
      z.label = "zzz";
      z.x = 8;
      z.y = -30;
      z.alpha = 1;
      (z as Text & { vy: number; vx: number; life: number }).vy = -8;
      (z as Text & { vy: number; vx: number; life: number }).vx = 3;
      (z as Text & { vy: number; vx: number; life: number }).life = 2;
      particles.addChild(z);
    }
  }

  // Update Z particles
  for (let i = particles.children.length - 1; i >= 0; i--) {
    const z = particles.children[i] as Text & {
      vy: number;
      vx: number;
      life: number;
    };
    if (z.label !== "zzz") continue;
    z.y += z.vy * 0.016;
    z.x += z.vx * 0.016;
    z.life -= 0.016;
    z.alpha = Math.max(0, z.life / 2);
    if (z.life <= 0) {
      particles.removeChild(z);
      z.destroy();
    }
  }
}
