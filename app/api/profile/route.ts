import { NextRequest, NextResponse } from "next/server";
import { readProfile } from "@/lib/learner-profile";

export async function GET() {
  try {
    const profile = await readProfile();
    return NextResponse.json({ profile });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to read profile" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === "update") {
      // Dynamic import to avoid edge runtime issues
      const { _runProfileUpdateManual } = await import("@/lib/profile-updater");
      await _runProfileUpdateManual();
      const profile = await readProfile();
      return NextResponse.json({ ok: true, profile });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
