import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";
import { toFile } from "openai";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("audio") as File | null;
  const language = formData.get("language") as string | null;

  if (!file) {
    return NextResponse.json(
      { error: "audio file is required" },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();

  // 音声ファイルが短すぎる場合はスキップ
  if (arrayBuffer.byteLength < 1000) {
    console.log("[STT] Audio file too small, skipping:", arrayBuffer.byteLength, "bytes");
    return NextResponse.json({ text: "" });
  }

  // ファイル名とMIMEタイプを決定
  let fileName = file.name || "audio.webm";
  const mimeType = file.type || "audio/webm";

  // MIMEタイプに応じてファイル名の拡張子を修正
  if (mimeType.includes("mp4") && !fileName.endsWith(".mp4")) {
    fileName = "audio.mp4";
  } else if (mimeType.includes("webm") && !fileName.endsWith(".webm")) {
    fileName = "audio.webm";
  } else if (mimeType.includes("wav") && !fileName.endsWith(".wav")) {
    fileName = "audio.wav";
  }

  console.log("[STT] Processing file:", fileName, "mimeType:", mimeType, "size:", arrayBuffer.byteLength);

  const openai = getOpenAI();

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: await toFile(arrayBuffer, fileName),
      model: "whisper-1",
      language: language || "ja", // デフォルトは日本語
      prompt: "これは日本語または英語の音声です。", // 認識精度向上のためのヒント
    });

    console.log("[STT] Transcription result:", transcription.text);
    return NextResponse.json({ text: transcription.text });
  } catch (error) {
    console.error("[STT] Transcription error:", error);
    // audio_too_short エラーの場合は空文字を返す
    if (error instanceof Error && error.message.includes("too short")) {
      return NextResponse.json({ text: "" });
    }
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 500 }
    );
  }
}
