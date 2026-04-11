import { NextResponse } from "next/server";
import { getBranding } from "@/lib/branding";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getBranding());
}
