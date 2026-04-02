import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getConfig, saveConfig, isConfigured } from "@/lib/config";

export async function GET() {
  const configured = await isConfigured();
  return NextResponse.json({ configured });
}

export async function POST(req: NextRequest) {
  const { anthropicKey, tavilyKey, action } = await req.json();

  // Test only — don't save
  if (action === "test-anthropic") {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      });
      return NextResponse.json({ ok: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Invalid key";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
  }

  if (action === "test-tavily") {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: "test",
          max_results: 1,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return NextResponse.json({ ok: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Invalid key";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
  }

  // Save both keys
  if (action === "save") {
    if (!anthropicKey || !tavilyKey) {
      return NextResponse.json({ ok: false, error: "Both keys required" }, { status: 400 });
    }
    await saveConfig({ anthropicKey, tavilyKey });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
}

export async function DELETE() {
  const { saveConfig: save } = await import("@/lib/config");
  await save({ anthropicKey: "", tavilyKey: "" });
  return NextResponse.json({ ok: true });
}
