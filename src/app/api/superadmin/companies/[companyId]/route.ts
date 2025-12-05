import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/admin";
import { Agent } from "@/lib/types";

// PUT: 会社のプランを更新
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email || !isSuperAdmin(session.user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { companyId } = await params;
    const { plan } = await req.json();

    if (!plan || !["free", "lite", "pro"].includes(plan)) {
      return NextResponse.json(
        { error: "Invalid plan. Must be 'free', 'lite', or 'pro'" },
        { status: 400 }
      );
    }

    const companiesCol = await getCollection("companies");
    const company = await companiesCol.findOne({ companyId });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    await companiesCol.updateOne(
      { companyId },
      {
        $set: {
          plan,
          planStartedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    console.log(`[SuperAdmin] Updated company ${companyId} plan to ${plan}`);

    return NextResponse.json({ success: true, plan });
  } catch (error) {
    console.error("Super admin update company error:", error);
    return NextResponse.json(
      { error: "Failed to update company" },
      { status: 500 }
    );
  }
}

// DELETE: 会社とエージェントを削除
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email || !isSuperAdmin(session.user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { companyId } = await params;

    const companiesCol = await getCollection("companies");
    const company = await companiesCol.findOne({ companyId });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // 関連データを削除
    const agentsCol = await getCollection<Agent>("agents");
    const documentsCol = await getCollection("documents");
    const avatarsCol = await getCollection("avatars");
    const usersCol = await getCollection("users");

    // エージェントのIDを取得
    const agents = await agentsCol.find({ companyId }).toArray();
    const agentIds = agents.map((a) => a.agentId);

    // 削除実行
    await agentsCol.deleteMany({ companyId });
    await companiesCol.deleteOne({ companyId });
    await documentsCol.deleteMany({ companyId });
    await avatarsCol.deleteMany({ agentId: { $in: agentIds } });

    // ユーザーからcompanyIdを削除
    await usersCol.updateMany(
      { companyIds: companyId },
      { $pull: { companyIds: companyId } }
    );

    console.log(`[SuperAdmin] Deleted company ${companyId} and related data`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Super admin delete company error:", error);
    return NextResponse.json(
      { error: "Failed to delete company" },
      { status: 500 }
    );
  }
}
