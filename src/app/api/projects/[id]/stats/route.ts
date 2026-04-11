import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq, count, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [totalResult] = await db
      .select({ count: count() })
      .from(tasks)
      .where(eq(tasks.projectId, id));

    const [completedResult] = await db
      .select({ count: count() })
      .from(tasks)
      .where(and(eq(tasks.projectId, id), eq(tasks.status, "done")));

    const [inProgressResult] = await db
      .select({ count: count() })
      .from(tasks)
      .where(and(eq(tasks.projectId, id), eq(tasks.status, "in_progress")));

    return NextResponse.json({
      taskCount: totalResult.count,
      completedTasks: completedResult.count,
      inProgressTasks: inProgressResult.count,
      todoTasks: totalResult.count - completedResult.count - inProgressResult.count,
    });
  } catch (err) { console.error(err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
