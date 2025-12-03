import { NextRequest } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { Agent, Company } from "@/lib/types";
import { crawlAndEmbedSiteWithProgress } from "@/lib/crawler";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { companyName, rootUrl, language = "ja" } = body;

  if (!companyName || !rootUrl) {
    return new Response(
      JSON.stringify({ error: "companyName and rootUrl are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const companyId = randomUUID();
  const agentId = randomUUID();

  const companiesCol = await getCollection<Company>("companies");
  const agentsCol = await getCollection<Agent>("agents");

  const now = new Date();

  const company: Company = {
    companyId,
    name: companyName,
    rootUrl,
    language,
    createdAt: now,
  };

  const agent: Agent = {
    agentId,
    companyId,
    name: `${companyName} 接客AI`,
    welcomeMessage: "いらっしゃいませ。ご質問があれば何でもお聞きください。",
    voiceEnabled: true,
    themeColor: "#2563eb",
    createdAt: now,
  };

  await companiesCol.insertOne(company);
  await agentsCol.insertOne(agent);

  // Server-Sent Events でストリーミング
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // 進捗コールバック付きでクロール実行
        await crawlAndEmbedSiteWithProgress(
          { companyId, agentId, rootUrl },
          (progress) => {
            sendEvent(progress);
          }
        );

        // 完了イベント
        sendEvent({
          type: "complete",
          companyId,
          agentId,
        });
      } catch (error) {
        sendEvent({
          type: "error",
          message: error instanceof Error ? error.message : "エラーが発生しました",
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
}
