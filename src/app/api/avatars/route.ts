import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { User, Agent as AgentType } from "@/lib/types";

// アバター型
type Avatar = {
  avatarId: string;
  agentId: string;
  companyId: string;
  name: string;
  dataUrl: string; // Base64 data URL
  createdAt: Date;
};

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

// GET: エージェントのアバター一覧を取得
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");

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

    // アバター一覧を取得
    const avatarsCol = await getCollection<Avatar>("avatars");
    const avatars = await avatarsCol
      .find({ agentId })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ avatars });
  } catch (error) {
    console.error("Get avatars error:", error);
    return NextResponse.json({ error: "Failed to get avatars" }, { status: 500 });
  }
}

// POST: 新しいアバターをアップロード
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const agentId = formData.get("agentId") as string | null;
    const name = formData.get("name") as string | null;

    if (!file || !agentId) {
      return NextResponse.json(
        { error: "file and agentId are required" },
        { status: 400 }
      );
    }

    // ファイルサイズチェック (1MB以下)
    if (file.size > 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be less than 1MB" },
        { status: 400 }
      );
    }

    // 画像タイプチェック
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image files are allowed" },
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

    // アバターを保存
    const avatarsCol = await getCollection<Avatar>("avatars");
    const avatarId = Math.random().toString(36).substring(2, 15);

    const avatar: Avatar = {
      avatarId,
      agentId,
      companyId: agent.companyId,
      name: name || file.name || "アバター",
      dataUrl,
      createdAt: new Date(),
    };

    await avatarsCol.insertOne(avatar);

    return NextResponse.json({
      success: true,
      avatar: {
        avatarId: avatar.avatarId,
        name: avatar.name,
        dataUrl: avatar.dataUrl,
      },
    });
  } catch (error) {
    console.error("Upload avatar error:", error);
    return NextResponse.json({ error: "Failed to upload avatar" }, { status: 500 });
  }
}

// DELETE: アバターを削除
export async function DELETE(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { avatarId } = await req.json();

    if (!avatarId) {
      return NextResponse.json({ error: "avatarId is required" }, { status: 400 });
    }

    const avatarsCol = await getCollection<Avatar>("avatars");
    const avatar = await avatarsCol.findOne({ avatarId });

    if (!avatar) {
      return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    }

    // エージェントを取得して所有権または共有アクセスを確認
    const agentsCol = await getCollection<AgentType>("agents");
    const agent = await agentsCol.findOne({ agentId: avatar.agentId });

    if (!agent || !await canAccessAgent(session, agent)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await avatarsCol.deleteOne({ avatarId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete avatar error:", error);
    return NextResponse.json({ error: "Failed to delete avatar" }, { status: 500 });
  }
}
