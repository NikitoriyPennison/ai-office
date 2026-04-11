import { resolveHomePath } from "@/lib/paths";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function readFile(...paths: string[]): string | null {
  for (const p of paths) {
    const resolved = resolveHomePath(p);
    try {
      if (fs.existsSync(resolved)) {
        return fs.readFileSync(resolved, "utf-8");
      }
    } catch (err) { console.error(err); }
  }
  return null;
}

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const home = process.env.HOME || "/root";

    const soul = readFile(
      path.join(home, ".openclaw/agents", id, "SOUL.md"),
      path.join(home, ".openclaw", "agents", id, "SOUL.md")
    );

    const memory = readFile(
      path.join(home, ".openclaw/agents", id, "MEMORY.md"),
      path.join(home, ".openclaw", "agents", id, "MEMORY.md")
    );

    return NextResponse.json({ soul, memory });
  } catch (err) { console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
