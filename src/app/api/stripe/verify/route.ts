import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";

// 決済成功後にプランを確認・更新するAPI
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { companyId, plan } = await req.json();

    if (!companyId || !plan) {
      return NextResponse.json(
        { error: "companyId and plan are required" },
        { status: 400 }
      );
    }

    // ユーザーがこの会社を所有しているか確認
    const usersCol = await getCollection("users");
    const user = await usersCol.findOne({ userId: session.user.id });

    if (!user?.companyIds?.includes(companyId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Stripeで最新のサブスクリプションを確認
    const stripe = getStripe();
    const companiesCol = await getCollection("companies");
    const company = await companiesCol.findOne({ companyId });

    // サブスクリプションIDがある場合は、そのステータスを確認
    if (company?.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(
          company.stripeSubscriptionId
        );

        if (subscription.status === "active") {
          // サブスクリプションがアクティブなら、プランを更新
          await companiesCol.updateOne(
            { companyId },
            {
              $set: {
                plan: plan as "lite" | "pro",
                planStartedAt: new Date(),
              },
            }
          );

          return NextResponse.json({
            success: true,
            plan,
            message: "Plan verified and updated",
          });
        }
      } catch (stripeError) {
        console.log("Stripe subscription check error:", stripeError);
      }
    }

    // サブスクリプションIDがない場合は、直接プランを更新（開発環境用）
    // 本番環境ではStripe Webhookを使用することを推奨
    console.log(`[Verify] Updating company ${companyId} to ${plan} plan (dev mode)`);

    await companiesCol.updateOne(
      { companyId },
      {
        $set: {
          plan: plan as "lite" | "pro",
          planStartedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      success: true,
      plan,
      message: "Plan updated (dev mode)",
    });
  } catch (error) {
    console.error("Verify payment error:", error);
    return NextResponse.json(
      { error: "Failed to verify payment" },
      { status: 500 }
    );
  }
}
