import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { Agent } from "@/lib/types";

// POST: 共有されたユーザーが自分で共有を解除する
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session?.user?.email) {
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

    // 共有されているか確認
    const normalizedEmail = session.user.email.toLowerCase();
    const isSharedUser = agent.sharedWith?.some(
      (shared) =>
        shared.email?.toLowerCase() === normalizedEmail ||
        shared.userId === session.user?.id
    );

    if (!isSharedUser) {
      return NextResponse.json(
        { error: "You are not a shared user of this agent" },
        { status: 403 }
      );
    }

    // 共有リストから自分を削除
    await agentsCol.updateOne(
      { agentId },
      {
        $pull: {
          sharedWith: {
            $or: [
              { email: normalizedEmail },
              { userId: session.user.id }
            ]
          }
        }
      }
    );

    // $or が $pull 内で動かない場合があるので、両方の条件で削除を試みる
    await agentsCol.updateOne(
      { agentId },
      { $pull: { sharedWith: { email: normalizedEmail } } }
    );
    await agentsCol.updateOne(
      { agentId },
      { $pull: { sharedWith: { userId: session.user.id } } }
    );

    console.log(`[Share] User ${session.user.email} left sharing of agent ${agentId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Leave share error:", error);
    return NextResponse.json(
      { error: "Failed to leave share" },
      { status: 500 }
    );
  }
}
