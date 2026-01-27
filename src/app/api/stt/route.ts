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

  // 音声ファイルが短すぎる場合はスキップ（2KB以上必要）
  if (arrayBuffer.byteLength < 2000) {
    console.log("[STT] Audio file too small (< 2KB), skipping:", arrayBuffer.byteLength, "bytes");
    return NextResponse.json({ text: "" });
  }

  // MIMEタイプからコーデック情報を除去し、基本タイプを取得
  const rawMimeType = file.type || "audio/webm";
  const baseMimeType = rawMimeType.split(";")[0].trim(); // "audio/webm;codecs=opus" -> "audio/webm"

  // ファイル名とMIMEタイプを決定
  let fileName = "audio.webm";
  let contentType = "audio/webm";

  // MIMEタイプに応じてファイル名と content type を設定
  if (baseMimeType.includes("mp4") || baseMimeType.includes("m4a")) {
    fileName = "audio.mp4";
    contentType = "audio/mp4";
  } else if (baseMimeType.includes("webm")) {
    fileName = "audio.webm";
    contentType = "audio/webm";
  } else if (baseMimeType.includes("wav")) {
    fileName = "audio.wav";
    contentType = "audio/wav";
  } else if (baseMimeType.includes("ogg") || baseMimeType.includes("oga")) {
    fileName = "audio.ogg";
    contentType = "audio/ogg";
  } else if (baseMimeType.includes("mp3") || baseMimeType.includes("mpeg")) {
    fileName = "audio.mp3";
    contentType = "audio/mpeg";
  }

  console.log("[STT] Processing file:", fileName, "contentType:", contentType, "rawMime:", rawMimeType, "size:", arrayBuffer.byteLength);

  const openai = getOpenAI();

  try {
    // toFileを使用してOpenAI SDK互換のファイルオブジェクトを作成
    const audioFile = await toFile(
      Buffer.from(arrayBuffer),
      fileName,
      { type: contentType }
    );

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: language || "ja", // デフォルトは日本語
    });

    console.log("[STT] Transcription result:", transcription.text);

    // Whisperの幻覚応答をフィルター（音声が不明瞭な場合によく出る）
    const hallucinations = [
      "ご視聴ありがとうございました",
      "ありがとうございました",
      "Thank you for watching",
      "Thanks for watching",
      "字幕",
      "...",
    ];

    const text = transcription.text?.trim() || "";
    if (hallucinations.some(h => text.includes(h)) || text.length < 2) {
      console.log("[STT] Filtered hallucination or too short:", text);
      return NextResponse.json({ text: "" });
    }

    return NextResponse.json({ text });
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
