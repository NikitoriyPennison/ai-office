import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const allAgents = await db.select().from(agents);
    return NextResponse.json({ agents: allAgents });
  } catch (err) { console.error(err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
