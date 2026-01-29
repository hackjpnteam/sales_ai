// [Analytics] 会話履歴API（Pro機能）
import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { ChatLog, Company, User, Agent } from "@/lib/types";
import { isProPlan, getDateRange } from "@/lib/analytics";
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
    const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    // 会社アクセス権限チェック
    if (!await canAccessCompany(session.user.id, session.user.email, companyId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // companyIdの所有権確認
    const companiesCol = await getCollection<Company>("companies");
    const company = await companiesCol.findOne({ companyId });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Proプランチェック
    if (!isProPlan(company.plan)) {
      return NextResponse.json({
        isPro: false,
        message: "Upgrade to Pro for conversation history",
      });
    }

    // 期間設定
    const { from, to } = getDateRange(period);

    const chatLogsCol = await getCollection<ChatLog>("chat_logs");

    // チャットがあるセッションを取得（pageUrlとdeviceTypeも集約）
    // 管理画面テストを除外（source: "admin_test"以外、または未設定のものを含む）
    const chatSessionsAgg = await chatLogsCol.aggregate([
      {
        $match: {
          companyId,
          createdAt: { $gte: from, $lte: to },
          $or: [
            { source: "website" },
            { source: { $exists: false } },
            { source: null },
          ],
        },
      },
      {
        $group: {
          _id: "$sessionId",
          messageCount: { $sum: 1 },
          firstMessageAt: { $min: "$createdAt" },
          lastMessageAt: { $max: "$createdAt" },
          // 最初のメッセージからpageUrlとdeviceTypeを取得
          pageUrl: { $first: "$pageUrl" },
          deviceType: { $first: "$deviceType" },
        },
      },
      { $sort: { lastMessageAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]).toArray();

    // 総セッション数を取得（管理画面テストを除外）
    const totalSessionsAgg = await chatLogsCol.aggregate([
      {
        $match: {
          companyId,
          createdAt: { $gte: from, $lte: to },
          $or: [
            { source: "website" },
            { source: { $exists: false } },
            { source: null },
          ],
        },
      },
      {
        $group: {
          _id: "$sessionId",
        },
      },
      {
        $count: "total",
      },
    ]).toArray();

    const totalSessions = totalSessionsAgg[0]?.total || 0;

    // 各セッションの詳細を取得
    const sessionIds = chatSessionsAgg.map((s) => s._id);

    // チャットログを取得
    const chatLogs = await chatLogsCol
      .find({
        companyId,
        sessionId: { $in: sessionIds },
      })
      .sort({ createdAt: 1 })
      .toArray();

    // セッションごとにグループ化
    const sessionsMap = new Map<string, {
      sessionId: string;
      pageUrl: string | null;
      pagePath: string | null;
      deviceType: string | null;
      startedAt: Date;
      endedAt: Date;
      messages: { role: string; content: string; createdAt: Date }[];
    }>();

    // セッション情報を初期化
    for (const sessionAgg of chatSessionsAgg) {
      const sessionId = sessionAgg._id;

      let pagePath: string | null = null;
      if (sessionAgg.pageUrl) {
        try {
          const url = new URL(sessionAgg.pageUrl);
          pagePath = url.pathname + url.search;
        } catch {
          pagePath = sessionAgg.pageUrl;
        }
      }

      sessionsMap.set(sessionId, {
        sessionId,
        pageUrl: sessionAgg.pageUrl || null,
        pagePath,
        deviceType: sessionAgg.deviceType || null,
        startedAt: sessionAgg.firstMessageAt,
        endedAt: sessionAgg.lastMessageAt,
        messages: [],
      });
    }

    // チャットログをセッションに追加
    for (const log of chatLogs) {
      const session = sessionsMap.get(log.sessionId);
      if (session) {
        session.messages.push({
          role: log.role,
          content: log.content,
          createdAt: log.createdAt,
        });
      }
    }

    // 配列に変換（最新順）
    const conversations = Array.from(sessionsMap.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );

    return NextResponse.json({
      isPro: true,
      conversations,
      pagination: {
        page,
        limit,
        total: totalSessions,
        totalPages: Math.ceil(totalSessions / limit),
      },
    });
  } catch (error) {
    console.error("[Analytics] Conversations error:", error);
    return NextResponse.json(
      { error: "Failed to get conversations" },
      { status: 500 }
    );
  }
}
