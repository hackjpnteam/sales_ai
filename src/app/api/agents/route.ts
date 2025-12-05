import { NextRequest } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { Agent, Company, User } from "@/lib/types";
import { crawlAndEmbedSiteWithProgress, validateAndNormalizeUrl } from "@/lib/crawler";
import { auth } from "@/lib/auth";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  // Get authenticated user (optional - agent creation works without auth too)
  const session = await auth();
  const userId = session?.user?.id;

  const body = await req.json();
  const {
    companyName,
    rootUrl: rawUrl,
    language = "ja",
    agentName,
    welcomeMessage,
    themeColor: userThemeColor,
    voiceEnabled = true,
  } = body;

  if (!companyName || !rawUrl) {
    return new Response(
      JSON.stringify({ error: "companyName and rootUrl are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // URLの検証と正規化
  const urlValidation = validateAndNormalizeUrl(rawUrl);
  if (!urlValidation.valid) {
    return new Response(
      JSON.stringify({ error: urlValidation.error || "無効なURLです" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const rootUrl = urlValidation.url;
  const companyId = randomUUID();
  const agentId = randomUUID();

  // ユーザー指定のテーマカラーがデフォルト以外の場合は優先
  const hasUserThemeColor = userThemeColor && userThemeColor !== "#FF6FB1" && userThemeColor !== "#2563eb";

  const companiesCol = await getCollection<Company>("companies");
  const agentsCol = await getCollection<Agent>("agents");

  const now = new Date();

  const company: Company = {
    companyId,
    name: companyName,
    rootUrl,
    language,
    userId, // Link to user if authenticated
    plan: "free",
    createdAt: now,
  };

  const agent: Agent = {
    agentId,
    companyId,
    name: agentName || (language === "en" ? `${companyName} AI` : `${companyName} AI`),
    welcomeMessage: welcomeMessage || (language === "en"
      ? "Hello! How can I help you today?"
      : "いらっしゃいませ。ご質問があれば何でもお聞きください。"),
    voiceEnabled,
    themeColor: userThemeColor || "#2563eb",
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
        const result = await crawlAndEmbedSiteWithProgress(
          { companyId, agentId, rootUrl },
          (progress) => {
            sendEvent(progress);
          }
        );

        // クロールが失敗した場合（コンテンツが取得できなかった）
        if (!result.success || result.totalChunks === 0) {
          // 作成したデータを削除
          await companiesCol.deleteOne({ companyId });
          await agentsCol.deleteOne({ agentId });

          sendEvent({
            type: "error",
            message: "サイトからコンテンツを取得できませんでした。URLを確認して再度お試しください。",
          });
          return;
        }

        // themeColorを更新（ユーザー指定がない場合のみ自動抽出を使用）
        let finalThemeColor = userThemeColor || "#2563eb";
        if (!hasUserThemeColor && result.themeColor && result.themeColor !== "#2563eb") {
          await agentsCol.updateOne(
            { agentId },
            { $set: { themeColor: result.themeColor } }
          );
          finalThemeColor = result.themeColor;
        }

        // Link company to user if authenticated
        if (userId) {
          const usersCol = await getCollection<User>("users");
          await usersCol.updateOne(
            { userId },
            { $addToSet: { companyIds: companyId } }
          );
        }

        // 完了イベント
        sendEvent({
          type: "complete",
          companyId,
          agentId,
          themeColor: finalThemeColor,
          pagesVisited: result.pagesVisited,
          totalChunks: result.totalChunks,
        });
      } catch (error) {
        // エラー時もデータを削除
        await companiesCol.deleteOne({ companyId });
        await agentsCol.deleteOne({ agentId });

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
