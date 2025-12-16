import { NextRequest, NextResponse } from "next/server";
import { answerWithRAG, PromptSettings } from "@/lib/rag";
import { getCollection } from "@/lib/mongodb";
import { ChatLog, Agent } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { checkRateLimit, getClientIP, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    // レート制限チェック
    const clientIP = getClientIP(req);
    const rateLimit = await checkRateLimit(clientIP, "chat", RATE_LIMIT_CONFIGS.chat);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらくお待ちください。" },
        { status: 429 }
      );
    }

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

    // 既存のセッションがある場合、直近の会話履歴を取得（最大6件 = 3往復）
    let conversationHistory: { role: "user" | "assistant"; content: string }[] = [];
    if (existingSessionId) {
      const recentLogs = await chatLogsCol
        .find({ sessionId, companyId })
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();

      conversationHistory = recentLogs
        .reverse()
        .map((log) => ({
          role: log.role as "user" | "assistant",
          content: log.content,
        }));
    }

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
      if (agent && (agent.systemPrompt || agent.knowledge || agent.style || agent.ngResponses)) {
        promptSettings = {
          systemPrompt: agent.systemPrompt,
          knowledge: agent.knowledge,
          style: agent.style,
          ngResponses: agent.ngResponses,
          guardrails: agent.guardrails,
        };
      }
    }

    // RAGで回答を生成（会話履歴を渡す）
    const { reply, relatedLinks } = await answerWithRAG({
      companyId,
      question: message,
      language: language || "ja",
      promptSettings,
      conversationHistory,
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
  } catch (error) {
    console.error("[Chat] Error:", error);
    return NextResponse.json(
      { error: "チャットの処理中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
