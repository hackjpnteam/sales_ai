import Stripe from "stripe";

export function getStripe(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  }
  return new Stripe(secretKey, {
    apiVersion: "2025-11-17.clover",
  });
}

// プラン設定
export const PLANS = {
  lite: {
    id: "lite",
    name: "Lite",
    priceId: process.env.STRIPE_LITE_PRICE_ID || "",
    amount: 500,
    features: [
      "埋め込みコード取得",
      "チャットカラーカスタマイズ",
      "基本的なAI応答",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceId: process.env.STRIPE_PRO_PRICE_ID || "",
    amount: 3000,
    features: [
      "埋め込みコード取得",
      "チャットカラーカスタマイズ",
      "高度なAI応答",
      "ユーザー会話履歴トラッキング",
      "アクセス位置情報トラッキング",
      "端末情報トラッキング",
      "年齢層分析",
      "詳細な分析ダッシュボード",
    ],
  },
  max: {
    id: "max",
    name: "Max",
    priceId: process.env.STRIPE_MAX_PRICE_ID || "",
    amount: 10000,
    features: [
      "Proの全機能",
      "エージェントを5つまで作成可能",
      "優先サポート",
    ],
  },
} as const;

export type PlanType = "free" | "lite" | "pro" | "max";

export function getPriceId(plan: "lite" | "pro" | "max"): string {
  return PLANS[plan].priceId;
}
