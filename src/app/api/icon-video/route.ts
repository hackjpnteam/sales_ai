import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { User, Agent as AgentType } from "@/lib/types";

// ユーザーがエージェントにアクセスできるか確認するヘルパー関数
async function canAccessAgent(session: { user: { id?: string; email?: string | null } }, agent: AgentType): Promise<boolean> {
  const usersCol = await getCollection<User>("users");

  // ユーザーが所有者かチェック
  const user = await usersCol.findOne({ userId: session.user.id });
  if (user?.companyIds?.includes(agent.companyId)) {
    return true;
  }

  // 共有されているかチェック
  if (agent.sharedWith?.some(
    (shared) => shared.email === session.user.email || shared.userId === session.user.id
  )) {
    return true;
  }

  return false;
}

// POST: アイコン動画をアップロード
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const agentId = formData.get("agentId") as string | null;

    if (!file || !agentId) {
      return NextResponse.json(
        { error: "file and agentId are required" },
        { status: 400 }
      );
    }

    // ファイルサイズチェック (15MB以下)
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json(
        { error: "ファイルサイズは15MB以下にしてください" },
        { status: 400 }
      );
    }

    // 動画タイプチェック
    const allowedTypes = ["video/mp4", "video/webm", "video/quicktime"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "MP4、WebM、MOV形式の動画のみアップロードできます" },
        { status: 400 }
      );
    }

    // エージェントを取得
    const agentsCol = await getCollection<AgentType>("agents");
    const agent = await agentsCol.findOne({ agentId });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // 所有権または共有アクセスを確認
    if (!await canAccessAgent(session, agent)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // ファイルをBase64に変換
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    // エージェントの iconVideoUrl を更新
    await agentsCol.updateOne(
      { agentId },
      { $set: { iconVideoUrl: dataUrl, updatedAt: new Date() } }
    );

    return NextResponse.json({
      success: true,
      iconVideoUrl: dataUrl,
    });
  } catch (error) {
    console.error("Upload icon video error:", error);
    return NextResponse.json({ error: "動画のアップロードに失敗しました" }, { status: 500 });
  }
}

// DELETE: アイコン動画を削除
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { agentId } = await req.json();

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    // エージェントを取得
    const agentsCol = await getCollection<AgentType>("agents");
    const agent = await agentsCol.findOne({ agentId });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // 所有権または共有アクセスを確認
    if (!await canAccessAgent(session, agent)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // iconVideoUrl を削除
    await agentsCol.updateOne(
      { agentId },
      { $unset: { iconVideoUrl: "" }, $set: { updatedAt: new Date() } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete icon video error:", error);
    return NextResponse.json({ error: "動画の削除に失敗しました" }, { status: 500 });
  }
}
