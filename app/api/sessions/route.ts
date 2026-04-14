import { NextResponse } from "next/server";
import { readdir, readFile, stat } from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/config";
import { extractSessionPreview, parseSessionFile } from "@/lib/session-parser";

interface SessionListItem {
  id: string;
  startedAt: string;
  preview: string;
  messageCount: number;
}

export async function GET() {
  const sessionsDir = path.join(DATA_DIR, "sessions");

  try {
    const files = await readdir(sessionsDir);
    const mdFiles = files.filter(
      (f) => f.startsWith("thinking_log_") && f.endsWith(".md")
    );

    const sessions: SessionListItem[] = [];

    for (const file of mdFiles) {
      const sessionId = file.replace("thinking_log_", "").replace(".md", "");
      const filePath = path.join(sessionsDir, file);

      try {
        const [raw, fstat] = await Promise.all([
          readFile(filePath, "utf8"),
          stat(filePath),
        ]);

        const startedMatch = raw.match(/^Started:\s*(.+)$/m);
        const startedAt = startedMatch?.[1]?.trim() ?? fstat.mtime.toISOString();
        const preview = extractSessionPreview(raw);
        const parsed = parseSessionFile(raw, sessionId);

        sessions.push({
          id: sessionId,
          startedAt,
          preview,
          messageCount: parsed.messages.length,
        });
      } catch {
        // skip unreadable files
      }
    }

    // Sort newest first, cap at 50
    sessions.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    const capped = sessions.slice(0, 50);

    return NextResponse.json({ sessions: capped });
  } catch {
    return NextResponse.json({ sessions: [] });
  }
}
