// [API] コンバージョン設定の取得・更新
import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { User, Agent, Company, ConversionSettings } from "@/lib/types";
import { isProPlan } from "@/lib/analytics";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const agentId = req.nextUrl.searchParams.get("agentId");
    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    const agentsCol = await getCollection<Agent>("agents");
    const agent = await agentsCol.findOne({ agentId });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Check access
    const usersCol = await getCollection<User>("users");
    const user = await usersCol.findOne({ userId: session.user.id });

    const isOwner = user?.companyIds?.includes(agent.companyId);
    const isSharedUser = agent.sharedWith?.some(
      (shared) => shared.email === session.user?.email || shared.userId === session.user?.id
    );

    if (!isOwner && !isSharedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Check Pro plan
    const companiesCol = await getCollection<Company>("companies");
    const company = await companiesCol.findOne({ companyId: agent.companyId });

    if (!company || !isProPlan(company.plan)) {
      return NextResponse.json({
        isPro: false,
        message: "Upgrade to Pro for conversion tracking",
      });
    }

    return NextResponse.json({
      isPro: true,
      conversionSettings: agent.conversionSettings || {
        enabled: false,
        triggers: [],
      },
    });
  } catch (error) {
    console.error("Get conversions error:", error);
    return NextResponse.json({ error: "Failed to get conversions" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { agentId, conversionSettings } = await req.json();

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    const agentsCol = await getCollection<Agent>("agents");
    const agent = await agentsCol.findOne({ agentId });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Check access
    const usersCol = await getCollection<User>("users");
    const user = await usersCol.findOne({ userId: session.user.id });

    const isOwner = user?.companyIds?.includes(agent.companyId);
    const isSharedUser = agent.sharedWith?.some(
      (shared) => shared.email === session.user?.email || shared.userId === session.user?.id
    );

    if (!isOwner && !isSharedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Check Pro plan
    const companiesCol = await getCollection<Company>("companies");
    const company = await companiesCol.findOne({ companyId: agent.companyId });

    if (!company || !isProPlan(company.plan)) {
      return NextResponse.json({
        isPro: false,
        error: "Upgrade to Pro for conversion tracking",
      }, { status: 403 });
    }

    // Validate conversionSettings
    const validatedSettings: ConversionSettings = {
      enabled: Boolean(conversionSettings?.enabled),
      triggers: Array.isArray(conversionSettings?.triggers)
        ? conversionSettings.triggers.map((t: Record<string, unknown>) => ({
            id: String(t.id || crypto.randomUUID()),
            name: String(t.name || "").slice(0, 100),
            type: ["url", "click", "form"].includes(String(t.type)) ? t.type : "url",
            urlPattern: t.urlPattern ? String(t.urlPattern).slice(0, 500) : undefined,
            urlMatchType: ["contains", "exact", "regex"].includes(String(t.urlMatchType)) ? t.urlMatchType : "contains",
            clickSelector: t.clickSelector ? String(t.clickSelector).slice(0, 500) : undefined,
            clickText: t.clickText ? String(t.clickText).slice(0, 200) : undefined,
            formSelector: t.formSelector ? String(t.formSelector).slice(0, 500) : undefined,
            formButtonText: t.formButtonText ? String(t.formButtonText).slice(0, 200) : undefined,
            value: t.value !== undefined ? Number(t.value) : undefined,
            enabled: Boolean(t.enabled),
          }))
        : [],
    };

    // Update agent
    await agentsCol.updateOne(
      { agentId },
      {
        $set: {
          conversionSettings: validatedSettings,
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      success: true,
      conversionSettings: validatedSettings,
    });
  } catch (error) {
    console.error("Update conversions error:", error);
    return NextResponse.json({ error: "Failed to update conversions" }, { status: 500 });
  }
}
