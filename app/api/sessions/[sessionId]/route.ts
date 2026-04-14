import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
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
