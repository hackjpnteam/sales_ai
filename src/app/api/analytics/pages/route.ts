// [Analytics] ページ別解析API（Pro機能）
import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { AnalyticsEvent, Company, User, Agent } from "@/lib/types";
import { isProPlan, getDateRange, normalizeUrl } from "@/lib/analytics";
import { auth } from "@/lib/auth";

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

export async function GET(req: NextRequest) {
  try {
    // 認証チェック
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const companyId = req.nextUrl.searchParams.get("companyId");
    const period = req.nextUrl.searchParams.get("period") || "7days";
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");

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

    const baseMatch = {
      companyId,
      createdAt: { $gte: from, $lte: to },
    };

    // ページ別のPV集計
    const pageViewStats = await eventsCol
      .aggregate([
        { $match: { ...baseMatch, type: "page_view" } },
        {
          $group: {
            _id: "$url",
            views: { $sum: 1 },
            uniqueVisitors: { $addToSet: "$visitorId" },
            sessions: { $addToSet: "$sessionId" },
          },
        },
        {
          $project: {
            url: "$_id",
            views: 1,
            uniqueVisitors: { $size: "$uniqueVisitors" },
            sessions: { $size: "$sessions" },
          },
        },
        { $sort: { views: -1 } },
        { $limit: limit },
      ])
      .toArray();

    // 各ページでのチャット開始数を取得
    const chatOpenStats = await eventsCol
      .aggregate([
        { $match: { ...baseMatch, type: "chat_open" } },
        {
          $group: {
            _id: "$url",
            chatOpens: { $sum: 1 },
            chatSessions: { $addToSet: "$sessionId" },
          },
        },
        {
          $project: {
            url: "$_id",
            chatOpens: 1,
            chatSessions: "$chatSessions",
          },
        },
      ])
      .toArray();

    // 各ページでのCV数を取得
    const conversionStats = await eventsCol
      .aggregate([
        { $match: { ...baseMatch, type: "conversion" } },
        {
          $group: {
            _id: "$url",
            conversions: { $sum: 1 },
            conversionSessions: { $addToSet: "$sessionId" },
          },
        },
        {
          $project: {
            url: "$_id",
            conversions: 1,
            conversionSessions: "$conversionSessions",
          },
        },
      ])
      .toArray();

    // データを結合
    const chatOpenMap = new Map(
      chatOpenStats.map((stat) => [stat.url, stat])
    );
    const conversionMap = new Map(
      conversionStats.map((stat) => [stat.url, stat])
    );

    const pages = pageViewStats.map((page) => {
      const chatData = chatOpenMap.get(page.url) || { chatOpens: 0, chatSessions: [] };
      const cvData = conversionMap.get(page.url) || { conversions: 0, conversionSessions: [] };

      // チャット開始率
      const chatOpenRate =
        page.sessions > 0
          ? ((chatData.chatOpens / page.sessions) * 100).toFixed(2)
          : "0.00";

      // チャット経由CVR（チャットしたセッションのうちCVしたセッション）
      const chatSessionSet = new Set(chatData.chatSessions || []);
      const cvSessionSet = new Set(cvData.conversionSessions || []);
      const chatCVSessions = [...chatSessionSet].filter((s) => cvSessionSet.has(s)).length;
      const chatCVR =
        chatSessionSet.size > 0
          ? ((chatCVSessions / chatSessionSet.size) * 100).toFixed(2)
          : "0.00";

      return {
        url: page.url,
        path: normalizeUrl(page.url),
        views: page.views,
        uniqueVisitors: page.uniqueVisitors,
        sessions: page.sessions,
        chatOpens: chatData.chatOpens,
        chatOpenRate: parseFloat(chatOpenRate),
        conversions: cvData.conversions,
        chatCVR: parseFloat(chatCVR),
      };
    });

    return NextResponse.json({
      period: { from: from.toISOString(), to: to.toISOString() },
      pages,
    });
  } catch (error) {
    console.error("[Analytics] Pages error:", error);
    return NextResponse.json(
      { error: "Failed to get page analytics" },
      { status: 500 }
    );
  }
}
