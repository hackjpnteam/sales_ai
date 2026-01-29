import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { User, Agent, Company, Invitation, SharedUser } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { sendShareNotification } from "@/lib/notifications";

// GET: エージェントの共有ユーザー一覧を取得
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { agentId } = await params;

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    const agentsCol = await getCollection<Agent>("agents");
    const agent = await agentsCol.findOne({ agentId });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // ユーザーがこの会社を所有しているか確認
    const usersCol = await getCollection<User>("users");
    const user = await usersCol.findOne({ userId: session.user.id });

    if (!user?.companyIds?.includes(agent.companyId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 保留中の招待も取得（URL共有リンクは除外）
    const invitationsCol = await getCollection<Invitation>("invitations");
    const pendingInvitations = await invitationsCol
      .find({
        agentId,
        status: "pending",
        isLinkInvitation: { $ne: true }
      })
      .toArray();

    return NextResponse.json({
      sharedWith: agent.sharedWith || [],
      pendingInvitations: pendingInvitations.map(inv => ({
        invitationId: inv.invitationId,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        createdAt: inv.createdAt,
      })),
    });
  } catch (error) {
    console.error("Get shared users error:", error);
    return NextResponse.json(
      { error: "Failed to get shared users" },
      { status: 500 }
    );
  }
}

// POST: ユーザーを共有に追加
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { agentId } = await params;
    const { email, role = "editor" } = await req.json();

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    // メールアドレスの正規化
    const normalizedEmail = email.toLowerCase().trim();

    const agentsCol = await getCollection<Agent>("agents");
    const agent = await agentsCol.findOne({ agentId });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // ユーザーがこの会社を所有しているか確認
    const usersCol = await getCollection<User>("users");
    const currentUser = await usersCol.findOne({ userId: session.user.id });

    if (!currentUser?.companyIds?.includes(agent.companyId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 自分自身を追加しようとしていないか確認
    if (currentUser.email.toLowerCase() === normalizedEmail) {
      return NextResponse.json(
        { error: "Cannot share with yourself" },
        { status: 400 }
      );
    }

    // 既に共有されていないか確認
    const existingShare = agent.sharedWith?.find(
      (s) => s.email.toLowerCase() === normalizedEmail
    );
    if (existingShare) {
      return NextResponse.json(
        { error: "Already shared with this user" },
        { status: 400 }
      );
    }

    // 対象ユーザーが存在するか確認（大文字小文字を区別しない）
    const targetUser = await usersCol.findOne({
      email: normalizedEmail,
    });

    if (targetUser) {
      // ユーザーが存在する場合、直接共有
      const sharedUser: SharedUser = {
        email: normalizedEmail,
        userId: targetUser.userId,
        role: role as "editor" | "viewer",
        addedAt: new Date(),
      };

      await agentsCol.updateOne(
        { agentId },
        { $push: { sharedWith: sharedUser } }
      );

      // 共有通知を送信
      try {
        await sendShareNotification({
          toUserId: targetUser.userId,
          fromUserId: session.user.id,
          fromUserName: currentUser.name || currentUser.email,
          agentId,
          agentName: agent.name || "無題のエージェント",
        });
      } catch (e) {
        console.error("Failed to send share notification:", e);
      }

      console.log(`[Share] Agent ${agentId} shared with ${normalizedEmail}`);

      return NextResponse.json({
        success: true,
        shared: true,
        message: "User added successfully",
      });
    } else {
      // ユーザーが存在しない場合、招待を作成
      const invitationsCol = await getCollection<Invitation>("invitations");

      // 既存の保留中招待があるか確認
      const existingInvitation = await invitationsCol.findOne({
        email: normalizedEmail,
        agentId,
        status: "pending",
      });

      if (existingInvitation) {
        return NextResponse.json(
          { error: "Invitation already sent", needsInvitation: true },
          { status: 400 }
        );
      }

      // 招待を作成
      const invitation: Invitation = {
        invitationId: uuidv4(),
        email: normalizedEmail,
        agentId,
        companyId: agent.companyId,
        invitedBy: session.user.id,
        role: role as "editor" | "viewer",
        status: "pending",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7日後
        createdAt: new Date(),
      };

      await invitationsCol.insertOne(invitation);

      console.log(`[Share] Invitation created for ${normalizedEmail} to agent ${agentId}`);

      return NextResponse.json({
        success: true,
        shared: false,
        needsInvitation: true,
        invitationId: invitation.invitationId,
        message: "User not found. Invitation created.",
      });
    }
  } catch (error) {
    console.error("Share agent error:", error);
    return NextResponse.json(
      { error: "Failed to share agent" },
      { status: 500 }
    );
  }
}

// DELETE: 共有を解除
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { agentId } = await params;
    const { email } = await req.json();

    if (!agentId || !email) {
      return NextResponse.json(
        { error: "agentId and email are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    const agentsCol = await getCollection<Agent>("agents");
    const agent = await agentsCol.findOne({ agentId });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // ユーザーがこの会社を所有しているか確認
    const usersCol = await getCollection<User>("users");
    const currentUser = await usersCol.findOne({ userId: session.user.id });

    if (!currentUser?.companyIds?.includes(agent.companyId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 共有を解除
    await agentsCol.updateOne(
      { agentId },
      { $pull: { sharedWith: { email: normalizedEmail } } }
    );

    // 保留中の招待も削除
    const invitationsCol = await getCollection<Invitation>("invitations");
    await invitationsCol.deleteMany({
      email: normalizedEmail,
      agentId,
      status: "pending",
    });

    console.log(`[Share] Removed ${normalizedEmail} from agent ${agentId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove share error:", error);
    return NextResponse.json(
      { error: "Failed to remove share" },
      { status: 500 }
    );
  }
}
