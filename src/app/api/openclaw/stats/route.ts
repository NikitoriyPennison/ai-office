import { getOpenClawHome, getOpenClawConfigPath, getSessionsBase, resolveHomePath } from "@/lib/paths";
import { NextResponse } from "next/server";
import { readdirSync, statSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const SESSIONS_BASE = getSessionsBase();
// Read agents from config
function getAgentIds(): string[] {
  try {
    const configPath = join(process.cwd(), "config", "office.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      return Object.keys(config.openclaw?.agentMapping || {});
    }
  } catch (err) { console.error(err); }
  return [];
}
const AGENTS = getAgentIds();

// Opus 4.6 pricing
const INPUT_PRICE_PER_M = 5;
const OUTPUT_PRICE_PER_M = 25;

function scanAgent(agentKey: string) {
  const sessionsPath = join(SESSIONS_BASE, agentKey, "sessions");
  let totalSize = 0;
  let fileCount = 0;
  let newestMs = 0;

  try {
    const files = readdirSync(sessionsPath).filter(f => f.endsWith(".jsonl"));
    for (const f of files) {
      try {
        const st = statSync(join(sessionsPath, f));
        totalSize += st.size;
        fileCount++;
        if (st.mtimeMs > newestMs) newestMs = st.mtimeMs;
      } catch (err) { console.error(err); }
    }
  } catch (err) { console.error(err); }

  // Rough estimate: ~4 chars per token, split 70/30 input/output
  const estimatedTokens = Math.round(totalSize / 4);
  const inputTokens = Math.round(estimatedTokens * 0.7);
  const outputTokens = Math.round(estimatedTokens * 0.3);

  return { totalSize, fileCount, newestMs, estimatedTokens, inputTokens, outputTokens };
}

export const dynamic = "force-dynamic";

export async function GET() {
  let totalTokens = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalSessions = 0;
  const perAgent: Record<string, any> = {};

  for (const agent of AGENTS) {
    const data = scanAgent(agent);
    totalTokens += data.estimatedTokens;
    totalInput += data.inputTokens;
    totalOutput += data.outputTokens;
    totalSessions += data.fileCount;
    perAgent[agent] = data;
  }

  const cost = (totalInput / 1_000_000) * INPUT_PRICE_PER_M + (totalOutput / 1_000_000) * OUTPUT_PRICE_PER_M;

  return NextResponse.json({
    totalTokens,
    totalInput,
    totalOutput,
    totalSessions,
    cost: Math.round(cost * 100) / 100,
    perAgent,
    pricing: { input: INPUT_PRICE_PER_M, output: OUTPUT_PRICE_PER_M, model: "claude-opus-4-6" },
    timestamp: Date.now(),
  });
}
