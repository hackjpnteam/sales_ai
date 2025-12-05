// ユーザー（認証用）
export type User = {
  _id?: string;
  userId: string;
  email: string;
  passwordHash: string;
  name?: string;
  companyIds: string[];      // 所有するcompanyId配列
  stripeCustomerId?: string;
  createdAt: Date;
  updatedAt: Date;
};

// 会社情報
export type Company = {
  _id?: string;
  companyId: string;
  name: string;
  rootUrl: string;
  language: "ja" | "en";
  userId?: string;           // 所有者のuserId
  plan?: "free" | "lite" | "pro";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  planStartedAt?: Date;
  planEndedAt?: Date;
  createdAt: Date;
};

// AIエージェント設定
export type Agent = {
  _id?: string;
  agentId: string;
  companyId: string;
  name: string;
  welcomeMessage: string;
  voiceEnabled: boolean;
  themeColor: string;
  avatarUrl?: string;
  createdAt: Date;
};

// RAG用のドキュメントチャンク
export type DocChunk = {
  _id?: string;
  companyId: string;
  agentId: string;
  url: string;
  title: string;
  sectionTitle: string;  // h1/h2/h3から抽出したセクションタイトル
  chunk: string;
  embeddings: number[];
  createdAt: Date;
};

// 会話ログ
export type ChatLog = {
  _id?: string;
  companyId: string;
  agentId: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
};
