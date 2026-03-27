import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { activityLogs } from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const offset = parseInt(url.searchParams.get("offset") || "0");

    let query = db.select().from(activityLogs);
    if (type) {
      query = query.where(eq(activityLogs.entityType, type)) as typeof query;
    }

    const activities = await query
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalResult] = await db.select({ count: count() }).from(activityLogs);

    return NextResponse.json({
      activities,
      total: totalResult.count,
    });
  } catch (err) { console.error(err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
