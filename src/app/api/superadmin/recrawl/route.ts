import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/admin";
// Auth.js v5 - using auth() instead of getServerSession
import { getCollection } from "@/lib/mongodb";
import { crawlAndEmbedSite } from "@/lib/crawler";
import { Agent, DocChunk } from "@/lib/types";

// 再クロール対象のエージェント情報
type AgentInfo = {
  agentId: string;
  companyId: string;
  name: string;
  rootUrl: string;
  docCount: number;
  hasCeoInfo: boolean;
  hasFoundingInfo: boolean;
};

// GET: 再クロールが必要なエージェントの一覧を取得
export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !isSuperAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const agentsCol = await getCollection<Agent>("agents");
    const docsCol = await getCollection<DocChunk>("documents");

    const agents = await agentsCol.find({}).toArray();
    const results: AgentInfo[] = [];

    for (const agent of agents) {
      const docs = await docsCol.find({ companyId: agent.companyId }).toArray();

      // 代表者情報の有無
      const hasCeoInfo = docs.some(
        (d) =>
          d.chunk &&
          (d.chunk.includes("代表取締役") ||
            d.chunk.includes("代表者") ||
            d.chunk.includes("CEO") ||
            d.chunk.includes("社長"))
      );

      // 創業/設立情報の有無
      const hasFoundingInfo = docs.some(
        (d) =>
          d.chunk &&
          (d.chunk.includes("創業") ||
            d.chunk.includes("設立") ||
            d.chunk.includes("founded") ||
            d.chunk.includes("established"))
      );

      results.push({
        agentId: agent.agentId,
        companyId: agent.companyId,
        name: agent.name || "Unknown",
        rootUrl: agent.rootUrl || "",
        docCount: docs.length,
        hasCeoInfo,
        hasFoundingInfo,
      });
    }

    // 情報が不足しているエージェントを先に
    results.sort((a, b) => {
      const aScore = (a.hasCeoInfo ? 1 : 0) + (a.hasFoundingInfo ? 1 : 0);
      const bScore = (b.hasCeoInfo ? 1 : 0) + (b.hasFoundingInfo ? 1 : 0);
      return aScore - bScore;
    });

    const stats = {
      total: results.length,
      withCeoInfo: results.filter((r) => r.hasCeoInfo).length,
      withFoundingInfo: results.filter((r) => r.hasFoundingInfo).length,
      needsRecrawl: results.filter((r) => !r.hasCeoInfo || !r.hasFoundingInfo)
        .length,
    };

    return NextResponse.json({ agents: results, stats });
  } catch (error) {
    console.error("Error fetching agents:", error);
    return NextResponse.json(
      { error: "Failed to fetch agents" },
      { status: 500 }
    );
  }
}

// POST: エージェントを再クロール
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !isSuperAdmin(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { companyId, agentId, mode } = body;

    const agentsCol = await getCollection<Agent>("agents");
    const docsCol = await getCollection<DocChunk>("documents");

    // モード: single (単一) または missing (不足分のみ) または all (全て)
    let targetAgents: { companyId: string; agentId: string; rootUrl: string }[] =
      [];

    if (mode === "single" && companyId && agentId) {
      const agent = await agentsCol.findOne({ companyId, agentId });
      if (agent && agent.rootUrl) {
        targetAgents = [
          { companyId, agentId, rootUrl: agent.rootUrl },
        ];
      }
    } else if (mode === "missing") {
      // 代表者情報または創業情報がないエージェント
      const agents = await agentsCol.find({}).toArray();
      for (const agent of agents) {
        if (!agent.rootUrl) continue;

        const docs = await docsCol
          .find({ companyId: agent.companyId })
          .toArray();
        const hasCeoInfo = docs.some(
          (d) =>
            d.chunk &&
            (d.chunk.includes("代表取締役") ||
              d.chunk.includes("代表者") ||
              d.chunk.includes("CEO") ||
              d.chunk.includes("社長"))
        );
        const hasFoundingInfo = docs.some(
          (d) =>
            d.chunk &&
            (d.chunk.includes("創業") ||
              d.chunk.includes("設立") ||
              d.chunk.includes("founded") ||
              d.chunk.includes("established"))
        );

        if (!hasCeoInfo || !hasFoundingInfo) {
          targetAgents.push({
            companyId: agent.companyId,
            agentId: agent.agentId,
            rootUrl: agent.rootUrl,
          });
        }
      }
    } else if (mode === "all") {
      const agents = await agentsCol.find({ rootUrl: { $exists: true, $ne: "" } }).toArray();
      for (const a of agents) {
        if (a.rootUrl) {
          targetAgents.push({
            companyId: a.companyId,
            agentId: a.agentId,
            rootUrl: a.rootUrl,
          });
        }
      }
    }

    if (targetAgents.length === 0) {
      return NextResponse.json({ message: "No agents to recrawl", count: 0 });
    }

    // 既存のドキュメントを削除して再クロール
    const results = [];
    for (const target of targetAgents) {
      try {
        // 既存ドキュメントを削除
        await docsCol.deleteMany({ companyId: target.companyId });

        // 再クロール実行
        const result = await crawlAndEmbedSite({
          companyId: target.companyId,
          agentId: target.agentId,
          rootUrl: target.rootUrl,
        });

        // テーマカラーを更新
        if (result.themeColor) {
          await agentsCol.updateOne(
            { companyId: target.companyId, agentId: target.agentId },
            { $set: { themeColor: result.themeColor } }
          );
        }

        results.push({
          companyId: target.companyId,
          success: result.success,
          pagesVisited: result.pagesVisited,
          totalChunks: result.totalChunks,
        });
      } catch (error) {
        console.error(`Error recrawling ${target.companyId}:`, error);
        results.push({
          companyId: target.companyId,
          success: false,
          error: String(error),
        });
      }
    }

    return NextResponse.json({
      message: `Recrawled ${results.filter((r) => r.success).length}/${targetAgents.length} agents`,
      results,
    });
  } catch (error) {
    console.error("Error in recrawl:", error);
    return NextResponse.json({ error: "Failed to recrawl" }, { status: 500 });
  }
}
