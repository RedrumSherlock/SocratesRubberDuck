import Anthropic from "@anthropic-ai/sdk";
import OpenAI, { AzureOpenAI } from "openai";
import { NextRequest, NextResponse } from "next/server";
import { writeFile, appendFile, mkdir } from "fs/promises";
import path from "path";
import { getConfig, DEFAULT_MODELS, PROVIDER_BASE_URLS, DATA_DIR, type AppConfig } from "@/lib/config";

const getSystemPrompt = (lang: "en" | "zh") => {
  const isZh = lang === "zh";
  return `You are the Socrates Rubber Duck — a cognitive mirror for deep thinking sessions.

LANGUAGE RULE: You MUST respond ONLY in ${isZh ? "Mandarin Chinese (简体中文)" : "English"}. Never mix languages.

BEHAVIORAL RULES:
1. NEVER BE AN ASSISTANT: Do not offer to draft, code, or execute tasks. Your ONLY goal is to facilitate the user's own thinking.
2. DUCK MODE: When the user is speaking fluently and coherently, respond with ONLY a minimal backchannel (1–3 words max): ${isZh ? '"继续", "嗯", "说下去", "然后呢"' : '"Go on", "Mmm", "I see", "And?"'}. Nothing more.
3. SOCRATIC MODE: When you detect a logical contradiction, unexamined assumption, or shallow reasoning, ask ONE short, precise question that forces the user to defend their position. Never give the answer yourself.
4. NO FORECASTING: Never state what the economy or any system will do. Instead ask a short probing question about their evidence.
5. STUCK SIGNAL: When you receive a message containing [STUCK], you MUST:
   a. Summarize the current logic chain into exactly 3 bullet points.
   b. Ask: ${isZh ? '"基于这些，你的论点还成立吗？"' : '"Based on this, does your thesis still hold?"'}

CRITICAL OUTPUT RULES:
- NEVER show your thinking, reasoning, or analysis. Output ONLY the question or backchannel — nothing else.
- Keep every response to ONE sentence max. Be sharp and direct.
- No preambles, no explanations — just the question.
- RESPOND ONLY IN ${isZh ? "CHINESE" : "ENGLISH"}.

Your role is a mirror, not a guide. Reflect thinking back. Challenge it. Never complete it.`;
};

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  messages: Message[];
  sessionId: string;
  isStuck?: boolean;
  language?: "en" | "zh";
}

const tavilySearch = async (query: string): Promise<string> => {
  const cfg = await getConfig();
  const apiKey = cfg?.tavilyKey;
  if (!apiKey) return "No search API key configured.";

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: 3,
    }),
  });

  if (!res.ok) return "Search unavailable.";
  const data = await res.json();
  return (data.results || [])
    .slice(0, 2)
    .map((r: { title: string; content: string; url: string }) => `• ${r.title}: ${r.content.slice(0, 200)}... (${r.url})`)
    .join("\n");
};

const appendToSession = async (sessionId: string, role: string, content: string) => {
  const sessionsDir = path.join(DATA_DIR, "sessions");
  await mkdir(sessionsDir, { recursive: true });
  const filePath = path.join(sessionsDir, `thinking_log_${sessionId}.md`);
  const timestamp = new Date().toISOString();
  const entry = `\n### [${timestamp}] ${role.toUpperCase()}\n${content}\n`;
  await appendFile(filePath, entry, "utf8");
};

const initSession = async (sessionId: string) => {
  const sessionsDir = path.join(DATA_DIR, "sessions");
  await mkdir(sessionsDir, { recursive: true });
  const filePath = path.join(sessionsDir, `thinking_log_${sessionId}.md`);
  const header = `# Socrates Rubber Duck — Thinking Session\nStarted: ${new Date().toISOString()}\nSession ID: ${sessionId}\n\n---\n`;
  await writeFile(filePath, header, { flag: "wx" }).catch(() => {});
};

function buildOpenAIClient(cfg: AppConfig): OpenAI {
  const { provider, apiKey, endpoint } = cfg;
  if (provider === "azure") {
    const model = cfg.model?.trim() || DEFAULT_MODELS.azure;
    return new AzureOpenAI({
      apiKey,
      endpoint: endpoint!,
      apiVersion: "2025-01-01-preview",
      deployment: model,
    });
  }
  const baseURL = endpoint?.trim() || PROVIDER_BASE_URLS[provider];
  return new OpenAI({ apiKey, baseURL });
}

function buildSSEStream(
  gen: () => AsyncGenerator<string>,
  onComplete: (text: string) => void
): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      let fullResponse = "";
      for await (const text of gen()) {
        fullResponse += text;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
      onComplete(fullResponse);
    },
  });
}

async function streamAnthropicResponse(
  cfg: AppConfig,
  messages: Message[],
  lastContent: string,
  language: "en" | "zh",
  onComplete: (text: string) => void
): Promise<ReadableStream> {
  const client = new Anthropic({ apiKey: cfg.apiKey });

  const anthropicMessages: Anthropic.MessageParam[] = messages.map((m, i) => {
    const isLast = i === messages.length - 1;
    if (isLast && m.role === "user") {
      return {
        role: "user",
        content: [
          {
            type: "text",
            text: lastContent,
            cache_control: { type: "ephemeral" },
          } as Anthropic.TextBlockParam & { cache_control: { type: "ephemeral" } },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  const stream = await client.messages.stream({
    model: cfg.model?.trim() || DEFAULT_MODELS.anthropic,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: getSystemPrompt(language),
        cache_control: { type: "ephemeral" },
      } as Anthropic.TextBlockParam & { cache_control: { type: "ephemeral" } },
    ],
    messages: anthropicMessages,
  });

  return buildSSEStream(async function* () {
    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        yield chunk.delta.text;
      }
    }
  }, onComplete);
}

async function streamOpenAICompatResponse(
  cfg: AppConfig,
  messages: Message[],
  lastContent: string,
  language: "en" | "zh",
  onComplete: (text: string) => void
): Promise<ReadableStream> {
  const client = buildOpenAIClient(cfg);
  const model = cfg.model?.trim() || DEFAULT_MODELS[cfg.provider];

  const openAIMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: getSystemPrompt(language) },
    ...messages.slice(0, -1).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: lastContent },
  ];

  const stream = await client.chat.completions.create({
    model,
    max_tokens: 1024,
    stream: true,
    messages: openAIMessages,
  });

  return buildSSEStream(async function* () {
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  }, onComplete);
}

export async function POST(req: NextRequest) {
  try {
    const cfg = await getConfig();
    if (!cfg?.apiKey) {
      return NextResponse.json({ error: "Not configured" }, { status: 401 });
    }

    const body: RequestBody = await req.json();
    const { messages, sessionId, isStuck, language = "en" } = body;

    await initSession(sessionId);

    const lastUserMsg = messages[messages.length - 1]?.content || "";
    await appendToSession(sessionId, "user", lastUserMsg);

    const recentText = messages
      .slice(-5)
      .map((m) => m.content)
      .join(" ");

    let searchResults = "";
    if (isStuck) {
      searchResults = await tavilySearch(recentText.slice(0, 200));
    }

    const lastContent = isStuck
      ? `[STUCK]\n\nRecent discussion context: ${recentText.slice(0, 500)}\n\nWeb search results:\n${searchResults}`
      : lastUserMsg;

    const onComplete = (text: string) => appendToSession(sessionId, "assistant", text);

    const stream =
      cfg.provider === "anthropic"
        ? await streamAnthropicResponse(cfg, messages, lastContent, language, onComplete)
        : await streamOpenAICompatResponse(cfg, messages, lastContent, language, onComplete);

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
