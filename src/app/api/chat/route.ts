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

    // コレクションを取得
    const [chatLogsCol, agentsCol] = await Promise.all([
      getCollection<ChatLog>("chat_logs"),
      agentId ? getCollection<Agent>("agents") : Promise.resolve(null),
    ]);

    // 並列で実行: 会話履歴取得、ユーザーメッセージ保存、エージェント設定取得
    const [recentLogs, , agent] = await Promise.all([
      // 会話履歴を取得
      existingSessionId
        ? chatLogsCol.find({ sessionId, companyId }).sort({ createdAt: -1 }).limit(6).toArray()
        : Promise.resolve([]),
      // ユーザーメッセージを保存
      chatLogsCol.insertOne({
        companyId,
        agentId: agentId || "default",
        sessionId,
        role: "user",
        content: message,
        createdAt: new Date(),
      }),
      // エージェント設定を取得
      agentsCol ? agentsCol.findOne({ agentId, companyId }) : Promise.resolve(null),
    ]);

    // 会話履歴を整形
    const conversationHistory = recentLogs
      .reverse()
      .map((log) => ({
        role: log.role as "user" | "assistant",
        content: log.content,
      }));

    // エージェントのプロンプト設定を取得
    let promptSettings: PromptSettings | undefined;
    let customResponse: string | null = null;
    let followUpButtons: { id?: string; label: string; query: string; response?: string; followUpButtons?: unknown[] }[] | null = null;

    if (agent) {
      // クイックボタンのカスタム返答をチェック（5階層までのフォローアップボタンも含む）
      if (agent.quickButtons && agent.quickButtons.length > 0) {
        // 再帰的にボタンを検索する関数（最大5階層）
        const findMatchingButton = (
          buttons: typeof agent.quickButtons,
          depth: number = 0
        ): typeof agent.quickButtons[0] | null => {
          if (depth > 5) return null; // 5階層まで

          for (const btn of buttons) {
            // このボタンがマッチするかチェック
            if (btn.query === message && btn.response && btn.response.trim()) {
              return btn;
            }
            // フォローアップボタンを再帰的に検索
            if (btn.followUpButtons && btn.followUpButtons.length > 0) {
              const found = findMatchingButton(btn.followUpButtons, depth + 1);
              if (found) return found;
            }
          }
          return null;
        };

        const matchingButton = findMatchingButton(agent.quickButtons);

        if (matchingButton) {
          customResponse = matchingButton.response!;
          // フォローアップボタンがあれば設定
          if (matchingButton.followUpButtons && matchingButton.followUpButtons.length > 0) {
            followUpButtons = matchingButton.followUpButtons;
          }
        }
      }

      // プロンプト設定を取得
      if (agent.systemPrompt || agent.knowledge || agent.style || agent.ngResponses) {
        promptSettings = {
          systemPrompt: agent.systemPrompt,
          knowledge: agent.knowledge,
          style: agent.style,
          ngResponses: agent.ngResponses,
          guardrails: agent.guardrails,
        };
      }
    }

    let reply: string;
    let relatedLinks: { url: string; title: string }[] = [];

    if (customResponse) {
      // カスタム返答がある場合はそれを使用（AIを呼ばない）
      reply = customResponse;
    } else {
      // RAGで回答を生成（会話履歴を渡す）
      const ragResult = await answerWithRAG({
        companyId,
        question: message,
        language: language || "ja",
        promptSettings,
        conversationHistory,
      });
      reply = ragResult.reply;
      relatedLinks = ragResult.relatedLinks;
    }

    // アシスタントメッセージを保存
    await chatLogsCol.insertOne({
      companyId,
      agentId: agentId || "default",
      sessionId,
      role: "assistant",
      content: reply,
      createdAt: new Date(),
    });

    return NextResponse.json({ reply, sessionId, relatedLinks, followUpButtons });
  } catch (error) {
    console.error("[Chat] Error:", error);
    return NextResponse.json(
      { error: "チャットの処理中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
