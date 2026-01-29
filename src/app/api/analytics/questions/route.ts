// [Analytics] 質問分析API（Pro機能）
import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { Company, User, Agent, ChatLog } from "@/lib/types";
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
    // sourceフィルタ: "website"（デフォルト）、"all"（すべて）、"admin_test"（テストのみ）
    const sourceFilter = req.nextUrl.searchParams.get("source") || "website";

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
    const chatLogsCol = await getCollection<ChatLog>("chat_logs");

    // sourceフィルタ条件を構築
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sourceCondition: any = {};
    if (sourceFilter === "website") {
      // websiteのみ（sourceが"website"または未設定のものを含む - 後方互換性）
      sourceCondition.$or = [
        { source: "website" },
        { source: { $exists: false } },
        { source: null },
      ];
    } else if (sourceFilter === "admin_test") {
      sourceCondition.source = "admin_test";
    }
    // sourceFilter === "all" の場合は条件を追加しない（すべて取得）

    // ユーザーメッセージを取得（chat_logsから直接）
    const userMessages = await chatLogsCol
      .find({
        companyId,
        role: "user",
        createdAt: { $gte: from, $lte: to },
        ...sourceCondition,
      })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();

    // メッセージをランキング（頻度順）
    const messageCountMap = new Map<string, { count: number; lastDate: Date }>();

    userMessages.forEach((msg) => {
      const text = msg.content?.trim();
      if (!text || text.length < 2) return;

      const existing = messageCountMap.get(text);
      if (existing) {
        existing.count++;
        if (msg.createdAt > existing.lastDate) {
          existing.lastDate = msg.createdAt;
        }
      } else {
        messageCountMap.set(text, { count: 1, lastDate: msg.createdAt });
      }
    });

    // ランキング形式に変換（上位50件）
    const questionRanking = Array.from(messageCountMap.entries())
      .map(([text, data]) => ({
        text,
        count: data.count,
        lastDate: data.lastDate,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    // 最近の質問（時系列順）
    const recentQuestions = userMessages
      .filter((m) => m.content && m.content.trim().length >= 2)
      .slice(0, 30)
      .map((m) => ({
        text: m.content,
        createdAt: m.createdAt,
        sessionId: m.sessionId,
        pageUrl: m.pageUrl,
      }));

    return NextResponse.json({
      period: { from: from.toISOString(), to: to.toISOString() },
      totalQuestions: userMessages.length,
      questionRanking,
      recentQuestions,
      sourceFilter, // 現在のフィルタ状態
    });
  } catch (error) {
    console.error("[Analytics] Questions error:", error);
    return NextResponse.json(
      { error: "Failed to get question analytics" },
      { status: 500 }
    );
  }
}
