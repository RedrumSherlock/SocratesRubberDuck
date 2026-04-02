import { readFile, writeFile } from "fs/promises";
import path from "path";

const CONFIG_PATH = path.join(process.cwd(), ".config.local.json");

export interface AppConfig {
  anthropicKey: string;
  tavilyKey: string;
}

export async function getConfig(): Promise<AppConfig | null> {
  // Prefer env vars (e.g. if someone sets them manually)
  if (process.env.ANTHROPIC_API_KEY && process.env.TAVILY_API_KEY) {
    return {
      anthropicKey: process.env.ANTHROPIC_API_KEY,
      tavilyKey: process.env.TAVILY_API_KEY,
    };
  }
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    return JSON.parse(raw) as AppConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

export async function isConfigured(): Promise<boolean> {
  const cfg = await getConfig();
  return !!(cfg?.anthropicKey && cfg?.tavilyKey);
}
