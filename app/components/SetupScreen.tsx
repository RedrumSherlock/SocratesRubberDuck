"use client";

import { useState } from "react";
import { PROVIDER_LABELS, DEFAULT_MODELS, type LLMProvider } from "@/lib/providers";

interface Props {
  onComplete: () => void;
}

type TestState = "idle" | "testing" | "ok" | "error";

const PROVIDERS = Object.entries(PROVIDER_LABELS) as [LLMProvider, string][];

const PROVIDER_KEY_PLACEHOLDERS: Record<LLMProvider, string> = {
  anthropic: "sk-ant-...",
  openai: "sk-...",
  azure: "Azure API key",
  gemini: "AIza...",
  litellm: "sk-... (or your LiteLLM key)",
  xai: "xai-...",
};

const PROVIDER_KEY_LINKS: Record<LLMProvider, { label: string; url: string }> = {
  anthropic: { label: "console.anthropic.com ↗", url: "https://console.anthropic.com/settings/keys" },
  openai: { label: "platform.openai.com ↗", url: "https://platform.openai.com/api-keys" },
  azure: { label: "Azure Portal ↗", url: "https://portal.azure.com" },
  gemini: { label: "aistudio.google.com ↗", url: "https://aistudio.google.com/apikey" },
  litellm: { label: "LiteLLM docs ↗", url: "https://docs.litellm.ai" },
  xai: { label: "console.x.ai ↗", url: "https://console.x.ai" },
};

export default function SetupScreen({ onComplete }: Props) {
  const [provider, setProvider] = useState<LLMProvider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [model, setModel] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");
  const [openaiKeyForWhisper, setOpenaiKeyForWhisper] = useState("");

  const [llmState, setLlmState] = useState<TestState>("idle");
  const [tavilyState, setTavilyState] = useState<TestState>("idle");
  const [llmError, setLlmError] = useState("");
  const [tavilyError, setTavilyError] = useState("");
  const [saving, setSaving] = useState(false);

  const needsEndpoint = provider === "azure" || provider === "litellm";
  const needsModel = provider === "azure" || provider === "litellm";

  const handleProviderChange = (p: LLMProvider) => {
    setProvider(p);
    setLlmState("idle");
    setLlmError("");
    setModel("");
    setEndpoint("");
    if (p === "openai") setOpenaiKeyForWhisper("");
  };

  const needsWhisperKey = provider !== "openai";

  const testLLM = async () => {
    if (!apiKey.trim()) return;
    setLlmState("testing");
    setLlmError("");

    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "test-llm",
        provider,
        apiKey,
        endpoint: endpoint || undefined,
        model: model || undefined,
      }),
    });

    const data = await res.json();
    if (data.ok) {
      setLlmState("ok");
    } else {
      setLlmState("error");
      setLlmError(data.error || "Connection failed");
    }
  };

  const testTavily = async () => {
    if (!tavilyKey.trim()) return;
    setTavilyState("testing");
    setTavilyError("");

    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test-tavily", tavilyKey }),
    });

    const data = await res.json();
    if (data.ok) {
      setTavilyState("ok");
    } else {
      setTavilyState("error");
      setTavilyError(data.error || "Key rejected");
    }
  };

  const handleSave = async () => {
    if (llmState !== "ok" || tavilyState !== "ok") return;
    setSaving(true);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        provider,
        apiKey,
        endpoint: endpoint || undefined,
        model: model || undefined,
        tavilyKey,
        openaiKeyForWhisper: openaiKeyForWhisper || undefined,
      }),
    });
    const data = await res.json();
    if (data.ok) onComplete();
    else setSaving(false);
  };

  const stateIcon = (s: TestState) => {
    if (s === "testing") return <span className="text-gray-400 animate-pulse">Testing...</span>;
    if (s === "ok") return <span className="text-emerald-400">✓ Connected</span>;
    if (s === "error") return <span className="text-red-400">✗ Failed</span>;
    return null;
  };

  const bothOk = llmState === "ok" && tavilyState === "ok";
  const keyLink = PROVIDER_KEY_LINKS[provider];
  const defaultModel = DEFAULT_MODELS[provider];

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <p className="text-4xl mb-3">🦆</p>
          <h1 className="text-2xl font-semibold text-gray-100">Socrates Rubber Duck</h1>
          <p className="text-sm text-gray-500 mt-1">Configure your AI provider to get started</p>
        </div>

        <div className="space-y-6">
          {/* Provider selector */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">AI Provider</label>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map(([p, label]) => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  className={`py-2 px-3 rounded-lg text-xs font-medium transition-colors border ${
                    provider === p
                      ? "bg-gray-700 border-gray-500 text-gray-100"
                      : "bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Endpoint (Azure / LiteLLM) */}
          {needsEndpoint && (
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                {provider === "azure" ? "Azure Endpoint URL" : "LiteLLM Base URL"}
              </label>
              <input
                type="text"
                value={endpoint}
                onChange={(e) => { setEndpoint(e.target.value); setLlmState("idle"); }}
                placeholder={provider === "azure" ? "https://<resource>.openai.azure.com" : "http://localhost:4000"}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-500"
              />
            </div>
          )}

          {/* Model override */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">
              Model{needsModel ? "" : " (optional)"}
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => { setModel(e.target.value); setLlmState("idle"); }}
              placeholder={needsModel ? "Required" : defaultModel || "default"}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
            {!needsModel && defaultModel && (
              <p className="text-xs text-gray-600 mt-1">Default: {defaultModel}</p>
            )}
          </div>

          {/* API Key */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">
              {PROVIDER_LABELS[provider]} API Key
              <a
                href={keyLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-xs text-gray-600 hover:text-gray-400 underline"
              >
                {keyLink.label}
              </a>
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setLlmState("idle"); }}
                placeholder={PROVIDER_KEY_PLACEHOLDERS[provider]}
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-500"
              />
              <button
                onClick={testLLM}
                disabled={!apiKey.trim() || (needsEndpoint && !endpoint.trim()) || (needsModel && !model.trim()) || llmState === "testing"}
                className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-sm text-gray-300 rounded-lg transition-colors whitespace-nowrap"
              >
                Test
              </button>
            </div>
            <div className="mt-1.5 text-xs h-4">{stateIcon(llmState)}</div>
            {llmError && <p className="text-xs text-red-400 mt-1">{llmError}</p>}
          </div>

          {/* Tavily */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">
              Tavily API Key
              <a
                href="https://app.tavily.com"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-xs text-gray-600 hover:text-gray-400 underline"
              >
                app.tavily.com ↗
              </a>
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={tavilyKey}
                onChange={(e) => { setTavilyKey(e.target.value); setTavilyState("idle"); }}
                placeholder="tvly-..."
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-500"
              />
              <button
                onClick={testTavily}
                disabled={!tavilyKey.trim() || tavilyState === "testing"}
                className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-sm text-gray-300 rounded-lg transition-colors whitespace-nowrap"
              >
                Test
              </button>
            </div>
            <div className="mt-1.5 text-xs h-4">{stateIcon(tavilyState)}</div>
            {tavilyError && <p className="text-xs text-red-400 mt-1">{tavilyError}</p>}
          </div>

          {/* Whisper Key (optional, only for non-OpenAI providers) */}
          {needsWhisperKey && (
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                OpenAI Key for Voice (optional)
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-xs text-gray-600 hover:text-gray-400 underline"
                >
                  platform.openai.com ↗
                </a>
              </label>
              <input
                type="password"
                value={openaiKeyForWhisper}
                onChange={(e) => setOpenaiKeyForWhisper(e.target.value)}
                placeholder="sk-... (for better multilingual speech recognition)"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-500"
              />
              <p className="text-xs text-gray-600 mt-1">
                Enables Whisper for mixed Chinese/English speech. Without this, browser STT is used.
              </p>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={!bothOk || saving}
            className="w-full py-3 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {saving ? "Saving..." : "Start Thinking"}
          </button>
        </div>

        <p className="text-center text-xs text-gray-700 mt-6">
          Keys are stored locally on this machine only
        </p>
      </div>
    </div>
  );
}
