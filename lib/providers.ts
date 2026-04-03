export type LLMProvider = "anthropic" | "openai" | "azure" | "gemini" | "litellm" | "xai";

export const PROVIDER_LABELS: Record<LLMProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  azure: "Azure OpenAI",
  gemini: "Google Gemini",
  litellm: "LiteLLM",
  xai: "xAI (Grok)",
};

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: "claude-opus-4-6",
  openai: "gpt-4o",
  azure: "", // deployment name required
  gemini: "gemini-2.0-flash",
  litellm: "gpt-4o",
  xai: "grok-3",
};

export const PROVIDER_BASE_URLS: Partial<Record<LLMProvider, string>> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/",
  xai: "https://api.x.ai/v1",
};
