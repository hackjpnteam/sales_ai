// [Analytics] イベントトラッキングAPI
import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { AnalyticsEvent, AnalyticsEventType, Company } from "@/lib/types";
import { detectDeviceType, isProPlan } from "@/lib/analytics";

// 有効なイベントタイプ
const VALID_EVENT_TYPES: AnalyticsEventType[] = [
  "page_view",
  "session_start",
  "session_end",
  "chat_open",
  "chat_message_user",
  "chat_message_ai",
  "chat_end",
  "conversion",
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 必須フィールドチェック
    if (!body.companyId || !body.type || !body.visitorId || !body.sessionId || !body.url) {
      return NextResponse.json(
        { error: "Missing required fields: companyId, type, visitorId, sessionId, url" },
        { status: 400 }
      );
    }

    // イベントタイプのバリデーション
    if (!VALID_EVENT_TYPES.includes(body.type)) {
      return NextResponse.json(
        { error: `Invalid event type: ${body.type}` },
        { status: 400 }
      );
    }

    // companyIdの存在確認
    const companiesCol = await getCollection<Company>("companies");
    const company = await companiesCol.findOne({ companyId: body.companyId });

    if (!company) {
      return NextResponse.json(
        { error: "Invalid companyId" },
        { status: 400 }
      );
    }

    // Proプランチェック（Proでなくても記録はするが、後で解析画面での表示を制限）
    const isPro = isProPlan(company.plan);

    // デバイスタイプを判定
    const userAgent = body.userAgent || req.headers.get("user-agent") || "";
    const deviceType = body.deviceType || detectDeviceType(userAgent);

    // イベントを作成
    const event: AnalyticsEvent = {
      companyId: body.companyId,
      agentId: body.agentId || null,
      visitorId: body.visitorId,
      sessionId: body.sessionId,
      type: body.type,
      url: body.url,
      referrer: body.referrer || null,
      userAgent: userAgent,
      deviceType: deviceType,

      // チャット関連
      conversationId: body.conversationId || null,
      messageRole: body.messageRole || null,
      messageText: body.messageText || null,

      // CV関連
      conversionType: body.conversionType || null,
      conversionValue: typeof body.conversionValue === "number" ? body.conversionValue : null,

      createdAt: new Date(),
    };

    // イベントを保存
    const eventsCol = await getCollection<AnalyticsEvent>("analytics_events");
    await eventsCol.insertOne(event);

    return NextResponse.json({
      ok: true,
      isPro,
    });
  } catch (error) {
    console.error("[Analytics] Track error:", error);
    return NextResponse.json(
      { error: "Failed to track event" },
      { status: 500 }
    );
  }
}

// CORSプリフライト対応
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
