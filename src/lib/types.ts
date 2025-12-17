// ユーザー（認証用）
export type User = {
  _id?: string;
  userId: string;
  email: string;
  passwordHash: string;
  name?: string;
  companyIds: string[];      // 所有するcompanyId配列
  stripeCustomerId?: string;
  maxPlanCount?: number;     // Maxプラン購入数（1つにつき5エージェント）
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
  plan?: "free" | "lite" | "pro" | "max";
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

// 共有ユーザー情報
export type SharedUser = {
  email: string;
  userId?: string;         // 登録済みユーザーの場合
  role: "editor" | "viewer";
  addedAt: Date;
};

// クイックボタン
export type QuickButton = {
  label: string;           // ボタンに表示するテキスト（例: "会社について"）
  query: string;           // クリック時に送信するメッセージ
};

// クロールしたページ情報
export type CrawledPage = {
  url: string;                   // ページURL
  title: string;                 // ページタイトル
  summary: string;               // 内容の概要（50-100文字）
  category: string;              // カテゴリ（会社情報/サービス/採用等）
};

// クロール時に抽出した基本情報（詳細版）
export type CompanyInfo = {
  // 基本情報
  companyName?: string;          // 会社名（正式名称）
  tradeName?: string;            // 屋号・ブランド名
  representativeName?: string;   // 代表者名
  representativeTitle?: string;  // 代表者肩書（代表取締役社長等）
  establishedYear?: string;      // 設立年月日
  address?: string;              // 本社所在地
  phone?: string;                // 電話番号
  fax?: string;                  // FAX番号
  email?: string;                // メールアドレス

  // 会社規模・財務
  employeeCount?: string;        // 従業員数
  capital?: string;              // 資本金
  revenue?: string;              // 売上高

  // 事業内容
  businessDescription?: string;  // 事業内容（概要）
  services?: string[];           // 主要サービス・商品リスト
  industries?: string[];         // 事業分野・業界

  // 企業理念・特徴
  mission?: string;              // ミッション・企業理念
  vision?: string;               // ビジョン
  strengths?: string[];          // 会社の強み・特徴

  // 沿革・実績
  history?: string[];            // 会社の沿革（主要な出来事）
  achievements?: string[];       // 実績・受賞歴
  clients?: string[];            // 主要取引先・導入企業

  // 採用情報
  recruitmentInfo?: string;      // 採用情報概要
  recruitmentUrl?: string;       // 採用ページURL

  // ウェブサイト情報
  websiteDescription?: string;   // サイト概要
  socialLinks?: {                // SNSリンク
    twitter?: string;
    facebook?: string;
    instagram?: string;
    linkedin?: string;
    youtube?: string;
  };

  // ニュース・お知らせ
  recentNews?: string[];         // 最新ニュース（3-5件）

  // クロール情報
  crawledPages?: CrawledPage[];  // クロールしたページ一覧
  totalPagesVisited?: number;    // 訪問ページ数
  totalChunks?: number;          // 取得チャンク数
  crawledAt?: string;            // クロール日時
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
  // クイックボタン（Pro機能）
  quickButtons?: QuickButton[];
  // プロンプト設定（Pro機能）
  systemPrompt?: string;    // 役割定義
  knowledge?: string;       // 会社固有のナレッジ
  style?: string;           // 会話スタイル
  guardrails?: string;      // 制約条件（編集不可）
  ngResponses?: string;     // NG回答（絶対に回答してはいけない内容）
  // 共有設定
  sharedWith?: SharedUser[];
  // クロール時に抽出した基本情報
  companyInfo?: CompanyInfo;
  createdAt: Date;
};

// 招待
export type Invitation = {
  _id?: string;
  invitationId: string;
  email: string;
  agentId: string;
  companyId: string;
  invitedBy: string;        // userId of inviter
  role: "editor" | "viewer";
  status: "pending" | "accepted" | "expired";
  expiresAt: Date;
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

// ==========================================
// [Analytics] 解析機能用の型定義
// ==========================================

// イベントタイプ
export type AnalyticsEventType =
  | 'page_view'
  | 'session_start'
  | 'session_end'
  | 'chat_open'
  | 'chat_message_user'
  | 'chat_message_ai'
  | 'chat_end'
  | 'conversion';

// デバイスタイプ
export type DeviceType = 'pc' | 'mobile' | 'tablet';

// 解析イベント
export type AnalyticsEvent = {
  _id?: string;
  companyId: string;
  agentId?: string | null;
  visitorId: string;          // localStorage で永続化
  sessionId: string;          // sessionStorage でタブごと
  type: AnalyticsEventType;
  url: string;
  referrer?: string;
  userAgent?: string;
  deviceType?: DeviceType;

  // チャット関連
  conversationId?: string;
  messageRole?: 'user' | 'assistant';
  messageText?: string;

  // AI解析結果（後からバッチで埋める）
  aiCategory?: string;        // 質問カテゴリ（料金/解約/導入など）
  aiSentiment?: string;       // 感情（興味高い/不安など）
  aiIntentScore?: number;     // 購入意欲スコア（0-100）

  // CV関連
  conversionType?: string;    // 'signup' | 'purchase' | 'demo_request' など
  conversionValue?: number;   // 金額

  createdAt: Date;
};

// 日別集計データ（パフォーマンス向上用）
export type AnalyticsDailyStat = {
  _id?: string;
  companyId: string;
  date: string;               // YYYY-MM-DD

  // PV / セッション
  pageViews: number;
  uniqueVisitors: number;
  sessions: number;

  // チャット
  chatOpens: number;
  chatMessages: number;
  chatSessions: number;       // チャットを利用したセッション数

  // CV
  conversions: number;
  conversionValue: number;
  chatConversions: number;    // チャット経由のCV

  // ページ別
  pageStats: {
    url: string;
    views: number;
    chatOpens: number;
    conversions: number;
  }[];

  // 質問カテゴリ別
  categoryStats: {
    category: string;
    count: number;
    conversions: number;
  }[];

  // デバイス別
  deviceStats: {
    pc: number;
    mobile: number;
    tablet: number;
  };

  createdAt: Date;
  updatedAt: Date;
};
