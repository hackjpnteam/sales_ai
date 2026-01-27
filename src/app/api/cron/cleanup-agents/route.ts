import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { Agent, Company, DocChunk, ChatLog } from "@/lib/types";

// Vercel Cron または手動実行用API
// 1週間（7日）使用されていない無料エージェントを削除

export async function GET(req: NextRequest) {
  // Cron認証（Vercel Cronの場合はAUTHORIZATION headerをチェック）
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // 本番環境ではCRON_SECRETが必要
  if (process.env.NODE_ENV === "production" && cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const [agentsCol, companiesCol, docChunksCol, chatLogsCol] = await Promise.all([
      getCollection<Agent>("agents"),
      getCollection<Company>("companies"),
      getCollection<DocChunk>("documents"),
      getCollection<ChatLog>("chat_logs"),
    ]);

    // 1週間前の日付
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // 無料プランの会社を取得
    const freeCompanies = await companiesCol
      .find({ plan: { $in: ["free", null, undefined] } })
      .toArray();

    const freeCompanyIds = freeCompanies.map((c) => c.companyId);

    if (freeCompanyIds.length === 0) {
      return NextResponse.json({
        message: "No free companies found",
        deletedAgents: 0,
      });
    }

    // 1週間以上使用されていない無料エージェントを検索
    // lastUsedAtがない場合はcreatedAtを使用
    const staleAgents = await agentsCol
      .find({
        companyId: { $in: freeCompanyIds },
        $or: [
          // lastUsedAtがあり、1週間以上前
          { lastUsedAt: { $lt: oneWeekAgo } },
          // lastUsedAtがなく、createdAtが1週間以上前
          {
            lastUsedAt: { $exists: false },
            createdAt: { $lt: oneWeekAgo },
          },
        ],
      })
      .toArray();

    if (staleAgents.length === 0) {
      return NextResponse.json({
        message: "No stale agents to delete",
        deletedAgents: 0,
      });
    }

    const staleAgentIds = staleAgents.map((a) => a.agentId);
    const staleCompanyIds = [...new Set(staleAgents.map((a) => a.companyId))];

    console.log(`[Cleanup] Deleting ${staleAgents.length} stale free agents`);

    // 関連データを削除
    const [agentsResult, companiesResult, docsResult, logsResult] = await Promise.all([
      // エージェントを削除
      agentsCol.deleteMany({ agentId: { $in: staleAgentIds } }),
      // 会社を削除（他のエージェントがない場合のみ）
      (async () => {
        let deletedCount = 0;
        for (const companyId of staleCompanyIds) {
          // この会社に他のエージェントがあるかチェック
          const otherAgents = await agentsCol.countDocuments({
            companyId,
            agentId: { $nin: staleAgentIds },
          });
          if (otherAgents === 0) {
            await companiesCol.deleteOne({ companyId });
            deletedCount++;
          }
        }
        return { deletedCount };
      })(),
      // ドキュメントチャンクを削除
      docChunksCol.deleteMany({ agentId: { $in: staleAgentIds } }),
      // チャットログを削除
      chatLogsCol.deleteMany({ agentId: { $in: staleAgentIds } }),
    ]);

    console.log(`[Cleanup] Deleted: agents=${agentsResult.deletedCount}, companies=${companiesResult.deletedCount}, docs=${docsResult.deletedCount}, logs=${logsResult.deletedCount}`);

    return NextResponse.json({
      message: "Cleanup completed",
      deletedAgents: agentsResult.deletedCount,
      deletedCompanies: companiesResult.deletedCount,
      deletedDocuments: docsResult.deletedCount,
      deletedChatLogs: logsResult.deletedCount,
      staleAgentIds,
    });
  } catch (error) {
    console.error("[Cleanup] Error:", error);
    return NextResponse.json(
      { error: "Cleanup failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
