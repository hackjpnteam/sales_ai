import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { User, Agent } from "@/lib/types";
import type { PlanType } from "@/lib/stripe";

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
  // 認証チェック
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyId = req.nextUrl.searchParams.get("companyId");

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

    const companiesCol = await getCollection("companies");
    const company = await companiesCol.findOne({ companyId }) as { plan?: string; planStartedAt?: Date } | null;

    if (!company) {
      return NextResponse.json({ plan: "free" as PlanType });
    }

    return NextResponse.json({
      plan: (company.plan || "free") as PlanType,
      planStartedAt: company.planStartedAt || null,
    });
  } catch (error) {
    console.error("Subscription status error:", error);
    return NextResponse.json(
      { error: "Failed to get subscription status" },
      { status: 500 }
    );
  }
}
