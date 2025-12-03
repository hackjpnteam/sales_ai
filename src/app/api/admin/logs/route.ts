import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { ChatLog } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const companyId = searchParams.get("companyId");
    const sessionId = searchParams.get("sessionId");
    const limit = parseInt(searchParams.get("limit") || "100");

    const chatLogsCol = await getCollection<ChatLog>("chat_logs");

    // フィルター条件を構築
    const filter: Record<string, string> = {};
    if (companyId) filter.companyId = companyId;
    if (sessionId) filter.sessionId = sessionId;

    const logs = await chatLogsCol
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    // セッションごとにグループ化
    const sessions = new Map<string, typeof logs>();
    for (const log of logs) {
      const key = log.sessionId;
      if (!sessions.has(key)) {
        sessions.set(key, []);
      }
      sessions.get(key)!.push(log);
    }

    // セッションごとに時系列順に並べ替え
    const groupedSessions = Array.from(sessions.entries()).map(([sessionId, messages]) => ({
      sessionId,
      companyId: messages[0]?.companyId,
      agentId: messages[0]?.agentId,
      messages: messages.sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
      startedAt: messages[messages.length - 1]?.createdAt,
    }));

    return NextResponse.json({
      logs,
      sessions: groupedSessions,
      total: logs.length
    });
  } catch (error) {
    console.error("Failed to fetch logs:", error);
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
