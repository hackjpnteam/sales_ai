import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollection } from "@/lib/mongodb";
import type { User, Company, Agent } from "@/lib/types";

export async function GET() {
  try {
    const session = await auth();

    console.log("[API /user/companies] session.user:", {
      id: session?.user?.id,
      email: session?.user?.email,
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const usersCol = await getCollection<User>("users");
    const companiesCol = await getCollection<Company>("companies");
    const agentsCol = await getCollection<Agent>("agents");

    // Get user
    const user = await usersCol.findOne({ userId: session.user.id });

    console.log("[API /user/companies] DB user:", {
      found: !!user,
      userId: user?.userId,
      email: user?.email,
      companyIdsCount: user?.companyIds?.length || 0,
    });

    if (!user) {
      // Try to find by email as fallback
      const userByEmail = await usersCol.findOne({ email: session.user.email?.toLowerCase() });
      console.log("[API /user/companies] Fallback by email:", {
        found: !!userByEmail,
        userId: userByEmail?.userId,
      });

      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get companies owned by user
    const ownedCompanies = await companiesCol
      .find({ companyId: { $in: user.companyIds || [] } })
      .toArray();

    // 全エージェントを一括取得（N+1クエリ問題を解決）
    // iconVideoUrlのみ除外（大きな動画データ）
    const ownedCompanyIds = ownedCompanies.map(c => c.companyId);
    const trimmedOwnedAgents = await agentsCol
      .find({ companyId: { $in: ownedCompanyIds } })
      .project({
        iconVideoUrl: 0,
      })
      .toArray();

    // 会社ごとにエージェントをマッピング
    const ownedAgentsByCompany = trimmedOwnedAgents.reduce((acc, agent) => {
      if (!acc[agent.companyId]) {
        acc[agent.companyId] = [];
      }
      acc[agent.companyId].push(agent);
      return acc;
    }, {} as Record<string, typeof trimmedOwnedAgents>);

    const ownedCompaniesWithAgents = ownedCompanies.map((company) => ({
      ...company,
      isShared: false,
      agents: ownedAgentsByCompany[company.companyId] || [],
    }));

    // 共有されたエージェントを取得（userIdまたはemailで検索）
    // 自分が所有していない会社のエージェントのみ
    // iconVideoUrlのみ除外（大きな動画データ）
    const userEmail = session.user.email?.toLowerCase();
    const sharedAgents = await agentsCol
      .find({
        companyId: { $nin: ownedCompanyIds },
        $or: [
          { "sharedWith.userId": session.user.id },
          ...(userEmail ? [{ "sharedWith.email": userEmail }] : []),
        ],
      })
      .project({
        iconVideoUrl: 0,
      })
      .toArray();

    // 共有エージェントの会社情報を取得
    const sharedCompanyIds = [...new Set(sharedAgents.map(a => a.companyId))];
    const sharedCompanies = sharedCompanyIds.length > 0
      ? await companiesCol.find({ companyId: { $in: sharedCompanyIds } }).toArray()
      : [];

    // 共有エージェントを会社ごとにグループ化
    const sharedAgentsByCompany = sharedAgents.reduce((acc, agent) => {
      if (!acc[agent.companyId]) {
        acc[agent.companyId] = [];
      }
      // 共有フラグを追加
      acc[agent.companyId].push({ ...agent, isShared: true });
      return acc;
    }, {} as Record<string, (typeof sharedAgents[0] & { isShared: boolean })[]>);

    const sharedCompaniesWithAgents = sharedCompanies.map((company) => ({
      ...company,
      isShared: true,
      agents: sharedAgentsByCompany[company.companyId] || [],
    }));

    // 全ての会社を統合（所有 + 共有）
    // 共有されたエージェントも所有者と同じ機能を使えるように統合
    const allCompanies = [...ownedCompaniesWithAgents, ...sharedCompaniesWithAgents];

    return NextResponse.json({
      companies: allCompanies,
      sharedCompanies: sharedCompaniesWithAgents, // 後方互換性のため残す
      maxPlanCount: user.maxPlanCount || 0, // Maxプラン購入数
    });
  } catch (error) {
    console.error("Get user companies error:", error);
    return NextResponse.json(
      { error: "Failed to get companies" },
      { status: 500 }
    );
  }
}
