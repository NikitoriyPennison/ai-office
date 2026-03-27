import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export async function GET() {
  const configPath = join(process.cwd(), "config", "office.json");
  
  if (!existsSync(configPath)) {
    return NextResponse.json(
      { error: "config/office.json not found. Run: npm run setup" },
      { status: 404 }
    );
  }

  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    // Strip sensitive fields
    const { deploy, openclaw, ...safe } = config;
    return NextResponse.json(safe);
  } catch (err) { console.error(err);
    return NextResponse.json({ error: "Invalid config" }, { status: 500 });
  }
}
