import { NextRequest, NextResponse } from "next/server";

// Public routes — no auth required
const PUBLIC_PATHS = [
  "/tma",
  "/office/stream",
  "/overlay",
  "/stream-voice",           // voice monitor page
  "/auth/login",
  "/api/auth/login",
  "/api/openclaw/sessions",  // readonly live status for stream
  "/api/openclaw/stats",     // readonly token stats for stream
  "/api/agents",             // readonly agent list for stream
  "/api/activity/feed",      // readonly feed for stream
  "/api/tts",                // TTS for voice monitor
  "/api/tasks/",             // task status/chat updates from agents and UI
  "/api/queue/",             // agent task queue
  "/api/agents/registry",    // agent list
  "/api/chains",             // workflow chains
  "/api/dashboard",
  "/api/health",
  "/favicon.svg",
  "/_next",
];

// Rate limiting: simple in-memory store
const rateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // requests per window
const RATE_WINDOW = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Security headers on all responses
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self';"
  );

  // Rate limit API endpoints
  if (pathname.startsWith("/api/")) {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("cf-connecting-ip") || "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  }

  // Public paths — allow through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p)) || pathname === "/") {
    return response;
  }

  // Admin routes — require JWT
  if (pathname.startsWith("/office/admin") || pathname.startsWith("/api/")) {
    const token =
      request.headers.get("authorization")?.replace("Bearer ", "") ||
      request.cookies.get("ai-office-token")?.value;

    if (!token) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.svg).*)"],
};
