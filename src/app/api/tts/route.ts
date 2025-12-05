import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  // テキストが長すぎる場合は短縮（TTS高速化のため）
  // 200文字程度に制限して高速化
  const maxLength = 200;
  let truncatedText = text;
  if (text.length > maxLength) {
    // 文の区切りで切る
    const sentences = text.match(/[^。！？\n]+[。！？\n]?/g) || [text];
    truncatedText = "";
    for (const sentence of sentences) {
      if (truncatedText.length + sentence.length > maxLength) break;
      truncatedText += sentence;
    }
    if (!truncatedText) truncatedText = text.slice(0, maxLength);
  }

  const openai = getOpenAI();

  // shimmer: 若い女性の声、tts-1: 高速モデル、opus: 高速フォーマット
  const audio = await openai.audio.speech.create({
    model: "tts-1",
    voice: "shimmer",
    input: truncatedText,
    response_format: "opus",
    speed: 1.1, // 少し速めに読み上げ
  });

  const buffer = Buffer.from(await audio.arrayBuffer());

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "audio/ogg",
      "Cache-Control": "public, max-age=3600", // キャッシュで高速化
    },
  });
}
