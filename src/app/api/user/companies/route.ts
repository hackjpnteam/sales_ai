import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollection } from "@/lib/mongodb";
import type { User, Company, Agent } from "@/lib/types";

export async function GET() {
  try {
    const session = await auth();

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

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get companies owned by user
    const companies = await companiesCol
      .find({ companyId: { $in: user.companyIds } })
      .toArray();

    // 全エージェントを一括取得（N+1クエリ問題を解決）
    const companyIds = companies.map(c => c.companyId);
    const allAgents = await agentsCol
      .find({ companyId: { $in: companyIds } })
      .toArray();

    // 会社ごとにエージェントをマッピング
    const agentsByCompany = allAgents.reduce((acc, agent) => {
      if (!acc[agent.companyId]) {
        acc[agent.companyId] = [];
      }
      acc[agent.companyId].push(agent);
      return acc;
    }, {} as Record<string, typeof allAgents>);

    const companiesWithAgents = companies.map((company) => ({
      ...company,
      agents: agentsByCompany[company.companyId] || [],
    }));

    // 共有されたエージェントを取得
    const sharedAgents = await agentsCol
      .find({
        "sharedWith.userId": session.user.id,
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

    return NextResponse.json({
      companies: companiesWithAgents,
      sharedCompanies: sharedCompaniesWithAgents,
    });
  } catch (error) {
    console.error("Get user companies error:", error);
    return NextResponse.json(
      { error: "Failed to get companies" },
      { status: 500 }
    );
  }
}
