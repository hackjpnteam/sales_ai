// シンプルなレート制限ユーティリティ
import { getCollection } from "./mongodb";

interface RateLimitRecord {
  key: string;
  count: number;
  windowStart: Date;
  createdAt: Date;
}

interface RateLimitOptions {
  windowMs: number; // タイムウィンドウ（ミリ秒）
  maxRequests: number; // ウィンドウ内の最大リクエスト数
}

// デフォルト設定
const DEFAULT_OPTIONS: RateLimitOptions = {
  windowMs: 60 * 1000, // 1分
  maxRequests: 30, // 1分あたり30リクエスト
};

// エンドポイント別の設定
export const RATE_LIMIT_CONFIGS = {
  // 認証関連（ブルートフォース対策）
  auth: {
    windowMs: 15 * 60 * 1000, // 15分
    maxRequests: 10, // 15分あたり10回
  },
  // チャットAPI
  chat: {
    windowMs: 60 * 1000, // 1分
    maxRequests: 20, // 1分あたり20メッセージ
  },
  // ファイルアップロード
  upload: {
    windowMs: 60 * 1000, // 1分
    maxRequests: 10, // 1分あたり10ファイル
  },
  // Stripeチェックアウト
  checkout: {
    windowMs: 60 * 1000, // 1分
    maxRequests: 5, // 1分あたり5回
  },
};

/**
 * レート制限をチェック
 * @param identifier - ユーザー識別子（IPアドレス、userId等）
 * @param endpoint - エンドポイント識別子
 * @param options - カスタムオプション
 * @returns { allowed: boolean, remaining: number, resetAt: Date }
 */
export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  options: RateLimitOptions = DEFAULT_OPTIONS
): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}> {
  const col = await getCollection<RateLimitRecord>("rate_limits");
  const key = `${endpoint}:${identifier}`;
  const now = new Date();
  const windowStart = new Date(now.getTime() - options.windowMs);

  // 既存のレコードを取得
  const record = await col.findOne({ key });

  // レコードがないか、ウィンドウ外の場合は新規作成
  if (!record || record.windowStart < windowStart) {
    await col.updateOne(
      { key },
      {
        $set: {
          count: 1,
          windowStart: now,
          createdAt: record ? record.createdAt : now,
        },
      },
      { upsert: true }
    );

    return {
      allowed: true,
      remaining: options.maxRequests - 1,
      resetAt: new Date(now.getTime() + options.windowMs),
    };
  }

  // 制限を超えている場合
  if (record.count >= options.maxRequests) {
    const resetAt = new Date(record.windowStart.getTime() + options.windowMs);
    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  // カウントをインクリメント
  await col.updateOne({ key }, { $inc: { count: 1 } });

  return {
    allowed: true,
    remaining: options.maxRequests - record.count - 1,
    resetAt: new Date(record.windowStart.getTime() + options.windowMs),
  };
}

/**
 * クライアントIPアドレスを取得
 */
export function getClientIP(req: Request): string {
  // Vercel/Cloudflareなどのプロキシ経由のIP
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIP = req.headers.get("x-real-ip");
  if (realIP) {
    return realIP;
  }

  // フォールバック
  return "unknown";
}

/**
 * 古いレート制限レコードをクリーンアップ（定期実行用）
 */
export async function cleanupRateLimits(): Promise<number> {
  const col = await getCollection<RateLimitRecord>("rate_limits");
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const result = await col.deleteMany({
    windowStart: { $lt: oneDayAgo },
  });

  return result.deletedCount;
}
