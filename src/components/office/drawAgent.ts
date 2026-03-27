import { Graphics, Container, Text, TextStyle } from "pixi.js";

// AgentId is any string — agents loaded from config
export type AgentId = string;

export interface AgentColors {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  shoes: number;
  accessory: number;
}

// Auto-generate palettes from agent ID hash — no hardcoding needed
const PALETTE_CACHE: Record<string, AgentColors> = {};

const BASE_COLORS = [
  { shirt: 0xffd700, accessory: 0xffd700 },  // gold
  { shirt: 0xab47bc, accessory: 0xce93d8 },  // purple
  { shirt: 0xff9800, accessory: 0xffb74d },  // orange
  { shirt: 0x4caf50, accessory: 0x81c784 },  // green
  { shirt: 0xf44336, accessory: 0xef5350 },  // red
  { shirt: 0x81d4fa, accessory: 0x4fc3f7 },  // light blue
  { shirt: 0x795548, accessory: 0xa1887f },  // brown
  { shirt: 0xff69b4, accessory: 0xffb6c1 },  // pink
  { shirt: 0x00bcd4, accessory: 0x4dd0e1 },  // cyan
  { shirt: 0x9c27b0, accessory: 0xba68c8 },  // deep purple
];

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getAgentPalette(agentId: string): AgentColors {
  if (PALETTE_CACHE[agentId]) return PALETTE_CACHE[agentId];
  
  const idx = hashString(agentId) % BASE_COLORS.length;
  const base = BASE_COLORS[idx];
  const skinVariant = hashString(agentId + "skin") % 3;
  const skins = [0xf5c6a0, 0xf0d5b8, 0xd4a574];
  const hairVariant = hashString(agentId + "hair") % 4;
  const hairs = [0x4a3728, 0x2d3436, 0x636e72, 0x4fc3f7];
  
  const palette: AgentColors = {
    skin: skins[skinVariant],
    hair: hairs[hairVariant],
    shirt: base.shirt,
    pants: 0x1a1a2e,
    shoes: 0x111122,
    accessory: base.accessory,
  };
  
  PALETTE_CACHE[agentId] = palette;
  return palette;
}

// Legacy compat — returns palette for any agent
const AGENT_PALETTES = new Proxy({} as Record<string, AgentColors>, {
  get(_, prop: string) { return getAgentPalette(prop); },
  has() { return true; },
});

const LABEL_STYLE = new TextStyle({
  fontFamily: '"Courier New", monospace',
  fontSize: 14,
  fontWeight: "bold",
  fill: 0xffffff,
  align: "center",
  dropShadow: {
    color: 0x000000,
    blur: 2,
    distance: 1,
    alpha: 0.8,
  },
});

export function createAgentSprite(agentId: AgentId): Container {
  const container = new Container();
  container.label = `agent-${agentId}`;
  const colors = AGENT_PALETTES[agentId];

  // Character is 20px wide, 28px tall (pixel-style)
  const body = new Graphics();

  // Shadow
  body.ellipse(10, 30, 8, 3);
  body.fill({ color: 0x000000, alpha: 0.25 });

  // Shoes
  body.rect(4, 26, 5, 3);
  body.fill(colors.shoes);
  body.rect(11, 26, 5, 3);
  body.fill(colors.shoes);

  // Pants/legs
  body.rect(5, 20, 4, 6);
  body.fill(colors.pants);
  body.rect(11, 20, 4, 6);
  body.fill(colors.pants);

  // Shirt/torso
  body.rect(3, 12, 14, 9);
  body.fill(colors.shirt);

  // Arms
  body.rect(0, 13, 3, 7);
  body.fill(colors.shirt);
  body.rect(17, 13, 3, 7);
  body.fill(colors.shirt);

  // Hands
  body.rect(0, 19, 3, 2);
  body.fill(colors.skin);
  body.rect(17, 19, 3, 2);
  body.fill(colors.skin);

  // Neck
  body.rect(8, 10, 4, 3);
  body.fill(colors.skin);

  // Head
  body.roundRect(4, 0, 12, 11, 2);
  body.fill(colors.skin);

  // Hair
  body.rect(4, 0, 12, 4);
  body.fill(colors.hair);
  body.rect(4, 0, 2, 7);
  body.fill(colors.hair);
  body.rect(14, 0, 2, 5);
  body.fill(colors.hair);

  // Eyes
  body.rect(7, 5, 2, 2);
  body.fill(0x2d3436);
  body.rect(11, 5, 2, 2);
  body.fill(0x2d3436);

  // Mouth (small smile)
  body.rect(9, 8, 3, 1);
  body.fill(0xd63031);

  // Beard for Ded
  if (agentId === "ded") {
    body.rect(5, 8, 10, 2);
    body.fill(colors.accessory);
    body.rect(6, 10, 8, 3);
    body.fill(colors.accessory);
    body.rect(7, 13, 6, 2);
    body.fill(colors.accessory);
  }

  // Lenochka — long hair + blush
  addFeminineFeatures(body, agentId, colors);

  container.addChild(body);

  // Draw agent-specific accessory
  const accessory = drawAccessory(agentId, colors);
  container.addChild(accessory);

  // Pivot from center-bottom for easier positioning
  container.pivot.set(10, 30);

  return container;
}

/** Add long hair + blush for Lenochka */
function addFeminineFeatures(body: Graphics, agentId: AgentId, colors: AgentColors) {
  if (agentId !== "lenochka") return;
  // Long hair down sides
  body.rect(3, 4, 2, 13);
  body.fill(colors.hair);
  body.rect(15, 4, 2, 13);
  body.fill(colors.hair);
  // Blush
  body.circle(7, 7, 1.5);
  body.fill({ color: 0xff9999, alpha: 0.5 });
  body.circle(13, 7, 1.5);
  body.fill({ color: 0xff9999, alpha: 0.5 });
}

function drawAccessory(agentId: AgentId, colors: AgentColors): Graphics {
  const g = new Graphics();

  switch (agentId) {
    case "vanya":
      // Clipboard/tablet in front
      g.rect(6, 14, 8, 6);
      g.fill(colors.accessory);
      g.rect(7, 15, 6, 4);
      g.fill(0xffffff);
      break;

    case "tema":
      // Drawing tablet on desk
      g.rect(21, 18, 8, 6);
      g.fill(0x2d3436);
      g.rect(22, 19, 6, 4);
      g.fill(colors.accessory);
      // Stylus
      g.rect(28, 16, 1, 5);
      g.fill(0xdfe6e9);
      break;

    case "pushkin":
      // Quill pen in hand
      g.rect(18, 12, 1, 8);
      g.fill(0xdfe6e9);
      g.rect(17, 11, 3, 2);
      g.fill(colors.accessory);
      break;

    case "volodya":
      // Laptop glow
      g.rect(21, 16, 10, 7);
      g.fill(0x2d3436);
      g.rect(22, 17, 8, 5);
      g.fill(colors.accessory);
      // Server rack indicator
      g.rect(33, 14, 2, 2);
      g.fill(0x55efc4);
      g.rect(33, 18, 2, 2);
      g.fill(0xff7675);
      break;

    case "garik":
      // Phone in hand
      g.rect(18, 14, 4, 7);
      g.fill(0x2d3436);
      g.rect(19, 15, 2, 5);
      g.fill(colors.accessory);
      break;

    case "stoyanov":
      // Camera
      g.rect(21, 13, 8, 6);
      g.fill(0x2d3436);
      g.roundRect(23, 14, 4, 4, 2);
      g.fill(colors.accessory);
      // Lens
      g.circle(25, 16, 1);
      g.fill(0x74b9ff);
      break;

    case "ded":
      // Book in hand
      g.rect(5, 15, 10, 7);
      g.fill(0x8b4513);
      g.rect(6, 16, 8, 5);
      g.fill(0xfaebd7);
      // Reading glasses
      g.circle(7, 5, 2);
      g.stroke({ color: 0xbdc3c7, width: 1 });
      g.circle(12, 5, 2);
      g.stroke({ color: 0xbdc3c7, width: 1 });
      g.moveTo(9, 5);
      g.lineTo(10, 5);
      g.stroke({ color: 0xbdc3c7, width: 1 });
      break;

    case "lenochka":
      // Small handbag
      g.rect(18, 16, 5, 5);
      g.fill(0xd63384);
      g.rect(19, 14, 3, 2);
      g.fill(0xd63384);
      break;

    case "proshka":
      // Red cap (tilted)
      g.rect(3, -2, 14, 3);
      g.fill(colors.accessory);
      g.rect(14, -1, 4, 2);
      g.fill(colors.accessory); // visor
      // Mail cart in front
      g.rect(21, 18, 10, 8);
      g.fill(0x795548);
      g.rect(22, 15, 8, 4);
      g.fill(0x795548);
      // Envelopes in cart
      g.rect(23, 16, 3, 2);
      g.fill(0xffffff);
      g.rect(26, 17, 3, 2);
      g.fill(0xfff9c4);
      // Wheels
      g.circle(23, 27, 2);
      g.fill(0x333333);
      g.circle(29, 27, 2);
      g.fill(0x333333);
      break;

    case "gary":
      // Phone in hand (recording/selfie)
      g.rect(18, 10, 5, 8);
      g.fill(0x2d3436);
      g.rect(19, 11, 3, 6);
      g.fill(0x74b9ff);
      // Snapback cap
      g.rect(4, -1, 12, 3);
      g.fill(0x2d3436);
      g.rect(3, 1, 3, 2);
      g.fill(0x2d3436); // visor
      break;
  }

  return g;
}

/**
 * Creates a walking-frame sprite for the agent.
 * `frame` 0 = left-leg-forward, 1 = right-leg-forward.
 * The sprite is the same dimensions (20×30, pivot 10,30) as the sitting sprite.
 */
export function createWalkingSprite(agentId: AgentId, frame: 0 | 1): Container {
  const container = new Container();
  container.label = `walk-${agentId}-${frame}`;
  const colors = AGENT_PALETTES[agentId];
  const body = new Graphics();

  // Shadow
  body.ellipse(10, 30, 8, 3);
  body.fill({ color: 0x000000, alpha: 0.25 });

  // Walking legs — frame 0: left forward, frame 1: right forward
  if (frame === 0) {
    // Left leg forward
    body.rect(4, 20, 4, 4);
    body.fill(colors.pants);
    body.rect(2, 24, 4, 3);
    body.fill(colors.pants);
    body.rect(1, 26, 5, 3);
    body.fill(colors.shoes);
    // Right leg back
    body.rect(12, 20, 4, 4);
    body.fill(colors.pants);
    body.rect(14, 24, 4, 3);
    body.fill(colors.pants);
    body.rect(15, 26, 5, 3);
    body.fill(colors.shoes);
  } else {
    // Right leg forward
    body.rect(12, 20, 4, 4);
    body.fill(colors.pants);
    body.rect(14, 24, 4, 3);
    body.fill(colors.pants);
    body.rect(15, 26, 5, 3);
    body.fill(colors.shoes);
    // Left leg back
    body.rect(4, 20, 4, 4);
    body.fill(colors.pants);
    body.rect(2, 24, 4, 3);
    body.fill(colors.pants);
    body.rect(1, 26, 5, 3);
    body.fill(colors.shoes);
  }

  // Torso
  body.rect(3, 12, 14, 9);
  body.fill(colors.shirt);

  // Arms swinging opposite to legs
  if (frame === 0) {
    // Left arm back, right arm forward
    body.rect(0, 14, 3, 6);
    body.fill(colors.shirt);
    body.rect(0, 19, 3, 2);
    body.fill(colors.skin);
    body.rect(17, 12, 3, 6);
    body.fill(colors.shirt);
    body.rect(17, 17, 3, 2);
    body.fill(colors.skin);
  } else {
    // Left arm forward, right arm back
    body.rect(0, 12, 3, 6);
    body.fill(colors.shirt);
    body.rect(0, 17, 3, 2);
    body.fill(colors.skin);
    body.rect(17, 14, 3, 6);
    body.fill(colors.shirt);
    body.rect(17, 19, 3, 2);
    body.fill(colors.skin);
  }

  // Neck
  body.rect(8, 10, 4, 3);
  body.fill(colors.skin);

  // Head
  body.roundRect(4, 0, 12, 11, 2);
  body.fill(colors.skin);

  // Hair
  body.rect(4, 0, 12, 4);
  body.fill(colors.hair);
  body.rect(4, 0, 2, 7);
  body.fill(colors.hair);
  body.rect(14, 0, 2, 5);
  body.fill(colors.hair);

  // Eyes
  body.rect(7, 5, 2, 2);
  body.fill(0x2d3436);
  body.rect(11, 5, 2, 2);
  body.fill(0x2d3436);

  // Mouth
  body.rect(9, 8, 3, 1);
  body.fill(0xd63031);


  // Lenochka feminine features
  addFeminineFeatures(body, agentId, colors);
  container.addChild(body);
  container.pivot.set(10, 30);
  return container;
}

/**
 * Creates a "stretch" sprite variation — arms raised above head.
 */
export function createStretchSprite(agentId: AgentId): Container {
  const container = new Container();
  container.label = `stretch-${agentId}`;
  const colors = AGENT_PALETTES[agentId];
  const body = new Graphics();

  // Shadow
  body.ellipse(10, 30, 8, 3);
  body.fill({ color: 0x000000, alpha: 0.25 });

  // Shoes
  body.rect(4, 26, 5, 3);
  body.fill(colors.shoes);
  body.rect(11, 26, 5, 3);
  body.fill(colors.shoes);

  // Legs
  body.rect(5, 20, 4, 6);
  body.fill(colors.pants);
  body.rect(11, 20, 4, 6);
  body.fill(colors.pants);

  // Torso
  body.rect(3, 12, 14, 9);
  body.fill(colors.shirt);

  // Arms UP (stretched)
  body.rect(1, 2, 3, 11);
  body.fill(colors.shirt);
  body.rect(16, 2, 3, 11);
  body.fill(colors.shirt);
  // Hands up
  body.rect(1, 0, 3, 3);
  body.fill(colors.skin);
  body.rect(16, 0, 3, 3);
  body.fill(colors.skin);

  // Neck
  body.rect(8, 10, 4, 3);
  body.fill(colors.skin);

  // Head
  body.roundRect(4, 0, 12, 11, 2);
  body.fill(colors.skin);

  // Hair
  body.rect(4, 0, 12, 4);
  body.fill(colors.hair);
  body.rect(4, 0, 2, 7);
  body.fill(colors.hair);
  body.rect(14, 0, 2, 5);
  body.fill(colors.hair);

  // Eyes (closed/relaxed — horizontal lines)
  body.rect(7, 6, 2, 1);
  body.fill(0x2d3436);
  body.rect(11, 6, 2, 1);
  body.fill(0x2d3436);

  // Mouth (open — yawning)
  body.roundRect(9, 8, 3, 2, 1);
  body.fill(0xd63031);

  container.addChild(body);

  // Lenochka feminine features
  addFeminineFeatures(body, agentId, colors);
  container.pivot.set(10, 30);
  return container;
}

/**
 * Creates a "water cup in hand" sprite for when agent is at the cooler.
 */
export function createCoolerSprite(agentId: AgentId): Container {
  const container = new Container();
  container.label = `cooler-${agentId}`;
  const colors = AGENT_PALETTES[agentId];
  const body = new Graphics();

  // Shadow
  body.ellipse(10, 30, 8, 3);
  body.fill({ color: 0x000000, alpha: 0.25 });

  // Shoes
  body.rect(4, 26, 5, 3);
  body.fill(colors.shoes);
  body.rect(11, 26, 5, 3);
  body.fill(colors.shoes);

  // Legs
  body.rect(5, 20, 4, 6);
  body.fill(colors.pants);
  body.rect(11, 20, 4, 6);
  body.fill(colors.pants);

  // Torso
  body.rect(3, 12, 14, 9);
  body.fill(colors.shirt);

  // Left arm normal
  body.rect(0, 13, 3, 7);
  body.fill(colors.shirt);
  body.rect(0, 19, 3, 2);
  body.fill(colors.skin);

  // Right arm holding cup — bent
  body.rect(17, 13, 3, 4);
  body.fill(colors.shirt);
  body.rect(18, 16, 5, 2);
  body.fill(colors.skin);
  // Cup
  body.rect(21, 14, 4, 4);
  body.fill(0xdfe6e9);
  body.rect(22, 14, 2, 3);
  body.fill(0x4dd0e1);

  // Neck
  body.rect(8, 10, 4, 3);
  body.fill(colors.skin);

  // Head
  body.roundRect(4, 0, 12, 11, 2);
  body.fill(colors.skin);

  // Hair
  body.rect(4, 0, 12, 4);
  body.fill(colors.hair);
  body.rect(4, 0, 2, 7);
  body.fill(colors.hair);
  body.rect(14, 0, 2, 5);
  body.fill(colors.hair);

  // Eyes
  body.rect(7, 5, 2, 2);
  body.fill(0x2d3436);
  body.rect(11, 5, 2, 2);
  body.fill(0x2d3436);

  // Mouth (small smile)
  body.rect(9, 8, 3, 1);
  body.fill(0xd63031);

  container.addChild(body);

  // Lenochka feminine features
  addFeminineFeatures(body, agentId, colors);
  container.pivot.set(10, 30);
  return container;
}

export function createAgentLabel(name: string): Text {
  const label = new Text({ text: name, style: LABEL_STYLE });
  label.anchor.set(0.5, 0);
  return label;
}
