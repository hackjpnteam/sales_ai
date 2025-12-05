// [Analytics] サマリー集計API（Pro機能）
import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { AnalyticsEvent, Company } from "@/lib/types";
import { isProPlan, getDateRange } from "@/lib/analytics";
import { auth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = req.nextUrl.searchParams.get("companyId");
    const period = req.nextUrl.searchParams.get("period") || "7days";
    const fromParam = req.nextUrl.searchParams.get("from");
    const toParam = req.nextUrl.searchParams.get("to");

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    // companyIdの所有権確認
    const companiesCol = await getCollection<Company>("companies");
    const company = await companiesCol.findOne({ companyId });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Proプランチェック
    if (!isProPlan(company.plan)) {
      // Freeプランの場合は簡易データのみ返す
      const eventsCol = await getCollection<AnalyticsEvent>("analytics_events");
      const { from, to } = getDateRange("7days");

      const totalPV = await eventsCol.countDocuments({
        companyId,
        type: "page_view",
        createdAt: { $gte: from, $lte: to },
      });

      const chatOpens = await eventsCol.countDocuments({
        companyId,
        type: "chat_open",
        createdAt: { $gte: from, $lte: to },
      });

      return NextResponse.json({
        isPro: false,
        limited: true,
        summary: {
          totalPV,
          chatOpens,
        },
        message: "Upgrade to Pro for full analytics",
      });
    }

    // 期間設定
    let from: Date, to: Date;
    if (fromParam && toParam) {
      from = new Date(fromParam);
      to = new Date(toParam);
      to.setHours(23, 59, 59, 999);
    } else {
      const range = getDateRange(period);
      from = range.from;
      to = range.to;
    }

    const eventsCol = await getCollection<AnalyticsEvent>("analytics_events");

    const baseMatch = {
      companyId,
      createdAt: { $gte: from, $lte: to },
    };

    // 並列で集計を実行
    const [
      totalPV,
      sessionStarts,
      uniqueVisitors,
      chatOpens,
      chatMessages,
      conversions,
      chatSessions,
      deviceStats,
      dailyStats,
    ] = await Promise.all([
      // 総PV数
      eventsCol.countDocuments({ ...baseMatch, type: "page_view" }),

      // セッション数
      eventsCol.countDocuments({ ...baseMatch, type: "session_start" }),

      // ユニークビジター数
      eventsCol.distinct("visitorId", baseMatch).then((arr) => arr.length),

      // チャット開始数
      eventsCol.countDocuments({ ...baseMatch, type: "chat_open" }),

      // チャットメッセージ数（ユーザー）
      eventsCol.countDocuments({ ...baseMatch, type: "chat_message_user" }),

      // コンバージョン数
      eventsCol.countDocuments({ ...baseMatch, type: "conversion" }),

      // チャットを利用したセッション
      eventsCol.distinct("sessionId", {
        ...baseMatch,
        type: { $in: ["chat_open", "chat_message_user"] },
      }),

      // デバイス別統計
      eventsCol
        .aggregate([
          { $match: { ...baseMatch, type: "session_start" } },
          {
            $group: {
              _id: "$deviceType",
              count: { $sum: 1 },
            },
          },
        ])
        .toArray(),

      // 日別統計
      eventsCol
        .aggregate([
          { $match: baseMatch },
          {
            $group: {
              _id: {
                date: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                },
                type: "$type",
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { "_id.date": 1 } },
        ])
        .toArray(),
    ]);

    // チャット経由のコンバージョン
    const chatSessionIds = chatSessions;
    const chatConversions = await eventsCol.countDocuments({
      ...baseMatch,
      type: "conversion",
      sessionId: { $in: chatSessionIds },
    });

    // CVRを計算
    const chatCVR =
      chatSessionIds.length > 0
        ? ((chatConversions / chatSessionIds.length) * 100).toFixed(2)
        : "0.00";

    const nonChatSessions = sessionStarts - chatSessionIds.length;
    const nonChatConversions = conversions - chatConversions;
    const nonChatCVR =
      nonChatSessions > 0
        ? ((nonChatConversions / nonChatSessions) * 100).toFixed(2)
        : "0.00";

    // 型定義
    type DeviceStat = { _id: string | null; count: number };
    type DailyStat = { _id: { date: string; type: string }; count: number };

    // デバイス統計を整形
    const deviceDistribution = {
      pc: 0,
      mobile: 0,
      tablet: 0,
    };
    (deviceStats as DeviceStat[]).forEach((stat) => {
      if (stat._id === "pc" || stat._id === "mobile" || stat._id === "tablet") {
        deviceDistribution[stat._id] = stat.count;
      }
    });

    // 日別統計を整形
    const dailyData: Record<
      string,
      { pageViews: number; chatOpens: number; conversions: number }
    > = {};
    (dailyStats as DailyStat[]).forEach((stat) => {
      const date = stat._id.date;
      if (!dailyData[date]) {
        dailyData[date] = { pageViews: 0, chatOpens: 0, conversions: 0 };
      }
      if (stat._id.type === "page_view") {
        dailyData[date].pageViews = stat.count;
      } else if (stat._id.type === "chat_open") {
        dailyData[date].chatOpens = stat.count;
      } else if (stat._id.type === "conversion") {
        dailyData[date].conversions = stat.count;
      }
    });

    // 日付順にソート
    const sortedDailyData = Object.entries(dailyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }));

    return NextResponse.json({
      isPro: true,
      period: { from: from.toISOString(), to: to.toISOString() },
      summary: {
        totalPV,
        sessions: sessionStarts,
        uniqueVisitors,
        chatOpens,
        chatMessages,
        conversions,
        chatOpenRate:
          sessionStarts > 0
            ? ((chatOpens / sessionStarts) * 100).toFixed(2)
            : "0.00",
        chatCVR,
        nonChatCVR,
        chatConversions,
        chatSessions: chatSessionIds.length,
      },
      deviceDistribution,
      dailyData: sortedDailyData,
    });
  } catch (error) {
    console.error("[Analytics] Summary error:", error);
    return NextResponse.json(
      { error: "Failed to get analytics summary" },
      { status: 500 }
    );
  }
}
