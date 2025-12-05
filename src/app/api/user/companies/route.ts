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

    // Get agents for each company
    const companiesWithAgents = await Promise.all(
      companies.map(async (company) => {
        const agents = await agentsCol
          .find({ companyId: company.companyId })
          .toArray();
        return {
          ...company,
          agents,
        };
      })
    );

    return NextResponse.json({
      companies: companiesWithAgents,
    });
  } catch (error) {
    console.error("Get user companies error:", error);
    return NextResponse.json(
      { error: "Failed to get companies" },
      { status: 500 }
    );
  }
}
