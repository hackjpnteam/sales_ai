import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";
import { toFile } from "openai";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("audio") as File | null;

  if (!file) {
    return NextResponse.json(
      { error: "audio file is required" },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const openai = getOpenAI();

  const transcription = await openai.audio.transcriptions.create({
    file: await toFile(arrayBuffer, file.name || "audio.webm"),
    model: "whisper-1",
  });

  return NextResponse.json({ text: transcription.text });
}
