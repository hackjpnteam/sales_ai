import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { User, Agent } from "@/lib/types";

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { agentId, themeColor } = await req.json();

    if (!agentId || !themeColor) {
      return NextResponse.json(
        { error: "agentId and themeColor are required" },
        { status: 400 }
      );
    }

    // Validate color format
    if (!/^#[0-9A-Fa-f]{6}$/.test(themeColor)) {
      return NextResponse.json(
        { error: "Invalid color format. Use hex format like #D86672" },
        { status: 400 }
      );
    }

    const agentsCol = await getCollection<Agent>("agents");

    // Find the agent
    const agent = await agentsCol.findOne({ agentId });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Check if user owns this company or has shared access
    const usersCol = await getCollection<User>("users");
    const user = await usersCol.findOne({ userId: session.user.id });

    const isOwner = user?.companyIds?.includes(agent.companyId);
    const isSharedUser = agent.sharedWith?.some(
      (shared) => shared.email === session.user?.email || shared.userId === session.user?.id
    );

    if (!isOwner && !isSharedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Update the theme color
    await agentsCol.updateOne(
      { agentId },
      { $set: { themeColor, updatedAt: new Date() } }
    );

    return NextResponse.json({ success: true, themeColor });
  } catch (error) {
    console.error("Color update error:", error);
    return NextResponse.json(
      { error: "Failed to update color" },
      { status: 500 }
    );
  }
}
