// [Analytics] 解析機能用のユーティリティ

import { getCollection } from "./mongodb";
import { Company } from "./types";

/**
 * Proプラン以上（pro, max）かどうかを判定
 */
export function isProPlan(plan?: string): boolean {
  return plan === "pro" || plan === "max";
}

/**
 * companyIdからProプランかどうかを判定
 */
export async function isProCompany(companyId: string): Promise<boolean> {
  const companiesCol = await getCollection<Company>("companies");
  const company = await companiesCol.findOne({ companyId });
  return isProPlan(company?.plan);
}

/**
 * デバイスタイプを判定
 */
export function detectDeviceType(userAgent: string): "pc" | "mobile" | "tablet" {
  const ua = userAgent.toLowerCase();

  // タブレット判定
  if (/ipad|tablet|playbook|silk|(android(?!.*mobi))/i.test(ua)) {
    return "tablet";
  }

  // モバイル判定
  if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini|iemobile/i.test(ua)) {
    return "mobile";
  }

  return "pc";
}

/**
 * URLからパス部分を抽出（クエリパラメータ除去）
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return url;
  }
}

/**
 * 日付をYYYY-MM-DD形式に変換
 */
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * 期間の開始日と終了日を取得
 */
export function getDateRange(period: string): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  let from: Date;

  switch (period) {
    case "today":
      from = new Date(now);
      from.setHours(0, 0, 0, 0);
      break;
    case "yesterday":
      from = new Date(now);
      from.setDate(from.getDate() - 1);
      from.setHours(0, 0, 0, 0);
      to.setDate(to.getDate() - 1);
      break;
    case "7days":
      from = new Date(now);
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      break;
    case "30days":
      from = new Date(now);
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
      break;
    case "90days":
      from = new Date(now);
      from.setDate(from.getDate() - 89);
      from.setHours(0, 0, 0, 0);
      break;
    case "all":
      // 全期間（2020年1月1日から）
      from = new Date("2020-01-01T00:00:00.000Z");
      break;
    default:
      // デフォルトは7日
      from = new Date(now);
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
  }

  return { from, to };
}

/**
 * 質問カテゴリのリスト
 */
export const QUESTION_CATEGORIES = [
  "料金",
  "機能",
  "導入方法",
  "サポート",
  "解約",
  "セキュリティ",
  "採用",
  "会社情報",
  "サービス",
  "その他",
] as const;

/**
 * 感情分析のラベル
 */
export const SENTIMENT_LABELS = [
  "興味高い",
  "検討中",
  "不安",
  "不満",
  "クレーム",
  "中立",
] as const;
