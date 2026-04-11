import { NextResponse } from "next/server";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";

interface AgentMapping {
  [clawId: string]: { id: string; name: string; emoji: string; role: string };
}

function getAgentMapping(): AgentMapping {
  try {
    const configPath = join(process.cwd(), "config", "office.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      const mapping: AgentMapping = {};
      const agents = config.agents || [];
      const clawMapping = config.openclaw?.agentMapping || {};
      
      for (const [clawId, officeId] of Object.entries(clawMapping)) {
        const agent = agents.find((a: {id: string}) => a.id === officeId);
        if (agent) {
          mapping[clawId] = {
            id: agent.id,
            name: agent.name,
            emoji: agent.emoji,
            role: agent.role,
          };
        }
      }
      return mapping;
    }
  } catch (err) { console.error(err); }
  return {};
}

export const dynamic = "force-dynamic";

export async function GET() {
  const mapping = getAgentMapping();
  const home = process.env.HOME || "/root";
  const sessionsBase = join(home, ".openclaw", "agents");
  
  const result: Record<string, {
    id: string; name: string; emoji: string; role: string;
    lastActive: number; status: string;
  }> = {};
  
  for (const [clawId, info] of Object.entries(mapping)) {
    const sessionDir = join(sessionsBase, clawId, "sessions");
    let lastMtime = 0;
    
    try {
      const files = readdirSync(sessionDir).filter(f => f.endsWith(".jsonl"));
      for (const file of files) {
        const mtime = statSync(join(sessionDir, file)).mtimeMs;
        if (mtime > lastMtime) lastMtime = mtime;
      }
    } catch (err) { console.error(err); }
    
    const age = Date.now() - lastMtime;
    let status = "offline";
    if (lastMtime > 0 && age < 5 * 60 * 1000) status = "working";
    else if (lastMtime > 0 && age < 30 * 60 * 1000) status = "idle";
    
    result[info.id] = { ...info, lastActive: lastMtime, status };
  }
  
  return NextResponse.json({ agents: result });
}
