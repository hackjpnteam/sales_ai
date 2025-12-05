import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/admin";
import { User, Company, Agent } from "@/lib/types";

// GET: 全ユーザー一覧を取得（ゲストユーザー含む）
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email || !isSuperAdmin(session.user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const usersCol = await getCollection<User>("users");
    const users = await usersCol.find({}).sort({ createdAt: -1 }).toArray();

    // 各ユーザーの会社情報も取得
    const companiesCol = await getCollection<Company>("companies");
    const agentsCol = await getCollection<Agent>("agents");

    const usersWithDetails = await Promise.all(
      users.map(async (user) => {
        const companies = await companiesCol
          .find({ companyId: { $in: user.companyIds || [] } })
          .toArray();

        const agents = await agentsCol
          .find({ companyId: { $in: user.companyIds || [] } })
          .toArray();

        return {
          userId: user.userId,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
          companies: companies.map((c) => ({
            companyId: c.companyId,
            name: c.name,
            rootUrl: c.rootUrl,
            plan: c.plan,
            planStartedAt: c.planStartedAt,
          })),
          agents: agents.map((a) => ({
            agentId: a.agentId,
            name: a.name,
            companyId: a.companyId,
          })),
        };
      })
    );

    // ゲストユーザー（userIdを持たない）の会社を取得
    const allUserCompanyIds = users.flatMap((u) => u.companyIds || []);
    const guestCompanies = await companiesCol
      .find({
        $or: [
          { userId: { $exists: false } },
          { userId: "" },
          { companyId: { $nin: allUserCompanyIds } },
        ],
      } as Parameters<typeof companiesCol.find>[0])
      .sort({ createdAt: -1 })
      .toArray();

    // ゲスト会社のエージェントを取得
    const guestCompanyIds = guestCompanies.map((c) => c.companyId);
    const guestAgents = await agentsCol
      .find({ companyId: { $in: guestCompanyIds } })
      .toArray();

    const guestData = guestCompanies.map((c) => ({
      companyId: c.companyId,
      name: c.name,
      rootUrl: c.rootUrl,
      plan: c.plan || "free",
      createdAt: c.createdAt,
      creatorIp: c.creatorIp,
      creatorUserAgent: c.creatorUserAgent,
      creatorLocation: c.creatorLocation,
      agents: guestAgents
        .filter((a) => a.companyId === c.companyId)
        .map((a) => ({
          agentId: a.agentId,
          name: a.name,
        })),
    }));

    return NextResponse.json({
      users: usersWithDetails,
      guestCompanies: guestData,
    });
  } catch (error) {
    console.error("Super admin get users error:", error);
    return NextResponse.json(
      { error: "Failed to get users" },
      { status: 500 }
    );
  }
}
