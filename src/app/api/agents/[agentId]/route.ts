import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { User, Agent } from "@/lib/types";

// PUT/PATCH: エージェント設定を更新（ウェルカムメッセージ等）
async function updateAgent(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { agentId } = await params;
    const body = await req.json();

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

    // 許可するフィールドのみ更新
    const allowedFields = ["welcomeMessage", "name", "themeColor", "voiceEnabled", "avatarUrl", "widgetPosition", "quickButtons"];
    const updateData: Partial<Agent> = {};

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (updateData as any)[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    await agentsCol.updateOne(
      { agentId },
      { $set: updateData }
    );

    console.log(`[Update] Agent ${agentId} updated:`, Object.keys(updateData));

    return NextResponse.json({ success: true, updated: Object.keys(updateData) });
  } catch (error) {
    console.error("Update agent error:", error);
    return NextResponse.json(
      { error: "Failed to update agent" },
      { status: 500 }
    );
  }
}

// エクスポート
export { updateAgent as PUT, updateAgent as PATCH };

// DELETE: エージェントを削除
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

    const companyId = agent.companyId;

    // 関連データを削除
    // 1. エージェントを削除
    await agentsCol.deleteOne({ agentId });

    // 2. 会社データを削除
    const companiesCol = await getCollection("companies");
    await companiesCol.deleteOne({ companyId });

    // 3. ドキュメント（埋め込みデータ）を削除
    const documentsCol = await getCollection("documents");
    await documentsCol.deleteMany({ companyId });

    // 4. アバターを削除
    const avatarsCol = await getCollection("avatars");
    await avatarsCol.deleteMany({ agentId });

    // 5. ユーザーからcompanyIdを削除
    await usersCol.updateOne(
      { userId: session.user.id },
      { $pull: { companyIds: companyId } }
    );

    console.log(`[Delete] Agent ${agentId} and company ${companyId} deleted`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete agent error:", error);
    return NextResponse.json(
      { error: "Failed to delete agent" },
      { status: 500 }
    );
  }
}
