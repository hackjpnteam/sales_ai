import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { User, Agent, Invitation } from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

// GET: 既存の共有リンクを取得
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

    // 既存の有効な共有リンクを取得
    const invitationsCol = await getCollection<Invitation>("invitations");
    const existingLink = await invitationsCol.findOne({
      agentId,
      isLinkInvitation: true,
      status: "pending",
      expiresAt: { $gt: new Date() },
    });

    if (existingLink && existingLink.token) {
      return NextResponse.json({
        hasLink: true,
        token: existingLink.token,
        expiresAt: existingLink.expiresAt,
      });
    }

    return NextResponse.json({ hasLink: false });
  } catch (error) {
    console.error("Get share link error:", error);
    return NextResponse.json(
      { error: "Failed to get share link" },
      { status: 500 }
    );
  }
}

// POST: 新しい共有リンクを生成
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

    const invitationsCol = await getCollection<Invitation>("invitations");

    // 既存の共有リンクを無効化
    await invitationsCol.updateMany(
      { agentId, isLinkInvitation: true, status: "pending" },
      { $set: { status: "expired" } }
    );

    // 新しいトークンを生成
    const token = crypto.randomBytes(32).toString("hex");

    // 新しい共有リンクを作成（30日間有効）
    const invitation: Invitation = {
      invitationId: uuidv4(),
      token,
      isLinkInvitation: true,
      agentId,
      companyId: agent.companyId,
      invitedBy: session.user.id,
      role: "editor",
      status: "pending",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30日後
      createdAt: new Date(),
    };

    await invitationsCol.insertOne(invitation);

    console.log(`[Share] Created share link for agent ${agentId}`);

    return NextResponse.json({
      success: true,
      token,
      expiresAt: invitation.expiresAt,
    });
  } catch (error) {
    console.error("Create share link error:", error);
    return NextResponse.json(
      { error: "Failed to create share link" },
      { status: 500 }
    );
  }
}

// DELETE: 共有リンクを無効化
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

    // 共有リンクを無効化
    const invitationsCol = await getCollection<Invitation>("invitations");
    await invitationsCol.updateMany(
      { agentId, isLinkInvitation: true, status: "pending" },
      { $set: { status: "expired" } }
    );

    console.log(`[Share] Disabled share link for agent ${agentId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete share link error:", error);
    return NextResponse.json(
      { error: "Failed to delete share link" },
      { status: 500 }
    );
  }
}
