import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

function _getWhisperApiKey(cfg: { provider: string; apiKey: string; openaiKeyForWhisper?: string }): string | null {
  if (cfg.openaiKeyForWhisper) return cfg.openaiKeyForWhisper;
  if (cfg.provider === "openai") return cfg.apiKey;
  return null;
}

export async function GET() {
  const cfg = await getConfig();
  if (!cfg) {
    return NextResponse.json({ available: false });
  }
  const whisperKey = _getWhisperApiKey(cfg);
  return NextResponse.json({ available: !!whisperKey });
}

export async function POST(req: NextRequest) {
  try {
    const cfg = await getConfig();
    if (!cfg?.apiKey) {
      return NextResponse.json({ error: "Not configured" }, { status: 401 });
    }

    const whisperKey = _getWhisperApiKey(cfg);
    if (!whisperKey) {
      return NextResponse.json(
        { error: "No OpenAI key configured for Whisper transcription" },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey: whisperKey });

    const transcription = await client.audio.transcriptions.create({
      file: audioFile,
      model: "gpt-4o-mini-transcribe",
    });
    return NextResponse.json({ text: transcription.text });
  } catch (err) {
    console.error("Transcription error:", err);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}
