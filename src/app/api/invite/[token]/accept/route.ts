import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { Invitation, Agent, SharedUser, User } from "@/lib/types";
import { sendShareNotification } from "@/lib/notifications";
import { checkRateLimit, getClientIP, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

// POST: 招待を承認
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // レート制限チェック（ブルートフォース対策）
    const clientIP = getClientIP(req);
    const rateLimit = await checkRateLimit(clientIP, "invite", RATE_LIMIT_CONFIGS.invite);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらくお待ちください。" },
        { status: 429 }
      );
    }

    const session = await auth();
    console.log("[Accept Invite] Session:", { userId: session?.user?.id, email: session?.user?.email });

    if (!session?.user?.id || !session?.user?.email) {
      console.log("[Accept Invite] No session - returning 401");
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }

    const { token } = await params;
    console.log("[Accept Invite] Token:", token);

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const invitationsCol = await getCollection<Invitation>("invitations");
    const invitation = await invitationsCol.findOne({
      token,
      isLinkInvitation: true,
    });
    console.log("[Accept Invite] Invitation found:", !!invitation, invitation?.agentId);

    if (!invitation) {
      return NextResponse.json(
        { error: "招待が見つかりません" },
        { status: 404 }
      );
    }

    // ステータスと期限をチェック
    if (invitation.status !== "pending") {
      return NextResponse.json(
        { error: "この招待は既に使用されているか、無効化されています" },
        { status: 400 }
      );
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: "この招待は期限切れです" },
        { status: 400 }
      );
    }

    // エージェント情報を取得
    const agentsCol = await getCollection<Agent>("agents");
    const agent = await agentsCol.findOne({ agentId: invitation.agentId });

    if (!agent) {
      return NextResponse.json(
        { error: "エージェントが見つかりません" },
        { status: 404 }
      );
    }

    // 既に共有されていないか確認
    const userEmail = session.user.email.toLowerCase();
    const existingShare = agent.sharedWith?.find(
      (s) => s.email.toLowerCase() === userEmail || s.userId === session.user.id
    );

    if (existingShare) {
      return NextResponse.json({
        success: true,
        alreadyShared: true,
        agentId: agent.agentId,
        message: "既に共有されています",
      });
    }

    // 自分自身（オーナー）でないか確認
    if (invitation.invitedBy === session.user.id) {
      return NextResponse.json(
        { error: "自分自身に共有することはできません" },
        { status: 400 }
      );
    }

    // 共有を追加
    const sharedUser: SharedUser = {
      email: userEmail,
      userId: session.user.id,
      role: invitation.role,
      addedAt: new Date(),
    };

    await agentsCol.updateOne(
      { agentId: invitation.agentId },
      { $push: { sharedWith: sharedUser } }
    );

    // 共有通知を送信
    try {
      const usersCol = await getCollection<User>("users");
      const inviter = await usersCol.findOne({ userId: invitation.invitedBy });
      await sendShareNotification({
        toUserId: session.user.id,
        fromUserId: invitation.invitedBy,
        fromUserName: inviter?.name || inviter?.email || "不明",
        agentId: invitation.agentId,
        agentName: agent.name || "無題のエージェント",
      });
    } catch (e) {
      console.error("Failed to send share notification:", e);
    }

    console.log(`[Share] User ${userEmail} accepted share link for agent ${invitation.agentId}`);

    return NextResponse.json({
      success: true,
      agentId: agent.agentId,
      message: "共有が完了しました",
    });
  } catch (error) {
    console.error("Accept invite error:", error);
    return NextResponse.json(
      { error: "招待の承認に失敗しました" },
      { status: 500 }
    );
  }
}
