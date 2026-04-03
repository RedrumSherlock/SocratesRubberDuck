import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import { type LLMProvider } from "@/lib/providers";

export type { LLMProvider } from "@/lib/providers";
export { PROVIDER_LABELS, DEFAULT_MODELS, PROVIDER_BASE_URLS } from "@/lib/providers";

export const DATA_DIR = path.join(os.homedir(), ".socratesrubberduck");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

export interface AppConfig {
  provider: LLMProvider;
  apiKey: string;
  endpoint?: string; // required for azure and litellm
  model?: string;    // optional model override
  tavilyKey: string;
}

export async function getConfig(): Promise<AppConfig | null> {
  // Backward-compat: env vars for Anthropic
  if (process.env.ANTHROPIC_API_KEY && process.env.TAVILY_API_KEY) {
    return {
      provider: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      tavilyKey: process.env.TAVILY_API_KEY,
    };
  }
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    // Backward-compat: old config had anthropicKey field
    if (parsed.anthropicKey && !parsed.apiKey) {
      return {
        provider: "anthropic",
        apiKey: parsed.anthropicKey,
        tavilyKey: parsed.tavilyKey ?? "",
      };
    }
    return parsed as AppConfig;
  } catch {
    return null;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

export async function isConfigured(): Promise<boolean> {
  const cfg = await getConfig();
  if (!cfg?.apiKey || !cfg?.tavilyKey) return false;
  if (cfg.provider === "azure" && !cfg.endpoint) return false;
  if (cfg.provider === "litellm" && !cfg.endpoint) return false;
  return true;
}
