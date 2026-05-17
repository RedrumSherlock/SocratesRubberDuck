import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/config";

export interface LearnerProfile {
  lastUpdated: string;
  personality: {
    thinkingStyle: string;
    strengths: string[];
    weaknesses: string[];
    responseToChallenge: string;
  };
  learningPatterns: {
    effectiveApproaches: string[];
    needsHelpWith: string[];
    preferredQuestionStyle: string;
  };
  sessionHistory: Array<{
    date: string;
    topics: string[];
    keyInsight: string;
    struggledWith: string;
  }>;
}

const PROFILE_PATH = path.join(DATA_DIR, "learner_profile.json");

export async function readProfile(): Promise<LearnerProfile | null> {
  try {
    const raw = await readFile(PROFILE_PATH, "utf8");
    return JSON.parse(raw) as LearnerProfile;
  } catch {
    return null;
  }
}

export async function writeProfile(profile: LearnerProfile): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(PROFILE_PATH, JSON.stringify(profile, null, 2), "utf8");
}

export function createEmptyProfile(): LearnerProfile {
  return {
    lastUpdated: new Date(0).toISOString(),
    personality: {
      thinkingStyle: "",
      strengths: [],
      weaknesses: [],
      responseToChallenge: "",
    },
    learningPatterns: {
      effectiveApproaches: [],
      needsHelpWith: [],
      preferredQuestionStyle: "",
    },
    sessionHistory: [],
  };
}

export function formatProfileForPrompt(profile: LearnerProfile): string | null {
  const hasPersonality =
    profile.personality.thinkingStyle ||
    profile.personality.strengths.length > 0 ||
    profile.personality.weaknesses.length > 0 ||
    profile.personality.responseToChallenge;
  const hasPatterns =
    profile.learningPatterns.effectiveApproaches.length > 0 ||
    profile.learningPatterns.needsHelpWith.length > 0 ||
    profile.learningPatterns.preferredQuestionStyle;
  const hasHistory = profile.sessionHistory.length > 0;

  if (!hasPersonality && !hasPatterns && !hasHistory) return null;

  const lines: string[] = [];

  if (hasPersonality) {
    lines.push("Personality:");
    if (profile.personality.thinkingStyle)
      lines.push(`  Thinking style: ${profile.personality.thinkingStyle}`);
    if (profile.personality.strengths.length > 0)
      lines.push(`  Strengths: ${profile.personality.strengths.join(", ")}`);
    if (profile.personality.weaknesses.length > 0)
      lines.push(`  Weaknesses: ${profile.personality.weaknesses.join(", ")}`);
    if (profile.personality.responseToChallenge)
      lines.push(`  Response to challenge: ${profile.personality.responseToChallenge}`);
  }

  if (hasPatterns) {
    lines.push("Learning patterns:");
    if (profile.learningPatterns.effectiveApproaches.length > 0)
      lines.push(`  Effective approaches: ${profile.learningPatterns.effectiveApproaches.join(", ")}`);
    if (profile.learningPatterns.needsHelpWith.length > 0)
      lines.push(`  Needs help with: ${profile.learningPatterns.needsHelpWith.join(", ")}`);
    if (profile.learningPatterns.preferredQuestionStyle)
      lines.push(`  Preferred question style: ${profile.learningPatterns.preferredQuestionStyle}`);
  }

  if (hasHistory) {
    const recent = profile.sessionHistory.slice(-5);
    lines.push("Recent sessions:");
    for (const s of recent) {
      lines.push(`  [${s.date}] Topics: ${s.topics.join(", ")} | Insight: ${s.keyInsight} | Struggled: ${s.struggledWith}`);
    }
  }

  return lines.join("\n");
}
