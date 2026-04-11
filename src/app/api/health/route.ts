import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Check DB is accessible
    const result = await db.get(sql`SELECT 1 as ok`);
    return NextResponse.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      db: result ? "connected" : "error",
    });
  } catch (e) {
    return NextResponse.json(
      { status: "error", error: String(e) },
      { status: 503 }
    );
  }
}
