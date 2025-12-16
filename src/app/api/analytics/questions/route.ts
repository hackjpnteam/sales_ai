// [Analytics] 質問分析API（Pro機能）
import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { AnalyticsEvent, Company, User, Agent } from "@/lib/types";
import { isProPlan, getDateRange, QUESTION_CATEGORIES } from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { getOpenAI } from "@/lib/openai";

// ユーザーが会社にアクセスできるか確認
async function canAccessCompany(userId: string, userEmail: string | null | undefined, companyId: string): Promise<boolean> {
  const usersCol = await getCollection<User>("users");
  const agentsCol = await getCollection<Agent>("agents");

  const user = await usersCol.findOne({ userId });
  if (user?.companyIds?.includes(companyId)) {
    return true;
  }

  const agent = await agentsCol.findOne({ companyId });
  if (agent?.sharedWith?.some(
    (shared) => shared.email === userEmail || shared.userId === userId
  )) {
    return true;
  }

  return false;
}

// 質問をAIでカテゴリ分類
async function categorizeQuestion(text: string): Promise<{
  category: string;
  sentiment: string;
  intentScore: number;
}> {
  try {
    const openai = getOpenAI();

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `あなたは質問分析の専門家です。以下の質問を分析して、JSON形式で回答してください。

カテゴリ（1つ選択）: ${QUESTION_CATEGORIES.join(", ")}
感情: 興味高い, 検討中, 不安, 不満, クレーム, 中立
購入意欲スコア: 0-100の数値

回答形式:
{"category": "カテゴリ", "sentiment": "感情", "intentScore": 数値}`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      temperature: 0.3,
      max_tokens: 100,
    });

    const content = response.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error("[Analytics] Question categorization error:", error);
  }

  return {
    category: "その他",
    sentiment: "中立",
    intentScore: 50,
  };
}

export async function GET(req: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = req.nextUrl.searchParams.get("companyId");
    const period = req.nextUrl.searchParams.get("period") || "7days";

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    // 会社アクセス権限チェック
    if (!await canAccessCompany(session.user.id, session.user.email, companyId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Proプランチェック
    const companiesCol = await getCollection<Company>("companies");
    const company = await companiesCol.findOne({ companyId });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (!isProPlan(company.plan)) {
      return NextResponse.json(
        { error: "This feature requires Pro plan", code: "PRO_REQUIRED" },
        { status: 403 }
      );
    }

    const { from, to } = getDateRange(period);
    const eventsCol = await getCollection<AnalyticsEvent>("analytics_events");

    // ユーザーメッセージを取得（カテゴリが未設定のもの優先）
    const userMessages = await eventsCol
      .find({
        companyId,
        type: "chat_message_user",
        createdAt: { $gte: from, $lte: to },
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    // カテゴリが設定されているものを集計
    const categorizedMessages = userMessages.filter((m) => m.aiCategory);
    const categoryStats: Record<string, { count: number; messages: string[] }> = {};

    QUESTION_CATEGORIES.forEach((cat) => {
      categoryStats[cat] = { count: 0, messages: [] };
    });

    categorizedMessages.forEach((msg) => {
      const cat = msg.aiCategory || "その他";
      if (categoryStats[cat]) {
        categoryStats[cat].count++;
        if (categoryStats[cat].messages.length < 5) {
          categoryStats[cat].messages.push(msg.messageText || "");
        }
      }
    });

    // カテゴリ未設定のメッセージを非同期でカテゴリ分類（最大10件）
    const uncategorizedMessages = userMessages
      .filter((m) => !m.aiCategory && m.messageText)
      .slice(0, 10);

    if (uncategorizedMessages.length > 0) {
      // バックグラウンドで分類処理（レスポンスを待たない）
      Promise.all(
        uncategorizedMessages.map(async (msg) => {
          const result = await categorizeQuestion(msg.messageText || "");
          await eventsCol.updateOne(
            { _id: msg._id },
            {
              $set: {
                aiCategory: result.category,
                aiSentiment: result.sentiment,
                aiIntentScore: result.intentScore,
              },
            }
          );
        })
      ).catch(console.error);
    }

    // 感情分析の統計
    const sentimentStats = await eventsCol
      .aggregate([
        {
          $match: {
            companyId,
            type: "chat_message_user",
            createdAt: { $gte: from, $lte: to },
            aiSentiment: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: "$aiSentiment",
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();

    // 購入意欲スコアの平均
    const intentStats = await eventsCol
      .aggregate([
        {
          $match: {
            companyId,
            type: "chat_message_user",
            createdAt: { $gte: from, $lte: to },
            aiIntentScore: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            avgScore: { $avg: "$aiIntentScore" },
            highIntent: {
              $sum: { $cond: [{ $gte: ["$aiIntentScore", 70] }, 1, 0] },
            },
            mediumIntent: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $gte: ["$aiIntentScore", 40] },
                      { $lt: ["$aiIntentScore", 70] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            lowIntent: {
              $sum: { $cond: [{ $lt: ["$aiIntentScore", 40] }, 1, 0] },
            },
          },
        },
      ])
      .toArray();

    // 最近の質問例を取得
    const recentQuestions = userMessages
      .filter((m) => m.messageText)
      .slice(0, 20)
      .map((m) => ({
        text: m.messageText,
        category: m.aiCategory || null,
        sentiment: m.aiSentiment || null,
        intentScore: m.aiIntentScore || null,
        createdAt: m.createdAt,
      }));

    return NextResponse.json({
      period: { from: from.toISOString(), to: to.toISOString() },
      totalQuestions: userMessages.length,
      categorizedCount: categorizedMessages.length,
      categories: Object.entries(categoryStats)
        .map(([category, data]) => ({
          category,
          count: data.count,
          examples: data.messages,
        }))
        .sort((a, b) => b.count - a.count),
      sentiments: sentimentStats.map((s) => ({
        sentiment: s._id,
        count: s.count,
      })),
      intentAnalysis: intentStats[0] || {
        avgScore: 0,
        highIntent: 0,
        mediumIntent: 0,
        lowIntent: 0,
      },
      recentQuestions,
    });
  } catch (error) {
    console.error("[Analytics] Questions error:", error);
    return NextResponse.json(
      { error: "Failed to get question analytics" },
      { status: 500 }
    );
  }
}
