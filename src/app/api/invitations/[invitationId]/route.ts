import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { Invitation, Agent, SharedUser } from "@/lib/types";

// GET: 招待の詳細を取得（未認証でも可）
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ invitationId: string }> }
) {
  try {
    const { invitationId } = await params;

    if (!invitationId) {
      return NextResponse.json({ error: "invitationId is required" }, { status: 400 });
    }

    const invitationsCol = await getCollection<Invitation>("invitations");
    const invitation = await invitationsCol.findOne({ invitationId });

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    // 期限切れチェック
    if (new Date() > invitation.expiresAt) {
      await invitationsCol.updateOne(
        { invitationId },
        { $set: { status: "expired" } }
      );
      return NextResponse.json({ error: "Invitation expired" }, { status: 410 });
    }

    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: `Invitation already ${invitation.status}` },
        { status: 400 }
      );
    }

    // エージェント情報を取得
    const agentsCol = await getCollection<Agent>("agents");
    const agent = await agentsCol.findOne({ agentId: invitation.agentId });

    return NextResponse.json({
      email: invitation.email,
      role: invitation.role,
      agentName: agent?.name || "Unknown Agent",
      expiresAt: invitation.expiresAt,
    });
  } catch (error) {
    console.error("Get invitation error:", error);
    return NextResponse.json(
      { error: "Failed to get invitation" },
      { status: 500 }
    );
  }
}
