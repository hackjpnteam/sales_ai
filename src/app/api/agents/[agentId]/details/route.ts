import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { User, Agent } from "@/lib/types";

// GET: エージェントの詳細情報を取得（avatarUrl, iconVideoUrl等の重いフィールドを含む）
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

    // ユーザーがこの会社を所有しているか、共有アクセス権があるか確認
    const usersCol = await getCollection<User>("users");
    const user = await usersCol.findOne({ userId: session.user.id });

    const isOwner = user?.companyIds?.includes(agent.companyId);
    const isSharedUser = agent.sharedWith?.some(
      (shared) => shared.email === session.user?.email || shared.userId === session.user?.id
    );

    if (!isOwner && !isSharedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // avatarUrlとiconVideoUrlのみを返す（他の重いデータは除外）
    return NextResponse.json({
      avatarUrl: agent.avatarUrl || null,
      iconVideoUrl: agent.iconVideoUrl || null,
    });
  } catch (error) {
    console.error("Get agent details error:", error);
    return NextResponse.json(
      { error: "Failed to get agent details" },
      { status: 500 }
    );
  }
}
