import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import type { User, Company } from "@/lib/types";

// PATCH: companyのプランを変更（Maxプラン所有者がFree companyをMaxに変更する用）
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { companyId } = await params;
    const { plan } = await req.json();

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required" }, { status: 400 });
    }

    if (!plan || !["free", "max"].includes(plan)) {
      return NextResponse.json({ error: "Valid plan (free or max) is required" }, { status: 400 });
    }

    const usersCol = await getCollection<User>("users");
    const companiesCol = await getCollection<Company>("companies");

    // ユーザー情報を取得
    const user = await usersCol.findOne({ userId: session.user.id });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // companyが存在し、ユーザーが所有しているか確認
    if (!user.companyIds?.includes(companyId)) {
      return NextResponse.json({ error: "Company not found or not owned" }, { status: 404 });
    }

    const company = await companiesCol.findOne({ companyId });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Maxプランに変更する場合の検証
    if (plan === "max") {
      // ユーザーがMaxプランを購入しているか確認
      const maxPlanCount = user.maxPlanCount || 0;
      if (maxPlanCount === 0) {
        return NextResponse.json(
          { error: "Max plan not purchased", code: "NO_MAX_PLAN" },
          { status: 403 }
        );
      }

      // 現在のMax枠の使用状況を確認
      const userCompanies = await companiesCol.find({ companyId: { $in: user.companyIds } }).toArray();
      const currentMaxCompanies = userCompanies.filter(c => c.plan === "max").length;
      const maxSlots = maxPlanCount * 5; // 1購入につき5枠

      // 既にMaxプランのcompanyを数え、使用可能な枠があるか確認
      // 各Max companyは1枠を使用（将来的にエージェント数で管理も可能）
      if (currentMaxCompanies >= maxPlanCount) {
        return NextResponse.json(
          {
            error: "Max plan slots full",
            code: "MAX_SLOTS_FULL",
            currentMaxCompanies,
            maxPlanCount
          },
          { status: 403 }
        );
      }
    }

    // プランを更新
    await companiesCol.updateOne(
      { companyId },
      { $set: { plan } }
    );

    console.log(`[Plan] Company ${companyId} plan changed to ${plan} by user ${session.user.id}`);

    return NextResponse.json({
      success: true,
      companyId,
      plan,
    });
  } catch (error) {
    console.error("Update company plan error:", error);
    return NextResponse.json(
      { error: "Failed to update company plan" },
      { status: 500 }
    );
  }
}
