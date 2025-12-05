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
  // ゲストユーザー作成時の情報
  creatorIp?: string;
  creatorUserAgent?: string;
  creatorLocation?: string;
};

// AIエージェント設定
export type Agent = {
  _id?: string;
  agentId: string;
  companyId: string;
  name: string;
  rootUrl?: string;
  welcomeMessage: string;
  voiceEnabled: boolean;
  themeColor: string;
  avatarUrl?: string;
  widgetPosition?: "bottom-right" | "bottom-left" | "bottom-center";
  // プロンプト設定（Pro機能）
  systemPrompt?: string;    // 役割定義
  knowledge?: string;       // 会社固有のナレッジ
  style?: string;           // 会話スタイル
  guardrails?: string;      // 制約条件（編集不可）
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

// カスタムナレッジ（Pro機能）
export type CustomKnowledge = {
  _id?: string;
  knowledgeId: string;
  companyId: string;
  agentId: string;
  title: string;
  content: string;         // 最大3000文字
  embeddings: number[];
  createdAt: Date;
  updatedAt: Date;
};
