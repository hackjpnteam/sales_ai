import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { Company, Agent } from "@/lib/types";

// GET: ウィジェット設定を取得（公開API - 認証不要）
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required" },
        { status: 400 }
      );
    }

    const companiesCol = await getCollection<Company>("companies");
    const agentsCol = await getCollection<Agent>("agents");

    // 会社を取得
    const company = await companiesCol.findOne({ companyId });
    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    // エージェントを取得
    const agent = await agentsCol.findOne({ companyId });
    if (!agent) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    // ウィジェットに必要な設定を返す
    const settings = {
      agentName: agent.name || "AIコンシェルジュ",
      themeColor: agent.themeColor || "#D86672",
      widgetPosition: agent.widgetPosition || "bottom-right",
      widgetStyle: agent.widgetStyle || "bubble", // "bubble" or "icon"
      avatarUrl: agent.avatarUrl || "/agent-avatar.png",
      welcomeMessage: agent.welcomeMessage || "いらっしゃいませ。ご質問があれば何でもお聞きください。",
      voiceEnabled: agent.voiceEnabled !== false,
      companyName: company.name || "",
    };

    // CORSヘッダーを追加（外部サイトからのアクセスを許可）
    return NextResponse.json(settings, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "public, max-age=60", // 1分キャッシュ
      },
    });
  } catch (error) {
    console.error("[Widget Settings] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

// OPTIONS: CORSプリフライト対応
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
