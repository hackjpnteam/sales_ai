import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import type { PlanType } from "@/lib/stripe";

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  try {
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
