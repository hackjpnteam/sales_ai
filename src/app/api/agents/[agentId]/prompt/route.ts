import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { User, Agent, Company } from "@/lib/types";

// デフォルトのガードレール（編集不可）
const DEFAULT_GUARDRAILS = `# 制約条件
- わからないことは推測せず「わかりません」と正直に答える
- 個人情報や機密情報は取り扱わない
- 法的・税務・医療などの専門的助言は一般的な情報にとどめる
- 競合他社の批判や比較は行わない
- 不適切な内容や攻撃的な表現は使用しない`;

// GET: エージェントのプロンプト設定を取得
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { agentId } = await params;

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    const agentsCol = await getCollection<Agent>("agents");
    const agent = await agentsCol.findOne({ agentId });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // ユーザーがこの会社を所有しているか、共有アクセス権があるか確認
    const usersCol = await getCollection<User>("users");
    const user = await usersCol.findOne({ userId: session.user.id });

    const isOwner = user?.companyIds?.includes(agent.companyId);
    const isSharedUser = agent.sharedWith?.some(
      (shared) => shared.email === session.user?.email || shared.userId === session.user?.id
    );

    if (!isOwner && !isSharedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // プロンプト設定を返す
    return NextResponse.json({
      systemPrompt: agent.systemPrompt || "",
      knowledge: agent.knowledge || "",
      style: agent.style || "",
      ngResponses: agent.ngResponses || "",
      guardrails: DEFAULT_GUARDRAILS, // guardrailsは常にデフォルト値を返す
    });
  } catch (error) {
    console.error("Get prompt settings error:", error);
    return NextResponse.json(
      { error: "Failed to get prompt settings" },
      { status: 500 }
    );
  }
}

// PATCH: エージェントのプロンプト設定を更新（Proプラン限定）
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { agentId } = await params;
    const body = await req.json();

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    const agentsCol = await getCollection<Agent>("agents");
    const agent = await agentsCol.findOne({ agentId });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // ユーザーがこの会社を所有しているか、共有アクセス権があるか確認
    const usersCol = await getCollection<User>("users");
    const user = await usersCol.findOne({ userId: session.user.id });

    const isOwner = user?.companyIds?.includes(agent.companyId);
    const isSharedUser = agent.sharedWith?.some(
      (shared) => shared.email === session.user?.email || shared.userId === session.user?.id
    );

    if (!isOwner && !isSharedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Proプラン以上チェック（pro, max）
    const companiesCol = await getCollection<Company>("companies");
    const company = await companiesCol.findOne({ companyId: agent.companyId });

    if (!company || (company.plan !== "pro" && company.plan !== "max")) {
      return NextResponse.json(
        { error: "Pro plan required", code: "PRO_REQUIRED" },
        { status: 403 }
      );
    }

    // 許可するフィールドのみ更新（guardrailsは更新不可）
    const { systemPrompt, knowledge, style, ngResponses } = body;
    const updateData: Partial<Agent> = {};

    if (systemPrompt !== undefined) {
      updateData.systemPrompt = systemPrompt;
    }
    if (knowledge !== undefined) {
      updateData.knowledge = knowledge;
    }
    if (style !== undefined) {
      updateData.style = style;
    }
    if (ngResponses !== undefined) {
      updateData.ngResponses = ngResponses;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    await agentsCol.updateOne(
      { agentId },
      { $set: updateData }
    );

    console.log(`[Prompt] Agent ${agentId} prompt settings updated:`, Object.keys(updateData));

    return NextResponse.json({
      success: true,
      updated: Object.keys(updateData),
    });
  } catch (error) {
    console.error("Update prompt settings error:", error);
    return NextResponse.json(
      { error: "Failed to update prompt settings" },
      { status: 500 }
    );
  }
}
