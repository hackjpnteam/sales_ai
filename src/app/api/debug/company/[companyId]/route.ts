import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { Company, User, Agent } from "@/lib/types";
import { auth } from "@/lib/auth";

const SUPER_ADMIN_EMAILS = ["tomura@hackjpn.com"];

// GET: 会社の詳細情報を取得（デバッグ用 - SuperAdmin専用）
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  // SuperAdmin認証必須
  const session = await auth();
  if (!session?.user?.email || !SUPER_ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {

    const { companyId } = await params;

    const companiesCol = await getCollection<Company>("companies");
    const usersCol = await getCollection<User>("users");
    const agentsCol = await getCollection<Agent>("agents");

    const company = await companiesCol.findOne({ companyId });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // この会社を所有するユーザーを検索
    const owners = await usersCol.find({ companyIds: companyId }).toArray();

    // この会社のエージェントを取得
    const agents = await agentsCol.find({ companyId }).toArray();

    return NextResponse.json({
      company: {
        companyId: company.companyId,
        name: company.name,
        rootUrl: company.rootUrl,
        plan: company.plan,
        stripeCustomerId: company.stripeCustomerId,
        stripeSubscriptionId: company.stripeSubscriptionId,
        planStartedAt: company.planStartedAt,
        planEndedAt: company.planEndedAt,
        createdAt: company.createdAt,
      },
      owners: owners.map(u => ({
        userId: u.userId,
        email: u.email,
        name: u.name,
        maxPlanCount: u.maxPlanCount || 0,
      })),
      agents: agents.map(a => ({
        agentId: a.agentId,
        name: a.name,
      })),
    });
  } catch (error) {
    console.error("Debug company error:", error);
    return NextResponse.json(
      { error: "Failed to get company info" },
      { status: 500 }
    );
  }
}
