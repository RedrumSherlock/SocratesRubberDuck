export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ParsedSession {
  id: string;
  startedAt: string;
  messages: SessionMessage[];
}

export interface SessionPreview {
  id: string;
  startedAt: string;
  preview: string;
  messageCount: number;
}

const ENTRY_RE = /^### \[(.+?)\] (USER|ASSISTANT)\n([\s\S]*?)(?=\n### \[|$)/gm;

export function parseSessionFile(raw: string, sessionId: string): ParsedSession {
  const startedMatch = raw.match(/^Started:\s*(.+)$/m);
  const startedAt = startedMatch?.[1]?.trim() ?? "";

  const messages: SessionMessage[] = [];
  let match: RegExpExecArray | null;

  while ((match = ENTRY_RE.exec(raw)) !== null) {
    const timestamp = match[1];
    const role = match[2].toLowerCase() as "user" | "assistant";
    const content = match[3].trim();

    // Deduplicate consecutive identical (role, content) pairs
    const prev = messages[messages.length - 1];
    if (prev && prev.role === role && prev.content === content) continue;

    messages.push({ role, content, timestamp });
  }

  return { id: sessionId, startedAt, messages };
}

export function extractSessionPreview(raw: string): string {
  const match = raw.match(/^### \[.+?\] USER\n([\s\S]*?)(?=\n### \[|$)/m);
  if (!match) return "Empty session";
  const text = match[1].trim().replace(/^\[STUCK\]\s*/, "");
  return text.length > 60 ? text.slice(0, 57) + "..." : text;
}
