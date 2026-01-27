import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollection } from "@/lib/mongodb";
import { Agent, Company, User, DocChunk, CustomKnowledge } from "@/lib/types";
import { randomUUID } from "crypto";

// POST: ボットを複製
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentId: sourceAgentId } = await params;

  try {
    const body = await req.json();
    const { newCompanyName, copyKnowledge = true } = body;

    if (!newCompanyName) {
      return NextResponse.json(
        { error: "newCompanyName is required" },
        { status: 400 }
      );
    }

    const usersCol = await getCollection<User>("users");
    const companiesCol = await getCollection<Company>("companies");
    const agentsCol = await getCollection<Agent>("agents");
    const chunksCol = await getCollection<DocChunk>("documents");
    const knowledgeCol = await getCollection<CustomKnowledge>("custom_knowledge");

    // 元のエージェントを取得
    const sourceAgent = await agentsCol.findOne({ agentId: sourceAgentId });
    if (!sourceAgent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // 元の会社を取得
    const sourceCompany = await companiesCol.findOne({ companyId: sourceAgent.companyId });
    if (!sourceCompany) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // 権限チェック: ユーザーがこの会社を所有しているか
    const user = await usersCol.findOne({ userId: session.user.id });
    if (!user?.companyIds?.includes(sourceAgent.companyId)) {
      // 共有ユーザーかチェック
      const isShared = sourceAgent.sharedWith?.some(
        (s) => s.email === session.user?.email || s.userId === session.user?.id
      );
      if (!isShared) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    // エージェント作成制限をチェック
    if (user && user.companyIds && user.companyIds.length > 0) {
      const userCompanies = await companiesCol
        .find({ companyId: { $in: user.companyIds } })
        .toArray();

      const currentAgentCount = await agentsCol.countDocuments({
        companyId: { $in: user.companyIds },
      });

      const planCounts = { free: 0, lite: 0, pro: 0, max: 0 };
      for (const company of userCompanies) {
        const plan = (company.plan || "free") as keyof typeof planCounts;
        if (plan in planCounts) {
          planCounts[plan]++;
        }
      }

      const maxPlanCount = user.maxPlanCount || 0;
      const paidAgentLimit = planCounts.lite + planCounts.pro;
      const maxAgentLimit = Math.max(maxPlanCount, planCounts.max > 0 ? 1 : 0) * 5;
      const limit = paidAgentLimit + maxAgentLimit;

      if (limit > 0 && currentAgentCount >= limit) {
        return NextResponse.json(
          {
            error: "エージェント上限に達しているため複製できません。",
            code: "AGENT_LIMIT_REACHED",
          },
          { status: 403 }
        );
      }
    }

    // 新しいIDを生成
    const newCompanyId = randomUUID();
    const newAgentId = randomUUID();
    const now = new Date();

    // 新しい会社を作成
    const newCompany: Company = {
      companyId: newCompanyId,
      name: newCompanyName,
      rootUrl: sourceCompany.rootUrl,
      language: sourceCompany.language,
      userId: session.user.id,
      plan: "free", // 複製は常にfreeから開始
      createdAt: now,
      updatedAt: now,
    };

    // 新しいエージェントを作成（設定をコピー）
    const newAgent: Agent = {
      agentId: newAgentId,
      companyId: newCompanyId,
      name: `${newCompanyName} AI`,
      rootUrl: sourceAgent.rootUrl,
      welcomeMessage: sourceAgent.welcomeMessage,
      voiceEnabled: sourceAgent.voiceEnabled,
      themeColor: sourceAgent.themeColor,
      avatarUrl: sourceAgent.avatarUrl,
      widgetPosition: sourceAgent.widgetPosition,
      widgetStyle: sourceAgent.widgetStyle,
      iconVideoUrl: sourceAgent.iconVideoUrl,
      iconSize: sourceAgent.iconSize,
      tooltipText: sourceAgent.tooltipText,
      tooltipDuration: sourceAgent.tooltipDuration,
      languages: sourceAgent.languages,
      quickButtons: sourceAgent.quickButtons,
      systemPrompt: sourceAgent.systemPrompt,
      knowledge: sourceAgent.knowledge,
      style: sourceAgent.style,
      guardrails: sourceAgent.guardrails,
      ngResponses: sourceAgent.ngResponses,
      companyInfo: sourceAgent.companyInfo,
      conversionSettings: sourceAgent.conversionSettings,
      createdAt: now,
    };

    // データベースに挿入
    await companiesCol.insertOne(newCompany);
    await agentsCol.insertOne(newAgent);

    // ユーザーのcompanyIdsに追加
    await usersCol.updateOne(
      { userId: session.user.id },
      { $addToSet: { companyIds: newCompanyId } }
    );

    // ドキュメントチャンクをコピー
    const sourceChunks = await chunksCol
      .find({ companyId: sourceAgent.companyId, agentId: sourceAgentId })
      .toArray();

    if (sourceChunks.length > 0) {
      const newChunks = sourceChunks.map((chunk) => ({
        ...chunk,
        _id: undefined,
        companyId: newCompanyId,
        agentId: newAgentId,
        createdAt: now,
      }));
      await chunksCol.insertMany(newChunks);
    }

    // カスタムナレッジをコピー（オプション）
    let copiedKnowledgeCount = 0;
    if (copyKnowledge) {
      const sourceKnowledges = await knowledgeCol
        .find({ companyId: sourceAgent.companyId })
        .toArray();

      if (sourceKnowledges.length > 0) {
        const newKnowledges = sourceKnowledges.map((k) => ({
          ...k,
          _id: undefined,
          knowledgeId: randomUUID(),
          companyId: newCompanyId,
          agentId: newAgentId,
          createdAt: now,
          updatedAt: now,
        }));
        await knowledgeCol.insertMany(newKnowledges);
        copiedKnowledgeCount = newKnowledges.length;
      }
    }

    return NextResponse.json({
      success: true,
      companyId: newCompanyId,
      agentId: newAgentId,
      copiedChunks: sourceChunks.length,
      copiedKnowledge: copiedKnowledgeCount,
      message: "ボットを複製しました",
    });
  } catch (error) {
    console.error("Error duplicating agent:", error);
    return NextResponse.json(
      { error: "複製に失敗しました" },
      { status: 500 }
    );
  }
}
