import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { writeFile, appendFile, mkdir } from "fs/promises";
import path from "path";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `You are the Socrates Rubber Duck — a bilingual (English/Mandarin) cognitive mirror for deep thinking sessions.

BEHAVIORAL RULES:
1. NEVER BE AN ASSISTANT: Do not offer to draft, code, or execute tasks. Your ONLY goal is to facilitate the user's own thinking.
2. DUCK MODE: When the user is speaking fluently and coherently, respond with ONLY a minimal backchannel (1–3 words max): "Go on", "继续", "Mmm", "I see", "说下去". Nothing more.
3. SOCRATIC MODE: When you detect a logical contradiction, unexamined assumption, or shallow reasoning, interrupt with ONE precise question that forces the user to defend their position. Never give the answer yourself.
4. NO FORECASTING: Never state what the economy or any system will do. Instead ask: "What specific indicator makes you believe that trend is sustainable?"
5. LANGUAGE MATCHING: Always respond in the same language the user is using. Native fluency — no translation feel.
6. STUCK SIGNAL: When you receive a message containing [STUCK], you MUST:
   a. Use the web_search tool to find 2 current, relevant facts about the topic being discussed.
   b. Summarize the current logic chain into exactly 3 bullet points.
   c. Present the 2 web facts.
   d. Ask: "Based on these current data points, does your thesis still hold?" (or Mandarin equivalent if conversation is in Chinese)

IMPORTANT: Your role is a mirror, not a guide. Reflect thinking back. Challenge it. Never complete it.`;

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  messages: Message[];
  sessionId: string;
  isStuck?: boolean;
}

const tavilySearch = async (query: string): Promise<string> => {
  const apiKey = process.env.TAVILY_API_KEY;
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
  const sessionsDir = path.join(process.cwd(), "sessions");
  await mkdir(sessionsDir, { recursive: true });
  const filePath = path.join(sessionsDir, `thinking_log_${sessionId}.md`);
  const timestamp = new Date().toISOString();
  const entry = `\n### [${timestamp}] ${role.toUpperCase()}\n${content}\n`;
  await appendFile(filePath, entry, "utf8");
};

const initSession = async (sessionId: string) => {
  const sessionsDir = path.join(process.cwd(), "sessions");
  await mkdir(sessionsDir, { recursive: true });
  const filePath = path.join(sessionsDir, `thinking_log_${sessionId}.md`);
  const header = `# Socrates Rubber Duck — Thinking Session\nStarted: ${new Date().toISOString()}\nSession ID: ${sessionId}\n\n---\n`;
  await writeFile(filePath, header, { flag: "wx" }).catch(() => {});
};

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();
    const { messages, sessionId, isStuck } = body;

    await initSession(sessionId);

    const lastUserMsg = messages[messages.length - 1]?.content || "";
    await appendToSession(sessionId, "user", lastUserMsg);

    // Detect topic for stuck search
    const recentText = messages
      .slice(-5)
      .map((m) => m.content)
      .join(" ");

    // Build Anthropic messages with prompt caching
    const anthropicMessages: Anthropic.MessageParam[] = messages.map((m, i) => {
      const isLast = i === messages.length - 1;
      if (isLast && m.role === "user") {
        return {
          role: "user",
          content: [
            {
              type: "text",
              text: m.content,
              cache_control: { type: "ephemeral" },
            } as Anthropic.TextBlockParam & { cache_control: { type: "ephemeral" } },
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

    let searchResults = "";
    if (isStuck) {
      searchResults = await tavilySearch(recentText.slice(0, 200));
    }

    const userContentWithSearch = isStuck
      ? `[STUCK]\n\nRecent discussion context: ${recentText.slice(0, 500)}\n\nWeb search results:\n${searchResults}`
      : lastUserMsg;

    // Replace last message with enriched content if stuck
    if (isStuck) {
      anthropicMessages[anthropicMessages.length - 1] = {
        role: "user",
        content: userContentWithSearch,
      };
    }

    const stream = await client.messages.stream({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        } as Anthropic.TextBlockParam & { cache_control: { type: "ephemeral" } },
      ],
      messages: anthropicMessages,
    });

    // Stream response back
    const encoder = new TextEncoder();
    let fullResponse = "";

    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            const text = chunk.delta.text;
            fullResponse += text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
        await appendToSession(sessionId, "assistant", fullResponse);
      },
    });

    return new NextResponse(readable, {
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
