// [Analytics] AI改善提案API（Pro機能）
import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { AnalyticsEvent, Company } from "@/lib/types";
import { isProPlan, getDateRange } from "@/lib/analytics";
import { auth } from "@/lib/auth";
import { getOpenAI } from "@/lib/openai";

export async function GET(req: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = req.nextUrl.searchParams.get("companyId");
    const period = req.nextUrl.searchParams.get("period") || "30days";

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
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

    const baseMatch = {
      companyId,
      createdAt: { $gte: from, $lte: to },
    };

    // 集計データを収集
    const [
      totalPV,
      sessionCount,
      chatOpens,
      conversions,
      chatSessions,
      deviceStats,
      topPages,
      categoryStats,
      recentQuestions,
    ] = await Promise.all([
      eventsCol.countDocuments({ ...baseMatch, type: "page_view" }),
      eventsCol.countDocuments({ ...baseMatch, type: "session_start" }),
      eventsCol.countDocuments({ ...baseMatch, type: "chat_open" }),
      eventsCol.countDocuments({ ...baseMatch, type: "conversion" }),
      eventsCol.distinct("sessionId", {
        ...baseMatch,
        type: { $in: ["chat_open", "chat_message_user"] },
      }),
      eventsCol
        .aggregate([
          { $match: { ...baseMatch, type: "session_start" } },
          { $group: { _id: "$deviceType", count: { $sum: 1 } } },
        ])
        .toArray(),
      eventsCol
        .aggregate([
          { $match: { ...baseMatch, type: "page_view" } },
          { $group: { _id: "$url", views: { $sum: 1 } } },
          { $sort: { views: -1 } },
          { $limit: 5 },
        ])
        .toArray(),
      eventsCol
        .aggregate([
          {
            $match: {
              ...baseMatch,
              type: "chat_message_user",
              aiCategory: { $exists: true },
            },
          },
          { $group: { _id: "$aiCategory", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),
      eventsCol
        .find({
          ...baseMatch,
          type: "chat_message_user",
          messageText: { $exists: true },
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray(),
    ]);

    // チャット経由CV
    const chatConversions = await eventsCol.countDocuments({
      ...baseMatch,
      type: "conversion",
      sessionId: { $in: chatSessions },
    });

    // 指標を計算
    const chatOpenRate = sessionCount > 0 ? (chatOpens / sessionCount) * 100 : 0;
    const chatCVR =
      chatSessions.length > 0 ? (chatConversions / chatSessions.length) * 100 : 0;
    const nonChatSessions = sessionCount - chatSessions.length;
    const nonChatConversions = conversions - chatConversions;
    const nonChatCVR =
      nonChatSessions > 0 ? (nonChatConversions / nonChatSessions) * 100 : 0;

    // 型定義
    type DeviceStat = { _id: string | null; count: number };
    type PageStat = { _id: string; views: number };
    type CategoryStat = { _id: string; count: number };

    // サマリーデータを作成
    const summaryData = {
      期間: `${from.toLocaleDateString("ja-JP")} - ${to.toLocaleDateString("ja-JP")}`,
      総PV数: totalPV,
      セッション数: sessionCount,
      チャット開始数: chatOpens,
      チャット開始率: `${chatOpenRate.toFixed(2)}%`,
      総CV数: conversions,
      チャット経由CV数: chatConversions,
      チャット経由CVR: `${chatCVR.toFixed(2)}%`,
      非チャットCVR: `${nonChatCVR.toFixed(2)}%`,
      デバイス分布: Object.fromEntries(
        (deviceStats as DeviceStat[]).map((d) => [d._id || "unknown", d.count])
      ),
      上位ページ: (topPages as PageStat[]).map((p) => ({
        URL: p._id,
        PV: p.views,
      })),
      質問カテゴリ: (categoryStats as CategoryStat[]).map((c) => ({
        カテゴリ: c._id,
        件数: c.count,
      })),
      最近の質問例: recentQuestions.slice(0, 5).map((q) => q.messageText),
    };

    // AIに改善提案を生成させる
    const openai = getOpenAI();

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `あなたはSaaSサイトのグロースコンサルタントです。
データに基づいた具体的かつ実行可能な改善提案を行ってください。

回答は以下の形式でJSON配列として返してください：
[
  {
    "title": "提案タイトル",
    "category": "カテゴリ（チャット活用/コンバージョン/ユーザー体験/コンテンツ）",
    "priority": "優先度（高/中/低）",
    "description": "具体的な提案内容（100文字程度）",
    "expectedImpact": "期待される効果"
  }
]

3〜5個の提案を出してください。`,
        },
        {
          role: "user",
          content: `以下はWebサイトの解析データです。このデータを分析して改善提案をしてください。

${JSON.stringify(summaryData, null, 2)}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content || "";

    // JSONを抽出
    let suggestions: Array<{
      title: string;
      category: string;
      priority: string;
      description: string;
      expectedImpact: string;
    }> = [];

    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // パース失敗時はテキストとして扱う
      suggestions = [
        {
          title: "AI分析結果",
          category: "全般",
          priority: "中",
          description: content,
          expectedImpact: "データに基づく改善",
        },
      ];
    }

    return NextResponse.json({
      period: { from: from.toISOString(), to: to.toISOString() },
      summary: summaryData,
      suggestions,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Analytics] Insights error:", error);
    return NextResponse.json(
      { error: "Failed to generate insights" },
      { status: 500 }
    );
  }
}
