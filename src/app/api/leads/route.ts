import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { User, Agent, Lead, ChatLog } from "@/lib/types";

// GET: リード一覧を取得
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
    const agentsCol = await getCollection<Agent>("agents");
    const agent = await agentsCol.findOne({ agentId });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // ユーザーがこのエージェントにアクセスできるか確認
    const usersCol = await getCollection<User>("users");
    const user = await usersCol.findOne({ userId: session.user.id });

    const isOwner = user?.companyIds?.includes(agent.companyId);
    const isSharedUser = agent.sharedWith?.some(
      (shared) => shared.email === session.user?.email || shared.userId === session.user?.id
    );

    if (!isOwner && !isSharedUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // リードを取得
    const leadsCol = await getCollection<Lead>("leads");
    const leads = await leadsCol
      .find({ agentId, companyId: agent.companyId })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    // 各リードの会話ログを取得
    const chatLogsCol = await getCollection<ChatLog>("chat_logs");
    const leadsWithLogs = await Promise.all(
      leads.map(async (lead) => {
        const logs = await chatLogsCol
          .find({ sessionId: lead.sessionId, companyId: agent.companyId })
          .sort({ createdAt: 1 })
          .toArray();

        return {
          leadId: lead.leadId,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          inquiry: lead.inquiry,
          pageUrl: lead.pageUrl,
          deviceType: lead.deviceType,
          status: lead.status,
          notes: lead.notes,
          createdAt: lead.createdAt,
          updatedAt: lead.updatedAt,
          conversationLogs: logs.map((log) => ({
            role: log.role,
            content: log.content,
            createdAt: log.createdAt,
          })),
        };
      })
    );

    return NextResponse.json({ leads: leadsWithLogs });
  } catch (error) {
    console.error("Get leads error:", error);
    return NextResponse.json(
      { error: "Failed to get leads" },
      { status: 500 }
    );
  }
}

// PATCH: リードのステータスやメモを更新
export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { leadId, status, notes } = body;

    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    const leadsCol = await getCollection<Lead>("leads");
    const lead = await leadsCol.findOne({ leadId });

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // ユーザーがこのリードにアクセスできるか確認
    const usersCol = await getCollection<User>("users");
    const user = await usersCol.findOne({ userId: session.user.id });

    if (!user?.companyIds?.includes(lead.companyId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // 更新
    const updateData: Partial<Lead> = { updatedAt: new Date() };
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    await leadsCol.updateOne({ leadId }, { $set: updateData });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update lead error:", error);
    return NextResponse.json(
      { error: "Failed to update lead" },
      { status: 500 }
    );
  }
}
