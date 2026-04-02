"use client";

import { useState } from "react";

interface Props {
  onComplete: () => void;
}

type TestState = "idle" | "testing" | "ok" | "error";

export default function SetupScreen({ onComplete }: Props) {
  const [anthropicKey, setAnthropicKey] = useState("");
  const [tavilyKey, setTavilyKey] = useState("");
  const [anthropicState, setAnthropicState] = useState<TestState>("idle");
  const [tavilyState, setTavilyState] = useState<TestState>("idle");
  const [anthropicError, setAnthropicError] = useState("");
  const [tavilyError, setTavilyError] = useState("");
  const [saving, setSaving] = useState(false);

  const testKey = async (type: "anthropic" | "tavily") => {
    const setState = type === "anthropic" ? setAnthropicState : setTavilyState;
    const setError = type === "anthropic" ? setAnthropicError : setTavilyError;
    const key = type === "anthropic" ? anthropicKey : tavilyKey;

    if (!key.trim()) return;
    setState("testing");
    setError("");

    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: `test-${type}`,
        anthropicKey,
        tavilyKey,
      }),
    });

    const data = await res.json();
    if (data.ok) {
      setState("ok");
    } else {
      setState("error");
      setError(data.error || "Key rejected");
    }
  };

  const handleSave = async () => {
    if (anthropicState !== "ok" || tavilyState !== "ok") return;
    setSaving(true);
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", anthropicKey, tavilyKey }),
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

  const bothOk = anthropicState === "ok" && tavilyState === "ok";

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <p className="text-4xl mb-3">🦆</p>
          <h1 className="text-2xl font-semibold text-gray-100">Socrates Rubber Duck</h1>
          <p className="text-sm text-gray-500 mt-1">Enter your API keys to get started</p>
        </div>

        <div className="space-y-6">
          {/* Anthropic */}
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">
              Anthropic API Key
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-xs text-gray-600 hover:text-gray-400 underline"
              >
                console.anthropic.com ↗
              </a>
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => {
                  setAnthropicKey(e.target.value);
                  setAnthropicState("idle");
                }}
                placeholder="sk-ant-..."
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-500"
              />
              <button
                onClick={() => testKey("anthropic")}
                disabled={!anthropicKey.trim() || anthropicState === "testing"}
                className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-sm text-gray-300 rounded-lg transition-colors whitespace-nowrap"
              >
                Test
              </button>
            </div>
            <div className="mt-1.5 text-xs h-4">{stateIcon(anthropicState)}</div>
            {anthropicError && (
              <p className="text-xs text-red-400 mt-1">{anthropicError}</p>
            )}
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
                onChange={(e) => {
                  setTavilyKey(e.target.value);
                  setTavilyState("idle");
                }}
                placeholder="tvly-..."
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-500"
              />
              <button
                onClick={() => testKey("tavily")}
                disabled={!tavilyKey.trim() || tavilyState === "testing"}
                className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-sm text-gray-300 rounded-lg transition-colors whitespace-nowrap"
              >
                Test
              </button>
            </div>
            <div className="mt-1.5 text-xs h-4">{stateIcon(tavilyState)}</div>
            {tavilyError && (
              <p className="text-xs text-red-400 mt-1">{tavilyError}</p>
            )}
          </div>

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
