import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { User, Agent, Company } from "@/lib/types";

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { agentId, name, welcomeMessage, voiceEnabled, avatarUrl, widgetPosition, widgetStyle, iconSize, tooltipText, tooltipDuration, languages } = await req.json();

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

    // Build update object
    const updateFields: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (name !== undefined && name.trim()) {
      updateFields.name = name.trim();
    }

    if (welcomeMessage !== undefined) {
      updateFields.welcomeMessage = welcomeMessage;
    }

    if (voiceEnabled !== undefined) {
      updateFields.voiceEnabled = Boolean(voiceEnabled);
    }

    if (avatarUrl !== undefined) {
      updateFields.avatarUrl = avatarUrl;
    }

    if (widgetPosition !== undefined && ["bottom-right", "bottom-left", "bottom-center", "middle-right", "middle-left"].includes(widgetPosition)) {
      updateFields.widgetPosition = widgetPosition;
    }

    if (widgetStyle !== undefined && ["bubble", "icon"].includes(widgetStyle)) {
      updateFields.widgetStyle = widgetStyle;
    }

    if (iconSize !== undefined && ["medium", "large", "xlarge"].includes(iconSize)) {
      updateFields.iconSize = iconSize;
    }

    if (tooltipText !== undefined) {
      updateFields.tooltipText = tooltipText;
    }

    if (tooltipDuration !== undefined) {
      updateFields.tooltipDuration = Number(tooltipDuration);
    }

    if (languages !== undefined && Array.isArray(languages) && languages.length > 0) {
      // Validate language codes
      const validLanguages = languages.filter((l: string) => ["ja", "zh", "en"].includes(l));
      if (validLanguages.length > 0) {
        updateFields.languages = validLanguages;
      }
    }

    // Update the agent
    await agentsCol.updateOne(
      { agentId },
      { $set: updateFields }
    );

    // Update company's updatedAt
    const companiesCol = await getCollection<Company>("companies");
    await companiesCol.updateOne(
      { companyId: agent.companyId },
      { $set: { updatedAt: new Date() } }
    );

    return NextResponse.json({
      success: true,
      name: updateFields.name,
      welcomeMessage: updateFields.welcomeMessage,
      voiceEnabled: updateFields.voiceEnabled,
      avatarUrl: updateFields.avatarUrl,
      widgetPosition: updateFields.widgetPosition,
      widgetStyle: updateFields.widgetStyle,
      iconSize: updateFields.iconSize,
      tooltipText: updateFields.tooltipText,
      tooltipDuration: updateFields.tooltipDuration,
      languages: updateFields.languages,
    });
  } catch (error) {
    console.error("Settings update error:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
