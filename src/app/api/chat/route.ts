import { NextRequest, NextResponse } from "next/server";
import { answerWithRAG, PromptSettings } from "@/lib/rag";
import { getCollection } from "@/lib/mongodb";
import { ChatLog, Agent, Lead, ChatLogSource } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { checkRateLimit, getClientIP, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

// メールアドレスを検出する正規表現
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

// 連絡先情報を抽出する関数
function extractContactInfo(message: string): { email?: string; name?: string } {
  const result: { email?: string; name?: string } = {};

  // メールアドレスを抽出
  const emailMatch = message.match(EMAIL_REGEX);
  if (emailMatch) {
    result.email = emailMatch[0];
  }

  // 名前を抽出（メールアドレスの前にある文字列、または「名前は」「私は」等の後）
  const namePatterns = [
    /(?:名前は|私は|私の名前は)\s*([^\s、。,\.@]+)/,
    /^([^\s、。,\.@]+)\s*(?:です|と申します|といいます)/,
    /([^\s、。,\.@]+)\s+[a-zA-Z0-9._%+-]+@/,  // メールの前の名前
  ];

  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match && match[1] && match[1].length >= 2 && match[1].length <= 20) {
      result.name = match[1];
      break;
    }
  }

  return result;
}

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

    const { companyId, agentId, message, sessionId: existingSessionId, language, pageUrl, deviceType, source } = await req.json();

    // sourceのバリデーション（指定がない場合はデフォルトで"website"）
    const validSources: ChatLogSource[] = ["website", "admin_test", "preview"];
    const chatSource: ChatLogSource = validSources.includes(source) ? source : "website";

    console.log("[Chat] Received - pageUrl:", pageUrl, "deviceType:", deviceType, "source:", chatSource);

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
        pageUrl: pageUrl || undefined,
        deviceType: deviceType || undefined,
        source: chatSource,
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
    let customPromptAddition: string | null = null; // プロンプトモード用の追加プロンプト
    let followUpButtons: { id?: string; label: string; query: string; response?: string; responseType?: string; responsePrompt?: string; followUpButtons?: unknown[] }[] | null = null;

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
            // このボタンがマッチするかチェック（queryのみでマッチ）
            if (btn.query === message) {
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
          // responseTypeによって処理を分岐
          if (matchingButton.responseType === "prompt" && matchingButton.responsePrompt?.trim()) {
            // プロンプトモード: AIに追加プロンプトを渡す
            customPromptAddition = matchingButton.responsePrompt;
          } else if (matchingButton.response && matchingButton.response.trim()) {
            // テキストモード（デフォルト）: 固定テキストを返す
            customResponse = matchingButton.response;
          }
          // フォローアップボタンがあれば設定
          if (matchingButton.followUpButtons && matchingButton.followUpButtons.length > 0) {
            followUpButtons = matchingButton.followUpButtons;
          }
        }
      }

      // プロンプト設定を取得
      if (agent.systemPrompt || agent.knowledge || agent.style || agent.ngResponses || customPromptAddition) {
        promptSettings = {
          systemPrompt: agent.systemPrompt,
          knowledge: agent.knowledge,
          style: agent.style,
          ngResponses: agent.ngResponses,
          guardrails: agent.guardrails,
        };
        // プロンプトモードの追加プロンプトを付加
        if (customPromptAddition) {
          promptSettings.systemPrompt = (promptSettings.systemPrompt || "") +
            "\n\n【この質問への回答指示】\n" + customPromptAddition;
        }
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

    // アシスタントメッセージを保存 & エージェントの最終使用日を更新
    await Promise.all([
      chatLogsCol.insertOne({
        companyId,
        agentId: agentId || "default",
        sessionId,
        role: "assistant",
        content: reply,
        pageUrl: pageUrl || undefined,
        deviceType: deviceType || undefined,
        source: chatSource,
        createdAt: new Date(),
      }),
      // 最終使用日を更新（無料エージェント自動削除用）
      agentsCol && agentId
        ? agentsCol.updateOne({ agentId }, { $set: { lastUsedAt: new Date() } })
        : Promise.resolve(),
    ]);

    // 連絡先情報を検出してリードとして保存
    const contactInfo = extractContactInfo(message);
    if (contactInfo.email) {
      const leadsCol = await getCollection<Lead>("leads");

      // 既存のリードを確認（同じセッションまたは同じメールアドレス）
      const existingLead = await leadsCol.findOne({
        companyId,
        $or: [
          { sessionId },
          { email: contactInfo.email },
        ],
      });

      if (existingLead) {
        // 既存リードを更新
        await leadsCol.updateOne(
          { _id: existingLead._id },
          {
            $set: {
              ...(contactInfo.name && { name: contactInfo.name }),
              ...(contactInfo.email && { email: contactInfo.email }),
              // 問い合わせ内容がまだない場合は追加
              ...(!existingLead.inquiry && { inquiry: message }),
              updatedAt: new Date(),
            },
          }
        );
        console.log("[Lead] Updated existing lead:", existingLead.leadId);
      } else {
        // 新規リードを作成
        const newLead: Lead = {
          leadId: uuidv4(),
          companyId,
          agentId: agentId || "default",
          sessionId,
          name: contactInfo.name,
          email: contactInfo.email,
          inquiry: message, // 問い合わせ内容を保存
          pageUrl: pageUrl || undefined,
          deviceType: deviceType || undefined,
          status: "new",
          createdAt: new Date(),
        };
        await leadsCol.insertOne(newLead);
        console.log("[Lead] Created new lead:", newLead.leadId, contactInfo);
      }
    }

    return NextResponse.json({ reply, sessionId, relatedLinks, followUpButtons });
  } catch (error) {
    console.error("[Chat] Error:", error);
    return NextResponse.json(
      { error: "チャットの処理中にエラーが発生しました" },
      { status: 500 }
    );
  }
}
