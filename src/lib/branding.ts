import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

interface Branding {
  title: string;
  author: string;
  website: string;
  telegram: string;
  youtube: string;
  support: string;
}

let cached: Branding | null = null;

export function getBranding(): Branding {
  if (cached) return cached;
  
  try {
    const configPath = resolve(process.cwd(), "config/office.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      cached = {
        title: config.branding?.title || config.officeName || "AI Office",
        author: config.branding?.author || "",
        website: config.branding?.website || "",
        telegram: config.branding?.telegram || "",
        youtube: config.branding?.youtube || "",
        support: config.branding?.support || "",
      };
      return cached;
    }
  } catch (err) { console.error(err); }
  
  return {
    title: "AI Office",
    author: "",
    website: "",
    telegram: "",
    youtube: "",
    support: "",
  };
}
