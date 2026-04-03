import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI, { AzureOpenAI } from "openai";
import {
  getConfig,
  saveConfig,
  isConfigured,
  DEFAULT_MODELS,
  PROVIDER_BASE_URLS,
  type LLMProvider,
  type AppConfig,
} from "@/lib/config";

export async function GET() {
  const configured = await isConfigured();
  return NextResponse.json({ configured });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === "test-llm") {
    const { provider, apiKey, endpoint, model } = body as {
      provider: LLMProvider;
      apiKey: string;
      endpoint?: string;
      model?: string;
    };

    const resolvedModel = model?.trim() || DEFAULT_MODELS[provider];

    try {
      if (provider === "anthropic") {
        const client = new Anthropic({ apiKey });
        await client.messages.create({
          model: resolvedModel,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        });
      } else if (provider === "azure") {
        if (!endpoint) throw new Error("Endpoint required for Azure OpenAI");
        if (!resolvedModel) throw new Error("Deployment name required for Azure OpenAI");
        const client = new AzureOpenAI({
          apiKey,
          endpoint,
          apiVersion: "2025-01-01-preview",
          deployment: resolvedModel,
        });
        await client.chat.completions.create({
          model: resolvedModel,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        });
      } else {
        const baseURL = endpoint?.trim() || PROVIDER_BASE_URLS[provider];
        const client = new OpenAI({ apiKey, baseURL });
        await client.chat.completions.create({
          model: resolvedModel,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        });
      }
      return NextResponse.json({ ok: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Invalid key or configuration";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
  }

  if (action === "test-tavily") {
    const { tavilyKey } = body;
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tavilyKey, query: "test", max_results: 1 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return NextResponse.json({ ok: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Invalid key";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
  }

  if (action === "save") {
    const { provider, apiKey, endpoint, model, tavilyKey } = body as AppConfig & { action: string };
    if (!apiKey || !tavilyKey) {
      return NextResponse.json({ ok: false, error: "API key and Tavily key required" }, { status: 400 });
    }
    if (provider === "azure" && !endpoint) {
      return NextResponse.json({ ok: false, error: "Endpoint required for Azure OpenAI" }, { status: 400 });
    }
    if (provider === "litellm" && !endpoint) {
      return NextResponse.json({ ok: false, error: "Endpoint required for LiteLLM" }, { status: 400 });
    }
    await saveConfig({ provider, apiKey, endpoint, model, tavilyKey });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}

export async function DELETE() {
  const cfg = await getConfig();
  await saveConfig({
    provider: cfg?.provider ?? "anthropic",
    apiKey: "",
    tavilyKey: "",
    endpoint: undefined,
    model: undefined,
  });
  return NextResponse.json({ ok: true });
}
