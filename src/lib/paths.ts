import { join } from "path";
import { existsSync } from "fs";

export function getOpenClawHome(): string {
  if (process.env.OPENCLAW_HOME) {
    return process.env.OPENCLAW_HOME.replace("~", process.env.HOME || "/root");
  }
  return join(process.env.HOME || "/root", ".openclaw");
}

export function getOpenClawConfigPath(): string {
  return join(getOpenClawHome(), "openclaw.json");
}

export function getSessionsBase(): string {
  return join(getOpenClawHome(), "agents");
}

export function resolveHomePath(p: string): string {
  return p.startsWith("~") ? p.replace("~", process.env.HOME || "/root") : p;
}
