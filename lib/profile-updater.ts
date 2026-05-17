import { readdir, readFile } from "fs/promises";
import path from "path";
import OpenAI, { AzureOpenAI } from "openai";
import { getConfig, DEFAULT_MODELS, PROVIDER_BASE_URLS, DATA_DIR, type AppConfig } from "@/lib/config";
import { readProfile, writeProfile, createEmptyProfile, type LearnerProfile } from "@/lib/learner-profile";
import { parseSessionFile } from "@/lib/session-parser";

const PROFILE_UPDATE_PROMPT_EN = `You are analyzing transcripts from Socratic thinking sessions to build/update a learner profile.

Given the existing profile (may be empty) and new session transcripts, produce a COMPLETE updated LearnerProfile JSON.

Rules:
- Preserve existing observations unless clearly contradicted by new evidence
- Add new personality/pattern observations from the new messages
- Append to sessionHistory (keep last 20 entries max)
- Identify recurring patterns across sessions
- Be specific and evidence-based — cite actual behaviors, not generic labels
- For thinkingStyle, describe HOW they reason (by analogy, from examples, deductively, etc.)
- For strengths/weaknesses, note specific cognitive patterns observed
- For responseToChallenge, describe what happens when their ideas are questioned
- For effectiveApproaches, note what types of questions led them to breakthroughs
- For needsHelpWith, note where they consistently get stuck

Respond with ONLY valid JSON matching this schema:
{
  "lastUpdated": "<current ISO timestamp>",
  "personality": {
    "thinkingStyle": "<description>",
    "strengths": ["<strength1>", ...],
    "weaknesses": ["<weakness1>", ...],
    "responseToChallenge": "<description>"
  },
  "learningPatterns": {
    "effectiveApproaches": ["<approach1>", ...],
    "needsHelpWith": ["<area1>", ...],
    "preferredQuestionStyle": "<description>"
  },
  "sessionHistory": [
    {
      "date": "<ISO date>",
      "topics": ["<topic1>", ...],
      "keyInsight": "<what the user discovered>",
      "struggledWith": "<what was difficult>"
    }
  ]
}`;

const PROFILE_UPDATE_PROMPT_ZH = `你正在分析苏格拉底式思考对话的记录，以构建/更新学习者档案。

给定现有档案（可能为空）和新的对话记录，生成一个完整的更新后 LearnerProfile JSON。

规则：
- 保留现有观察，除非被新证据明确推翻
- 从新消息中添加新的性格/模式观察
- 追加到 sessionHistory（最多保留最近20条）
- 识别跨对话的重复模式
- 具体且基于证据——引用实际行为，而非通用标签

只返回有效的JSON，schema同英文版。`;

function _buildOpenAIClient(cfg: AppConfig): OpenAI {
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

function _msUntilNext2amET(): number {
  const now = new Date();
  // Create a date for 2 AM ET today
  // ET is UTC-5 (EST) or UTC-4 (EDT)
  const etOffset = _getETOffset(now);
  const target = new Date(now);
  target.setUTCHours(2 - etOffset, 0, 0, 0);
  // If that time has already passed today, schedule for tomorrow
  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target.getTime() - now.getTime();
}

function _getETOffset(date: Date): number {
  // Approximate EDT/EST: EDT (UTC-4) from 2nd Sunday of March to 1st Sunday of November
  const year = date.getUTCFullYear();
  const marchSecondSunday = _nthSunday(year, 2, 2); // March, 2nd Sunday
  const novFirstSunday = _nthSunday(year, 10, 1); // November, 1st Sunday
  // DST transition at 2 AM local = 7 AM UTC (EST+5) for spring, 6 AM UTC (EDT+4) for fall
  const dstStart = new Date(Date.UTC(year, 2, marchSecondSunday, 7));
  const dstEnd = new Date(Date.UTC(year, 10, novFirstSunday, 6));
  return date >= dstStart && date < dstEnd ? -4 : -5;
}

function _nthSunday(year: number, month: number, n: number): number {
  const first = new Date(Date.UTC(year, month, 1));
  const dayOfWeek = first.getUTCDay();
  const firstSunday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  return firstSunday + (n - 1) * 7;
}

async function _runProfileUpdate(): Promise<void> {
  try {
    const cfg = await getConfig();
    if (!cfg?.apiKey) return;

    let profile = await readProfile();
    if (!profile) {
      profile = createEmptyProfile();
      await writeProfile(profile);
    }

    const lastUpdated = new Date(profile.lastUpdated).getTime();

    // Read all session files
    const sessionsDir = path.join(DATA_DIR, "sessions");
    let files: string[];
    try {
      files = await readdir(sessionsDir);
    } catch {
      return; // No sessions directory yet
    }

    const sessionFiles = files.filter((f) => f.startsWith("thinking_log_") && f.endsWith(".md"));
    if (sessionFiles.length === 0) return;

    // Collect new messages from all sessions
    const newTranscripts: string[] = [];
    for (const file of sessionFiles) {
      const raw = await readFile(path.join(sessionsDir, file), "utf8");
      const sessionId = file.replace("thinking_log_", "").replace(".md", "");
      const parsed = parseSessionFile(raw, sessionId);

      const newMessages = parsed.messages.filter(
        (m) => new Date(m.timestamp).getTime() > lastUpdated
      );
      if (newMessages.length > 0) {
        newTranscripts.push(
          `--- Session ${sessionId} ---\n` +
            newMessages.map((m) => `[${m.timestamp}] ${m.role.toUpperCase()}: ${m.content}`).join("\n")
        );
      }
    }

    if (newTranscripts.length === 0) return;

    const transcript = newTranscripts.join("\n\n");
    // Detect language from transcript
    const isZh = /[\u4e00-\u9fff]/.test(transcript);
    const systemPrompt = isZh ? PROFILE_UPDATE_PROMPT_ZH : PROFILE_UPDATE_PROMPT_EN;

    const userMessage = `EXISTING PROFILE:\n${JSON.stringify(profile, null, 2)}\n\nNEW TRANSCRIPTS:\n${transcript}`;

    let responseText: string;

    if (cfg.provider === "anthropic") {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: cfg.apiKey });
      const result = await client.messages.create({
        model: cfg.model?.trim() || DEFAULT_MODELS.anthropic,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });
      responseText = result.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");
    } else {
      const client = _buildOpenAIClient(cfg);
      const model = cfg.model?.trim() || DEFAULT_MODELS[cfg.provider];
      const result = await client.chat.completions.create({
        model,
        max_tokens: 4096,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      });
      responseText = result.choices[0]?.message?.content || "";
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonText = responseText.trim();
    // Strip markdown code blocks if present
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    }
    // Also handle if the response starts with ``` but doesn't close properly
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```$/, "").trim();
    }

    let updatedProfile: LearnerProfile;
    try {
      updatedProfile = JSON.parse(jsonText) as LearnerProfile;
    } catch (parseErr) {
      console.error("[SocratesRubberDuck] Failed to parse profile JSON. Response was:", jsonText.slice(0, 500));
      throw parseErr;
    }
    updatedProfile.lastUpdated = new Date().toISOString();

    // Keep only last 20 session history entries
    if (updatedProfile.sessionHistory.length > 20) {
      updatedProfile.sessionHistory = updatedProfile.sessionHistory.slice(-20);
    }

    await writeProfile(updatedProfile);
    console.log("[SocratesRubberDuck] Learner profile updated successfully");
  } catch (err) {
    console.error("[SocratesRubberDuck] Profile update failed:", err);
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Manual trigger for API endpoint
export async function _runProfileUpdateManual(): Promise<void> {
  return _runProfileUpdate();
}

export function _scheduleProfileUpdate(): void {
  const msUntil2am = _msUntilNext2amET();
  console.log(`[SocratesRubberDuck] Profile update scheduled in ${Math.round(msUntil2am / 60000)} minutes`);

  setTimeout(() => {
    _runProfileUpdate();
    setInterval(_runProfileUpdate, MS_PER_DAY);
  }, msUntil2am);
}
