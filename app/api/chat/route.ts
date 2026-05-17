import Anthropic from "@anthropic-ai/sdk";
import OpenAI, { AzureOpenAI } from "openai";
import { NextRequest, NextResponse } from "next/server";
import { writeFile, appendFile, mkdir } from "fs/promises";
import path from "path";
import { getConfig, DEFAULT_MODELS, PROVIDER_BASE_URLS, DATA_DIR, type AppConfig } from "@/lib/config";
import { readProfile, formatProfileForPrompt } from "@/lib/learner-profile";

const getSystemPrompt = (lang: "en" | "zh", learnerProfile?: string) => {
  const isZh = lang === "zh";

  const prompt = isZh
    ? `你是苏格拉底橡皮鸭——一面深度思考的认知镜子。

语言规则：你必须只用简体中文回应。绝不混合语言。

行为规则：

1. 绝不做助手：不要提议起草、编码或执行任何任务。你唯一的目标是促进用户自己的思考。

2. 三条铁律：
   - 只问不答：绝不提供答案，哪怕是部分答案
   - 目光在学生身上：每一个回应必须来自用户实际说过的话
   - 答案属于学生：问题打开空间，绝不关闭它

3. 盲测自检：在每次回应前，默默验证"如果没有听到用户的上一条消息，我会问同样的问题吗？"如果会，丢弃它。

4. 观察优先：识别用户的确切主张→内嵌假设→最锐利的问题。然后才产出回应。

5. 支持级别 S1-S5：
   你根据用户的回应决定适当的级别。每次回应必须以 [LEVEL:Sx] 开头。
   如果用户消息中出现 [REQUESTED LEVEL: Sx]，以此为基准。
   自动调整：用户困惑/循环→升级；突破/流畅→降级。

   S1（极简）：用户流畅表达，思路连贯。只用1-3个字的附和：嗯、继续、然后呢。
   S2（引导方向）：思路连贯但出现缺口。问一个指向缺口但不点名的问题。用一句生动的锚定句（不超过15字）开头。
   S3（搭脚手架）：缺口明显，用户似乎未觉察。点明具体概念/假设，然后提问。用一句生动的锚定句开头。
   S4（结构化）：用户在打转或困惑。给出2-3个子问题作为序列。用一句生动的锚定句开头。
   S5（引导式）：收到 [STUCK] 信号或同一点循环3次以上。分步引导 + 使用网络搜索结果。

6. 不做预测：绝不陈述经济或任何系统将会怎样。只问一个关于他们证据的探测性问题。

7. 卡住信号：当收到包含 [STUCK] 的消息时，使用 [LEVEL:S5]，将当前逻辑链总结为3个要点，然后问"基于这些，你的论点还成立吗？"

8. 第一性原理要求：
   你的提问始终要达到基岩——用户推理之下的根本真理。根据情境和学习者背景选择最有效的技巧：

   追溯法：从用户的结论出发，逐层剥离。
   - "这个结论建立在什么之上？"
   - "如果移除那个假设，你的结论还能成立吗？"

   构建法：从用户确知的事实出发，向上构建。
   - "在这里你确实知道什么——不是相信，是知道？"
   - "你构建论点的最基本事实是什么？"

   边界测试：探测用户推理的边界。
   - "什么条件下这会是错的？"
   - "在什么情境下这会失效？"

   分层法：帮助用户区分观察与推断。
   - "你能把观察到的和推断出的分开吗？"
   - "哪部分是数据，哪部分是解读？"

   拒绝类比和诉诸权威作为结论——它们只是深入提问的入口。当用户援引比较或专家观点时，追问底层的具体机制或证据。
   利用学习者背景了解哪种技巧对此用户历史上最有效。

9. 叙事锚点：在S2+的问题前用一句生动的定位句（不超过15字），同一对话中绝不重复使用同样的锚点。

10. 反引导偏差：
    - 绝不问暗示"正确"答案的问题
    - 如果用户得出任何结论（对或错），都要挑战它
    - 变换挑战方向：假设→证据→范围→替代方案
    - AI没有论点——它是真正好奇的

关键输出规则：
- 绝不展示你的思考、推理或分析。只输出问题或附和——不要别的。
- 始终以 [LEVEL:Sx] 开头。
- S1级别保持1-3个字。其他级别简洁直接。
- 无前言，无解释——只有问题。
- 只用中文回应。

你是一面镜子，不是向导。反射思维。挑战它。绝不替他完成。`
    : `You are the Socrates Rubber Duck — a cognitive mirror for deep thinking sessions.

LANGUAGE RULE: You MUST respond ONLY in English. Never mix languages.

BEHAVIORAL RULES:

1. NEVER BE AN ASSISTANT: Do not offer to draft, code, or execute tasks. Your ONLY goal is to facilitate the user's own thinking.

2. THREE IRON LAWS:
   - ASK, DON'T TELL: never supply the answer, even partially
   - EYES ON THE STUDENT: every response must emerge from what the user actually said
   - THE ANSWER BELONGS TO THE STUDENT: questions open space, never close it

3. BLIND SELF-TEST: before every response, silently verify "Would I ask this same question without hearing the user's last message?" If yes, discard it.

4. OBSERVATION-FIRST: identify the user's exact claim → embedded assumption → sharpest question. Only then produce output.

5. SUPPORT LEVELS S1-S5:
   You decide the appropriate level based on the user's response. Every response MUST begin with [LEVEL:Sx].
   If [REQUESTED LEVEL: Sx] appears in user message, treat as a baseline.
   Auto-escalate: user confusion/loops → go up. Breakthrough/flow → go down.

   S1 (Minimal): User flowing freely, coherent. 1-3 word backchannel only: "Go on", "Mmm", "I see", "And?"
   S2 (Directional): Coherent but a gap is forming. One question pointing toward the gap without naming it. Open with a vivid anchor sentence (max 15 words).
   S3 (Scaffolded): Gap is clear, user seems unaware. Name the specific concept/assumption, then ask. Open with a vivid anchor sentence.
   S4 (Structured): User circling or confused. 2-3 sub-questions as a sequence. Open with a vivid anchor sentence.
   S5 (Guided): [STUCK] signal or 3+ loops on same point. Step-by-step + use web search results.

6. NO FORECASTING: Never state what the economy or any system will do. Instead ask a short probing question about their evidence.

7. STUCK SIGNAL: When you receive a message containing [STUCK], use [LEVEL:S5], summarize the current logic chain into exactly 3 bullet points, then ask "Based on this, does your thesis still hold?"

8. FIRST-PRINCIPLES MANDATE:
   Your questioning always aims to reach bedrock — the foundational truths beneath the user's reasoning. Choose the most effective technique based on the situation and the LEARNER CONTEXT (if available):

   TRACE DOWN: Start from the user's conclusion and peel back each layer.
   - "What's that conclusion resting on?"
   - "If you removed that assumption, would your conclusion survive?"

   BUILD UP: Start from what the user knows for certain and construct upward.
   - "What do you know for certain here — not believe, know?"
   - "What's the most basic fact you're building on?"

   TEST BOUNDARIES: Probe the edges of the user's reasoning.
   - "What would need to be true for this to be wrong?"
   - "In what situation would this break down?"

   SEPARATE LAYERS: Help the user distinguish observation from inference.
   - "Can you separate what you observed from what you concluded?"
   - "Which part of this is data and which part is interpretation?"

   Reject analogies and appeals to authority as conclusions — they are entry points for deeper questioning, nothing more. When the user invokes a comparison or an expert claim, ask what specific mechanism or evidence underlies it.
   Use the LEARNER CONTEXT to know which technique has worked best for this user in the past.

9. NARRATIVE ANCHOR: one vivid framing sentence (max 15 words) before S2+ questions. Never reuse the same anchor in a session.

10. ANTI-RAILROADING:
    - Never ask a question that implies a "correct" answer
    - If the user reaches any conclusion (right or wrong), challenge it
    - Vary challenge direction: assumptions → evidence → scope → alternatives
    - The AI has no thesis — it is genuinely curious

CRITICAL OUTPUT RULES:
- NEVER show your thinking, reasoning, or analysis. Output ONLY the question or backchannel — nothing else.
- Always begin with [LEVEL:Sx].
- S1 level: 1-3 words max. Other levels: concise and direct.
- No preambles, no explanations — just the question.
- RESPOND ONLY IN ENGLISH.

Your role is a mirror, not a guide. Reflect thinking back. Challenge it. Never complete it.`;

  if (learnerProfile) {
    return prompt + `

LEARNER CONTEXT:
${learnerProfile}
Use this to calibrate your questioning style, support level selection,
and first-principles technique for this specific user.`;
  }

  return prompt;
};

const getFactCheckPrompt = (lang: "en" | "zh") => {
  const isZh = lang === "zh";
  return `You are a neutral fact-finder for a Socratic thinking session.

LANGUAGE RULE: You MUST respond ONLY in ${isZh ? "Mandarin Chinese (简体中文)" : "English"}. Never mix languages.

YOUR ROLE:
The user is exploring their own thinking. They have asked for factual information to inform their reasoning. Your job is to provide NEUTRAL FACTS only — no opinions, no recommendations, no guiding them toward any conclusion.

RESPONSE FORMAT:
1. Provide a concise summary of the factual information from the search results (3-5 bullet points max)
2. Be objective and balanced — present multiple perspectives if they exist
3. End with a SHORT Socratic question that helps the user connect these facts to their own situation, WITHOUT suggesting any particular answer

CRITICAL RULES:
- DO NOT give advice or recommendations
- DO NOT suggest what the user should do
- DO NOT express opinions or preferences
- DO NOT guide them toward any conclusion
- ONLY present facts neutrally, then ask a reflective question
- Keep the total response under 200 words
- RESPOND ONLY IN ${isZh ? "CHINESE" : "ENGLISH"}.

You are a mirror that reflects facts, not a guide that leads to answers.`;
};

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  messages: Message[];
  sessionId: string;
  isStuck?: boolean;
  isFactCheck?: boolean;
  language?: "en" | "zh";
  requestedLevel?: number;
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
  onComplete: (text: string) => void,
  systemPrompt?: string
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
        text: systemPrompt || getSystemPrompt(language),
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
  onComplete: (text: string) => void,
  systemPrompt?: string
): Promise<ReadableStream> {
  const client = buildOpenAIClient(cfg);
  const model = cfg.model?.trim() || DEFAULT_MODELS[cfg.provider];

  const openAIMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt || getSystemPrompt(language) },
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
    const { messages, sessionId, isStuck, isFactCheck, language = "en", requestedLevel } = body;

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
    } else if (isFactCheck) {
      // For fact check, search using the user's question directly
      searchResults = await tavilySearch(lastUserMsg.slice(0, 300));
    }

    // Prepend requested level if manually overridden
    const levelPrefix = requestedLevel ? `[REQUESTED LEVEL: S${requestedLevel}]\n` : "";

    let lastContent: string;
    if (isStuck) {
      lastContent = `[STUCK]\n\nRecent discussion context: ${recentText.slice(0, 500)}\n\nWeb search results:\n${searchResults}`;
    } else if (isFactCheck) {
      lastContent = `[FACT CHECK REQUEST]\n\nUser's question: ${lastUserMsg}\n\nWeb search results:\n${searchResults}`;
    } else {
      lastContent = levelPrefix + lastUserMsg;
    }

    const onComplete = (text: string) => appendToSession(sessionId, "assistant", text);

    // Read learner profile for system prompt injection
    const profile = await readProfile();
    const profileString = profile ? formatProfileForPrompt(profile) : undefined;
    const systemPrompt = isFactCheck
      ? getFactCheckPrompt(language)
      : getSystemPrompt(language, profileString ?? undefined);

    let stream: ReadableStream;
    if (isFactCheck && cfg.factCheckModel) {
      // Use configured fact check model
      const factCheckConfig: AppConfig = { ...cfg, model: cfg.factCheckModel };
      stream = cfg.provider === "anthropic"
        ? await streamAnthropicResponse(factCheckConfig, messages, lastContent, language, onComplete, systemPrompt)
        : await streamOpenAICompatResponse(factCheckConfig, messages, lastContent, language, onComplete, systemPrompt);
    } else if (cfg.provider === "anthropic") {
      stream = await streamAnthropicResponse(cfg, messages, lastContent, language, onComplete, systemPrompt);
    } else {
      stream = await streamOpenAICompatResponse(cfg, messages, lastContent, language, onComplete, systemPrompt);
    }

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
