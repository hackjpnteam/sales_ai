import { NextRequest, NextResponse } from "next/server";
import { answerWithRAG, PromptSettings } from "@/lib/rag";
import { getCollection } from "@/lib/mongodb";
import { ChatLog, Agent } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";

export async function POST(req: NextRequest) {
  const { companyId, agentId, message, sessionId: existingSessionId, language } = await req.json();

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

  // エージェントのプロンプト設定を取得
  let promptSettings: PromptSettings | undefined;
  if (agentId) {
    const agentsCol = await getCollection<Agent>("agents");
    const agent = await agentsCol.findOne({ agentId });
    if (agent && (agent.systemPrompt || agent.knowledge || agent.style)) {
      promptSettings = {
        systemPrompt: agent.systemPrompt,
        knowledge: agent.knowledge,
        style: agent.style,
        guardrails: agent.guardrails,
      };
    }
  }

  // RAGで回答を生成
  const { reply, relatedLinks } = await answerWithRAG({
    companyId,
    question: message,
    language: language || "ja",
    promptSettings,
  });

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
