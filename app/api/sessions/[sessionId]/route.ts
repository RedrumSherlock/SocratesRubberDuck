import { NextRequest, NextResponse } from "next/server";
import { readFile, mkdir, rename } from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/config";
import { parseSessionFile } from "@/lib/session-parser";

interface Params {
  params: Promise<{ sessionId: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { sessionId } = await params;
  const filePath = path.join(DATA_DIR, "sessions", `thinking_log_${sessionId}.md`);

  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = parseSessionFile(raw, sessionId);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { sessionId } = await params;
  const sessionsDir = path.join(DATA_DIR, "sessions");
  const archiveDir = path.join(sessionsDir, "archive");
  const fileName = `thinking_log_${sessionId}.md`;
  const srcPath = path.join(sessionsDir, fileName);
  const destPath = path.join(archiveDir, fileName);

  try {
    // Create archive folder if it doesn't exist
    await mkdir(archiveDir, { recursive: true });
    // Move file to archive
    await rename(srcPath, destPath);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to archive session:", err);
    return NextResponse.json({ error: "Failed to archive session" }, { status: 500 });
  }
}
