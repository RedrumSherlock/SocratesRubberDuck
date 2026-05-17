import { readdir, readFile } from "fs/promises";
import path from "path";
import OpenAI, { AzureOpenAI } from "openai";
import { getConfig, DEFAULT_MODELS, PROVIDER_BASE_URLS, DATA_DIR, type AppConfig } from "@/lib/config";
import { readProfile, writeProfile, createEmptyProfile, type LearnerProfile } from "@/lib/learner-profile";
import { parseSessionFile } from "@/lib/session-parser";

const PROFILE_UPDATE_PROMPT = `You are analyzing transcripts from Socratic thinking sessions to build/update a learner profile.

This profile will be injected into FUTURE sessions where the AI has NO access to past conversations. Therefore:

CRITICAL RULES FOR ABSTRACTION:
- NEVER reference specific session IDs, dates, or timestamps in personality/learningPatterns fields
- NEVER reference specific topics, names, projects, or domain-specific details (e.g., no "Pinnacle", "sportsbook", "Geotap")
- ALWAYS describe GENERALIZED cognitive patterns that apply across any topic
- Describe HOW the user thinks, not WHAT they discussed
- Each observation should be useful to an AI meeting this user for the first time on any subject

BAD example: "在讨论sportsbook时，能快速接受Pinnacle是sharp book并调整推理"
GOOD example: "Integrates new information quickly and adjusts existing framework without resistance when evidence is concrete"

BAD example: "对模拟盘与真实环境差异的系统性评估"
GOOD example: "Tends to skip validation of whether test conditions match real-world conditions"

PROFILE FIELD GUIDELINES:
- personality.thinkingStyle: Describe the reasoning approach — deductive, analogical, framework-first, example-driven, etc. Max 2 sentences.
- personality.strengths: General cognitive strengths (3-5 items). Each should be a transferable pattern.
- personality.weaknesses: General cognitive blind spots (3-5 items). Each should be a transferable pattern.
- personality.responseToChallenge: How the user reacts when their ideas are questioned. 1-2 sentences.
- learningPatterns.effectiveApproaches: What TYPES of Socratic techniques work (not what topics). E.g., "boundary-testing questions that ask 'what would break this'" rather than "asking about market efficiency".
- learningPatterns.needsHelpWith: General reasoning gaps, not topic-specific gaps.
- learningPatterns.preferredQuestionStyle: What question format/style triggers deeper thinking.
- sessionHistory: This field CAN contain topic-specific details since it serves as a factual log.

MERGE RULES:
- Preserve existing observations unless clearly contradicted by new evidence
- Merge similar observations — don't accumulate near-duplicates
- Keep strengths/weaknesses to 3-5 items each (merge or replace weaker observations)
- sessionHistory: append new entries, keep last 20 max

Respond in the same language as the transcripts. Use simplified Chinese if transcripts are in Chinese.

Respond with ONLY valid JSON matching this schema:
{
  "lastUpdated": "<current ISO timestamp>",
  "personality": {
    "thinkingStyle": "<generalized description>",
    "strengths": ["<pattern1>", ...],
    "weaknesses": ["<pattern1>", ...],
    "responseToChallenge": "<generalized description>"
  },
  "learningPatterns": {
    "effectiveApproaches": ["<technique1>", ...],
    "needsHelpWith": ["<gap1>", ...],
    "preferredQuestionStyle": "<generalized description>"
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

    const userMessage = `EXISTING PROFILE:\n${JSON.stringify(profile, null, 2)}\n\nNEW TRANSCRIPTS:\n${transcript}`;

    let responseText: string;

    if (cfg.provider === "anthropic") {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: cfg.apiKey });
      const result = await client.messages.create({
        model: cfg.model?.trim() || DEFAULT_MODELS.anthropic,
        max_tokens: 4096,
        system: PROFILE_UPDATE_PROMPT,
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
          { role: "system", content: PROFILE_UPDATE_PROMPT },
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
