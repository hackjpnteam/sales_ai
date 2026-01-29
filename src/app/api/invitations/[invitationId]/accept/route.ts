import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { User, Invitation, Agent, SharedUser } from "@/lib/types";
import { sendShareNotification } from "@/lib/notifications";

// POST: 招待を受け入れる
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ invitationId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // 現在のユーザー情報を取得
    const usersCol = await getCollection<User>("users");
    const user = await usersCol.findOne({ userId: session.user.id });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // メールアドレスが一致するか確認
    if (!invitation.email || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.json(
        { error: "Email mismatch. This invitation was sent to a different email address." },
        { status: 403 }
      );
    }

    // エージェントに共有ユーザーとして追加
    const agentsCol = await getCollection<Agent>("agents");
    const agent = await agentsCol.findOne({ agentId: invitation.agentId });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // 既に共有されていないか確認
    const alreadyShared = agent.sharedWith?.some(
      (s) => s.userId === user.userId || s.email?.toLowerCase() === user.email.toLowerCase()
    );

    if (!alreadyShared) {
      const sharedUser: SharedUser = {
        email: user.email.toLowerCase(),
        userId: user.userId,
        role: invitation.role,
        addedAt: new Date(),
      };

      await agentsCol.updateOne(
        { agentId: invitation.agentId },
        { $push: { sharedWith: sharedUser } }
      );
    }

    // 招待を承認済みに更新
    await invitationsCol.updateOne(
      { invitationId },
      { $set: { status: "accepted" } }
    );

    // 共有通知を送信
    try {
      const inviter = await usersCol.findOne({ userId: invitation.invitedBy });
      await sendShareNotification({
        toUserId: user.userId,
        fromUserId: invitation.invitedBy,
        fromUserName: inviter?.name || inviter?.email || "不明",
        agentId: invitation.agentId,
        agentName: agent.name || "無題のエージェント",
      });
    } catch (e) {
      console.error("Failed to send share notification:", e);
    }

    console.log(`[Invitation] ${user.email} accepted invitation to agent ${invitation.agentId}`);

    return NextResponse.json({
      success: true,
      agentId: invitation.agentId,
      agentName: agent.name,
    });
  } catch (error) {
    console.error("Accept invitation error:", error);
    return NextResponse.json(
      { error: "Failed to accept invitation" },
      { status: 500 }
    );
  }
}
