import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { User, Agent } from "@/lib/types";

// トラッキングデータの型
interface TrackingData {
  companyId: string;
  sessionId: string;
  // ユーザー情報
  userAgent?: string;
  device?: {
    type: "mobile" | "tablet" | "desktop";
    os?: string;
    browser?: string;
  };
  // 位置情報
  location?: {
    ip?: string;
    country?: string;
    region?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
  // 年齢層（推定）
  ageGroup?: "10s" | "20s" | "30s" | "40s" | "50s" | "60+";
  // 会話データ
  conversations?: {
    message: string;
    role: "user" | "assistant";
    timestamp: Date;
  }[];
  // メタデータ
  language?: string;
  referrer?: string;
  pageUrl?: string;
  // タイムスタンプ
  createdAt: Date;
  updatedAt: Date;
}

// POSTリクエスト - トラッキングデータを保存
export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { companyId, sessionId, type, ...rest } = data;

    if (!companyId || !sessionId) {
      return NextResponse.json(
        { error: "companyId and sessionId are required" },
        { status: 400 }
      );
    }

    // プランを確認（Pro以上のみトラッキング可能）
    const companiesCol = await getCollection("companies");
    const company = await companiesCol.findOne({ companyId }) as { plan?: string } | null;

    if (!company || (company.plan !== "pro" && company.plan !== "max")) {
      return NextResponse.json(
        { error: "Tracking is only available for Pro plan" },
        { status: 403 }
      );
    }

    const trackingCol = await getCollection("tracking");
    const now = new Date();

    if (type === "init") {
      // 新規セッションの初期化
      const trackingData: TrackingData = {
        companyId,
        sessionId,
        userAgent: rest.userAgent,
        device: rest.device,
        location: rest.location,
        language: rest.language,
        referrer: rest.referrer,
        pageUrl: rest.pageUrl,
        conversations: [],
        createdAt: now,
        updatedAt: now,
      };

      await trackingCol.updateOne(
        { companyId, sessionId },
        { $set: trackingData },
        { upsert: true }
      );
    } else if (type === "conversation") {
      // 会話データの追加
      await trackingCol.updateOne(
        { companyId, sessionId },
        {
          $push: {
            conversations: {
              message: rest.message,
              role: rest.role,
              timestamp: now,
            },
          },
          $set: { updatedAt: now },
        }
      );
    } else if (type === "age") {
      // 年齢層データの更新
      await trackingCol.updateOne(
        { companyId, sessionId },
        {
          $set: {
            ageGroup: rest.ageGroup,
            updatedAt: now,
          },
        }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Tracking error:", error);
    return NextResponse.json(
      { error: "Failed to save tracking data" },
      { status: 500 }
    );
  }
}

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

// GETリクエスト - トラッキングデータを取得（ダッシュボード用）
export async function GET(req: NextRequest) {
  // 認証チェック
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = req.nextUrl.searchParams.get("companyId");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100");
  const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0");

  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  try {
    // 会社アクセス権限チェック
    if (!await canAccessCompany(session.user.id, session.user.email, companyId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // プランを確認（Pro以上）
    const companiesCol = await getCollection("companies");
    const company = await companiesCol.findOne({ companyId }) as { plan?: string } | null;

    if (!company || (company.plan !== "pro" && company.plan !== "max")) {
      return NextResponse.json(
        { error: "Tracking data is only available for Pro plan" },
        { status: 403 }
      );
    }

    const trackingCol = await getCollection("tracking");

    // トラッキングデータを取得
    const data = await trackingCol
      .find({ companyId })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    // 統計情報を集計
    const stats = await trackingCol
      .aggregate([
        { $match: { companyId } },
        {
          $group: {
            _id: null,
            totalSessions: { $sum: 1 },
            totalConversations: {
              $sum: { $size: { $ifNull: ["$conversations", []] } },
            },
            deviceTypes: {
              $push: "$device.type",
            },
            ageGroups: {
              $push: "$ageGroup",
            },
            locations: {
              $push: "$location.city",
            },
          },
        },
      ])
      .toArray();

    // デバイス分布を計算
    const deviceStats: Record<string, number> = {};
    const ageStats: Record<string, number> = {};
    const locationStats: Record<string, number> = {};

    if (stats[0]) {
      stats[0].deviceTypes?.forEach((type: string) => {
        if (type) deviceStats[type] = (deviceStats[type] || 0) + 1;
      });
      stats[0].ageGroups?.forEach((age: string) => {
        if (age) ageStats[age] = (ageStats[age] || 0) + 1;
      });
      stats[0].locations?.forEach((loc: string) => {
        if (loc) locationStats[loc] = (locationStats[loc] || 0) + 1;
      });
    }

    return NextResponse.json({
      data,
      stats: {
        totalSessions: stats[0]?.totalSessions || 0,
        totalConversations: stats[0]?.totalConversations || 0,
        deviceDistribution: deviceStats,
        ageDistribution: ageStats,
        locationDistribution: locationStats,
      },
    });
  } catch (error) {
    console.error("Get tracking data error:", error);
    return NextResponse.json(
      { error: "Failed to get tracking data" },
      { status: 500 }
    );
  }
}
