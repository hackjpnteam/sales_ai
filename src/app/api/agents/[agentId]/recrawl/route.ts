import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { auth } from "@/lib/auth";
import { Company, Agent, User } from "@/lib/types";
import { crawlAndEmbedSiteWithProgress, CrawlProgress } from "@/lib/crawler";

// POST: サイトを再クロールして基本情報のみ更新（プロンプト・ナレッジは保持）
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { agentId } = await params;

    const agentsCol = await getCollection<Agent>("agents");
    const companiesCol = await getCollection<Company>("companies");
    const usersCol = await getCollection<User>("users");

    // エージェントを取得
    const agent = await agentsCol.findOne({ agentId });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // 会社を取得
    const company = await companiesCol.findOne({ companyId: agent.companyId });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // 権限チェック（所有者または共有ユーザー）
    const user = await usersCol.findOne({ userId: session.user.id });
    const isOwner = user?.companyIds?.includes(agent.companyId);
    const isSharedUser = agent.sharedWith?.some(
      (shared) => shared.email === session.user.email || shared.userId === session.user.id
    );

    if (!isOwner && !isSharedUser) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 会社のrootUrlを取得
    const rootUrl = company.rootUrl;
    if (!rootUrl) {
      return NextResponse.json({ error: "Company URL not found" }, { status: 400 });
    }

    console.log(`[Recrawl] Starting recrawl for agent ${agentId}, URL: ${rootUrl}`);

    // SSEストリーミングレスポンス
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          // クロールを実行（進捗コールバック付き）
          const result = await crawlAndEmbedSiteWithProgress(
            {
              companyId: agent.companyId,
              agentId,
              rootUrl,
            },
            (progress: CrawlProgress) => {
              // 進捗をSSEで送信（progressにはtypeが含まれている）
              sendEvent(progress);
            }
          );

          // 基本情報のみ更新（プロンプト・ナレッジは保持）
          if (result.companyInfo && Object.keys(result.companyInfo).length > 0) {
            await agentsCol.updateOne(
              { agentId },
              {
                $set: {
                  companyInfo: result.companyInfo,
                  themeColor: result.themeColor || agent.themeColor,
                  updatedAt: new Date(),
                },
              }
            );

            console.log(`[Recrawl] Updated company info for agent ${agentId}`);

            sendEvent({
              type: "complete",
              success: true,
              companyInfo: result.companyInfo,
              themeColor: result.themeColor,
              pagesCount: result.pagesVisited || 0,
            });
          } else {
            sendEvent({
              type: "complete",
              success: true,
              companyInfo: null,
              message: "クロールは完了しましたが、基本情報を抽出できませんでした",
            });
          }
        } catch (error) {
          console.error("[Recrawl] Error:", error);
          sendEvent({
            type: "error",
            error: "再クロールに失敗しました",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[Recrawl] Error:", error);
    return NextResponse.json(
      { error: "再クロールに失敗しました" },
      { status: 500 }
    );
  }
}
