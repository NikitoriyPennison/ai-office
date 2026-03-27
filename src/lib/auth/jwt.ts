import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === "production") {
    console.error("⚠️  JWT_SECRET not set! Run: openssl rand -hex 32 > .env");
  }
  return "dev-secret-change-in-production";
})();

export interface JwtPayload {
  userId: string;
  username: string;
  role: "admin" | "viewer";
}

export function signToken(payload: JwtPayload): string {
  // expiresIn as number of seconds (7 days)
  return jwt.sign(payload as object, JWT_SECRET, { expiresIn: 604800 });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (err) { console.error(err);
    return null;
  }
}
