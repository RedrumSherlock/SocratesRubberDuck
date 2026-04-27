"use client";

import { useState, useEffect } from "react";
import { PROVIDER_LABELS, DEFAULT_MODELS, type LLMProvider } from "@/lib/providers";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
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
  anthropic: { label: "console.anthropic.com", url: "https://console.anthropic.com/settings/keys" },
  openai: { label: "platform.openai.com", url: "https://platform.openai.com/api-keys" },
  azure: { label: "Azure Portal", url: "https://portal.azure.com" },
  gemini: { label: "aistudio.google.com", url: "https://aistudio.google.com/apikey" },
  litellm: { label: "LiteLLM docs", url: "https://docs.litellm.ai" },
  xai: { label: "console.x.ai", url: "https://console.x.ai" },
};

export default function SettingsModal({ isOpen, onClose, onSaved }: Props) {
  const [provider, setProvider] = useState<LLMProvider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [model, setModel] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");
  const [openaiKeyForWhisper, setOpenaiKeyForWhisper] = useState("");
  const [factCheckModel, setFactCheckModel] = useState("");

  const [llmState, setLlmState] = useState<TestState>("idle");
  const [tavilyState, setTavilyState] = useState<TestState>("idle");
  const [llmError, setLlmError] = useState("");
  const [tavilyError, setTavilyError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const needsEndpoint = provider === "azure" || provider === "litellm";
  const needsModel = provider === "azure" || provider === "litellm";
  const needsWhisperKey = provider !== "openai";

  // Load current config when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetch("/api/setup?action=load-config")
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          setProvider(data.config.provider);
          setEndpoint(data.config.endpoint || "");
          setModel(data.config.model || "");
          setApiKey(data.config._raw.apiKey || "");
          setTavilyKey(data.config._raw.tavilyKey || "");
          setOpenaiKeyForWhisper(data.config._raw.openaiKeyForWhisper || "");
          setFactCheckModel(data.config.factCheckModel || "");
          // Mark as pre-validated since these are saved keys
          setLlmState("ok");
          setTavilyState("ok");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOpen]);

  const handleProviderChange = (p: LLMProvider) => {
    setProvider(p);
    setLlmState("idle");
    setLlmError("");
    setModel("");
    setEndpoint("");
    if (p === "openai") setOpenaiKeyForWhisper("");
  };

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
        factCheckModel: factCheckModel || undefined,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      onSaved();
      onClose();
    }
    setSaving(false);
  };

  const stateIcon = (s: TestState) => {
    if (s === "testing") return <span className="text-gray-400 animate-pulse">Testing...</span>;
    if (s === "ok") return <span className="text-emerald-400">OK</span>;
    if (s === "error") return <span className="text-red-400">Failed</span>;
    return null;
  };

  if (!isOpen) return null;

  const bothOk = llmState === "ok" && tavilyState === "ok";
  const keyLink = PROVIDER_KEY_LINKS[provider];
  const defaultModel = DEFAULT_MODELS[provider];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl p-6 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-100">Settings</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">&times;</button>
        </div>

        {loading ? (
          <div className="text-center text-gray-500 py-10">Loading...</div>
        ) : (
          <div className="space-y-5">
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
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300"
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
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-500"
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
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-500"
              />
              {!needsModel && defaultModel && (
                <p className="text-xs text-gray-600 mt-1">Default: {defaultModel}</p>
              )}
            </div>

            {/* Fact Check Model */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                Fact Check Model (optional)
              </label>
              <input
                type="text"
                value={factCheckModel}
                onChange={(e) => setFactCheckModel(e.target.value)}
                placeholder={provider === "anthropic" ? "claude-opus-4-6" : defaultModel || "default"}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-500"
              />
              <p className="text-xs text-gray-600 mt-1">
                Model used for Fact Check searches. Use a powerful model for best results.
              </p>
            </div>

            {/* API Key */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                {PROVIDER_LABELS[provider]} API Key
                <a href={keyLink.url} target="_blank" rel="noopener noreferrer"
                  className="ml-2 text-xs text-gray-600 hover:text-gray-400 underline"
                >{keyLink.label} ↗</a>
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setLlmState("idle"); }}
                  placeholder={PROVIDER_KEY_PLACEHOLDERS[provider]}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-500"
                />
                <button
                  onClick={testLLM}
                  disabled={!apiKey.trim() || (needsEndpoint && !endpoint.trim()) || (needsModel && !model.trim()) || llmState === "testing"}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-sm text-gray-300 rounded-lg transition-colors"
                >
                  Test
                </button>
              </div>
              <div className="mt-1 text-xs h-4">
                {stateIcon(llmState)}
                {llmError && <span className="text-red-400 ml-2">{llmError}</span>}
              </div>
            </div>

            {/* Tavily */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                Tavily API Key
                <a href="https://app.tavily.com" target="_blank" rel="noopener noreferrer"
                  className="ml-2 text-xs text-gray-600 hover:text-gray-400 underline"
                >app.tavily.com ↗</a>
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tavilyKey}
                  onChange={(e) => { setTavilyKey(e.target.value); setTavilyState("idle"); }}
                  placeholder="tvly-..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-500"
                />
                <button
                  onClick={testTavily}
                  disabled={!tavilyKey.trim() || tavilyState === "testing"}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-sm text-gray-300 rounded-lg transition-colors"
                >
                  Test
                </button>
              </div>
              <div className="mt-1 text-xs h-4">
                {stateIcon(tavilyState)}
                {tavilyError && <span className="text-red-400 ml-2">{tavilyError}</span>}
              </div>
            </div>

            {/* Whisper Key */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                OpenAI Key for Voice{needsWhisperKey ? "" : " (uses LLM key)"}
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer"
                  className="ml-2 text-xs text-gray-600 hover:text-gray-400 underline"
                >platform.openai.com ↗</a>
              </label>
              {needsWhisperKey ? (
                <input
                  type="password"
                  value={openaiKeyForWhisper}
                  onChange={(e) => setOpenaiKeyForWhisper(e.target.value)}
                  placeholder="sk-... (for multilingual speech recognition)"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-500"
                />
              ) : (
                <p className="text-xs text-gray-500">
                  Your OpenAI API key will be used for Whisper speech-to-text automatically.
                </p>
              )}
              <p className="text-xs text-gray-600 mt-1">
                Enables multilingual speech (mixed Chinese/English). Without this, browser STT is used.
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!bothOk || saving}
                className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>

            <p className="text-center text-xs text-gray-700">
              Keys are stored locally on this machine only
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
