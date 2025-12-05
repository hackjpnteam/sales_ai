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

    const { agentId, welcomeMessage, voiceEnabled, avatarUrl, widgetPosition } = await req.json();

    if (!agentId) {
      return NextResponse.json(
        { error: "agentId is required" },
        { status: 400 }
      );
    }

    const agentsCol = await getCollection<Agent>("agents");

    // Find the agent
    const agent = await agentsCol.findOne({ agentId });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Check if user owns this company
    const usersCol = await getCollection<User>("users");
    const user = await usersCol.findOne({ userId: session.user.id });

    if (!user?.companyIds?.includes(agent.companyId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Build update object
    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (welcomeMessage !== undefined) {
      updateFields.welcomeMessage = welcomeMessage;
    }

    if (voiceEnabled !== undefined) {
      updateFields.voiceEnabled = Boolean(voiceEnabled);
    }

    if (avatarUrl !== undefined) {
      updateFields.avatarUrl = avatarUrl;
    }

    if (widgetPosition !== undefined && ["bottom-right", "bottom-left", "bottom-center"].includes(widgetPosition)) {
      updateFields.widgetPosition = widgetPosition;
    }

    // Update the agent
    await agentsCol.updateOne(
      { agentId },
      { $set: updateFields }
    );

    return NextResponse.json({
      success: true,
      welcomeMessage: updateFields.welcomeMessage,
      voiceEnabled: updateFields.voiceEnabled,
      avatarUrl: updateFields.avatarUrl,
      widgetPosition: updateFields.widgetPosition,
    });
  } catch (error) {
    console.error("Settings update error:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
