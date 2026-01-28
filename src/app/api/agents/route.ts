import { NextRequest } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { Agent, Company, User } from "@/lib/types";
import { crawlAndEmbedSiteWithProgress, validateAndNormalizeUrl } from "@/lib/crawler";
import { auth } from "@/lib/auth";
import { randomUUID } from "crypto";
import { getGeoFromIP, formatGeoLocation } from "@/lib/geoip";

export async function POST(req: NextRequest) {
  // Get authenticated user (optional - agent creation works without auth too)
  const session = await auth();
  const userId = session?.user?.id;

  // IPアドレスを取得（Vercel環境対応）
  const forwardedFor = req.headers.get("x-forwarded-for");
  const vercelForwardedFor = req.headers.get("x-vercel-forwarded-for");
  const realIp = req.headers.get("x-real-ip");
  const creatorIp =
    vercelForwardedFor?.split(",")[0]?.trim() ||
    forwardedFor?.split(",")[0]?.trim() ||
    realIp ||
    "unknown";
  const creatorUserAgent = req.headers.get("user-agent") || "unknown";

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

  const companiesCol = await getCollection<Company>("companies");
  const agentsCol = await getCollection<Agent>("agents");
  const usersCol = await getCollection<User>("users");

  // 無料エージェントは無制限で作成可能（1週間未使用で自動削除される）
  // 有料プランのエージェントのみ上限をチェック
  // ※ この制限チェックは有料プランへのアップグレード時に適用される

  const companyId = randomUUID();
  const agentId = randomUUID();

  // ユーザー指定のテーマカラーがデフォルト以外の場合は優先
  const hasUserThemeColor = userThemeColor && userThemeColor !== "#FF6FB1" && userThemeColor !== "#2563eb";

  const now = new Date();

  // ゲストユーザーの場合、IPから位置情報を取得
  let creatorLocation: string | undefined;
  if (!userId && creatorIp && creatorIp !== "unknown") {
    const geo = await getGeoFromIP(creatorIp);
    creatorLocation = formatGeoLocation(geo) || undefined;
  }

  const company: Company = {
    companyId,
    name: companyName,
    rootUrl,
    language,
    userId, // Link to user if authenticated
    plan: "free",
    createdAt: now,
    updatedAt: now,
    // ゲストユーザー作成時の情報を保存
    creatorIp: !userId ? creatorIp : undefined,
    creatorUserAgent: !userId ? creatorUserAgent : undefined,
    creatorLocation: !userId ? creatorLocation : undefined,
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
          // 403エラーやスクレイピングブロックの場合は、手動設定モードとしてエージェントを作成
          // エージェントは削除せず、デフォルト値で作成完了とする

          // Link company to user if authenticated
          if (userId) {
            await usersCol.updateOne(
              { userId },
              { $addToSet: { companyIds: companyId } }
            );
          }

          // 警告付きで完了イベントを送信
          const warningMessage = result.isSPA
            ? "このサイトはSPA（シングルページアプリケーション）のため、コンテンツを自動取得できませんでした。エージェントは作成されましたが、手動でナレッジを追加してください。"
            : "サイトからコンテンツを自動取得できませんでした（サイトがアクセスをブロックしている可能性があります）。エージェントは作成されましたが、手動でナレッジを追加してください。";

          sendEvent({
            type: "complete",
            companyId,
            agentId,
            themeColor: userThemeColor || "#2563eb",
            pagesVisited: 0,
            totalChunks: 0,
            warning: warningMessage,
            manualSetupRequired: true,
          });
          return;
        }

        // themeColorとcompanyInfoを更新
        let finalThemeColor = userThemeColor || "#2563eb";
        const updateFields: Record<string, unknown> = {};

        if (!hasUserThemeColor && result.themeColor && result.themeColor !== "#2563eb") {
          updateFields.themeColor = result.themeColor;
          finalThemeColor = result.themeColor;
        }

        // companyInfoがあれば保存
        if (result.companyInfo && Object.keys(result.companyInfo).length > 0) {
          updateFields.companyInfo = result.companyInfo;
        }

        if (Object.keys(updateFields).length > 0) {
          await agentsCol.updateOne({ agentId }, { $set: updateFields });
        }

        // Link company to user if authenticated
        if (userId) {
          await usersCol.updateOne(
            { userId },
            { $addToSet: { companyIds: companyId } }
          );
        }

        // 完了イベント（companyInfo含む）
        sendEvent({
          type: "complete",
          companyId,
          agentId,
          themeColor: finalThemeColor,
          pagesVisited: result.pagesVisited,
          totalChunks: result.totalChunks,
          companyInfo: result.companyInfo,
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
