import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/admin";
import { User, Company, Agent } from "@/lib/types";

// GET: 全ユーザー一覧を取得
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

    return NextResponse.json({ users: usersWithDetails });
  } catch (error) {
    console.error("Super admin get users error:", error);
    return NextResponse.json(
      { error: "Failed to get users" },
      { status: 500 }
    );
  }
}
