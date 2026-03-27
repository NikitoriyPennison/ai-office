import { NextRequest, NextResponse } from "next/server";
import Database from "better-sqlite3";

const DB_PATH = process.cwd() + "/data/database.sqlite";

export async function GET() {
  try {
    const db = new Database(DB_PATH, { readonly: true });
    const agents = db.prepare(`
      SELECT id, name, emoji, role, source, status, capabilities, last_heartbeat, created_at
      FROM agent_registry ORDER BY created_at DESC
    `).all();
    db.close();

    return NextResponse.json({ agents });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const db = new Database(DB_PATH, { readonly: false });
    db.prepare("DELETE FROM agent_registry WHERE id = ?").run(id);
    db.close();

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
