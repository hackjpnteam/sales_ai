import { NextRequest, NextResponse } from "next/server";
import { answerWithRAG } from "@/lib/rag";
import { getCollection } from "@/lib/mongodb";
import { ChatLog } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  const { companyId, agentId, message, sessionId: existingSessionId } = await req.json();

  if (!companyId || !message) {
    return NextResponse.json(
      { error: "companyId and message are required" },
      { status: 400 }
    );
  }

  // sessionId がなければ新規生成
  const sessionId = existingSessionId || uuidv4();

  // 会話ログコレクションを取得
  const chatLogsCol = await getCollection<ChatLog>("chat_logs");

  // ユーザーメッセージを保存
  await chatLogsCol.insertOne({
    companyId,
    agentId: agentId || "default",
    sessionId,
    role: "user",
    content: message,
    createdAt: new Date(),
  });

  // RAGで回答を生成
  const { reply, relatedLinks } = await answerWithRAG({ companyId, question: message });

  // アシスタントメッセージを保存
  await chatLogsCol.insertOne({
    companyId,
    agentId: agentId || "default",
    sessionId,
    role: "assistant",
    content: reply,
    createdAt: new Date(),
  });

  return NextResponse.json({ reply, sessionId, relatedLinks });
}
