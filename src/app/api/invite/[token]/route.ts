import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { Invitation, Agent, Company, User } from "@/lib/types";

// GET: 招待情報を取得
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 });
    }

    const invitationsCol = await getCollection<Invitation>("invitations");
    const invitation = await invitationsCol.findOne({
      token,
      isLinkInvitation: true,
    });

    if (!invitation) {
      return NextResponse.json(
        { valid: false, error: "招待が見つかりません" },
        { status: 404 }
      );
    }

    // ステータスと期限をチェック
    if (invitation.status !== "pending") {
      return NextResponse.json(
        { valid: false, error: "この招待は既に使用されているか、無効化されています" },
        { status: 400 }
      );
    }

    if (new Date(invitation.expiresAt) < new Date()) {
      return NextResponse.json(
        { valid: false, error: "この招待は期限切れです" },
        { status: 400 }
      );
    }

    // エージェント情報を取得
    const agentsCol = await getCollection<Agent>("agents");
    const agent = await agentsCol.findOne({ agentId: invitation.agentId });

    if (!agent) {
      return NextResponse.json(
        { valid: false, error: "エージェントが見つかりません" },
        { status: 404 }
      );
    }

    // 会社情報を取得
    const companiesCol = await getCollection<Company>("companies");
    const company = await companiesCol.findOne({ companyId: agent.companyId });

    // 招待者情報を取得
    const usersCol = await getCollection<User>("users");
    const inviter = await usersCol.findOne({ userId: invitation.invitedBy });

    return NextResponse.json({
      valid: true,
      agentName: agent.name || "無題のエージェント",
      companyName: company?.name || undefined,
      inviterName: inviter?.name || inviter?.email || undefined,
      expiresAt: invitation.expiresAt,
    });
  } catch (error) {
    console.error("Get invite info error:", error);
    return NextResponse.json(
      { valid: false, error: "招待情報の取得に失敗しました" },
      { status: 500 }
    );
  }
}
