import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { Company, Agent } from "@/lib/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  try {
    const companiesCol = await getCollection<Company>("companies");
    const company = await companiesCol.findOne({ companyId });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Get agent info as well
    const agentsCol = await getCollection<Agent>("agents");
    const agent = await agentsCol.findOne({ companyId });

    return NextResponse.json({
      company: {
        companyId: company.companyId,
        name: company.name,
        language: company.language,
      },
      agent: agent ? {
        name: agent.name,
        welcomeMessage: agent.welcomeMessage,
        voiceEnabled: agent.voiceEnabled,
        themeColor: agent.themeColor,
        avatarUrl: agent.avatarUrl || "/agent-avatar.png",
      } : null,
    });
  } catch (error) {
    console.error("Failed to fetch company:", error);
    return NextResponse.json({ error: "Failed to fetch company" }, { status: 500 });
  }
}
