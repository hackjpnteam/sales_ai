import { NextRequest, NextResponse } from "next/server";
import { getStripe, getPriceId } from "@/lib/stripe";
import { auth } from "@/lib/auth";
import { checkRateLimit, getClientIP, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    // レート制限チェック
    const clientIP = getClientIP(req);
    const rateLimit = await checkRateLimit(clientIP, "checkout", RATE_LIMIT_CONFIGS.checkout);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらくお待ちください。" },
        { status: 429 }
      );
    }

    const authSession = await auth();
    const userId = authSession?.user?.id || "";

    const { companyId, email, plan } = await req.json();

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required" },
        { status: 400 }
      );
    }

    if (!plan || !["lite", "pro", "max"].includes(plan)) {
      return NextResponse.json(
        { error: "Valid plan (lite, pro or max) is required" },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const priceId = getPriceId(plan);

    if (!priceId) {
      return NextResponse.json(
        { error: "Price ID not configured for this plan" },
        { status: 500 }
      );
    }

    // Checkout セッションを作成
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:4000"}/dashboard?success=true&companyId=${companyId}&plan=${plan}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:4000"}/dashboard?canceled=true`,
      customer_email: email,
      metadata: {
        companyId,
        plan,
        userId, // Link to user if authenticated
      },
      subscription_data: {
        metadata: {
          companyId,
          plan,
          userId,
        },
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
