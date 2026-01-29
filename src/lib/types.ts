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
  updatedAt?: Date;
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
  id?: string;             // ボタンの識別子（フォローアップ用）
  label: string;           // ボタンに表示するテキスト（例: "会社について"）
  query: string;           // クリック時に送信するメッセージ
  responseType?: "text" | "prompt";  // 返答タイプ（text: 固定テキスト, prompt: AIプロンプト）
  response?: string;       // カスタム返答（設定されていればAIを使わずこの返答を表示）
  responsePrompt?: string; // AIへの追加プロンプト（responseType: "prompt"の場合に使用）
  followUpButtons?: QuickButton[];  // 返答後に表示するフォローアップボタン
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

// 対応言語
export type SupportedLanguage = "ja" | "zh" | "en";

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
  widgetStyle?: "bubble" | "icon"; // バブル（円形背景）またはアイコンのみ
  iconVideoUrl?: string; // アイコンスタイル用の動画URL（5秒以内、ループ）
  iconSize?: "medium" | "large" | "xlarge"; // アイコンサイズ（デフォルト: medium = 56px）
  // ツールチップ設定
  tooltipText?: string; // ツールチップテキスト（デフォルト: "AIアシスタントが対応します"）
  tooltipDuration?: number; // ツールチップ表示時間（秒）（デフォルト: 5秒、0で非表示）
  // 言語設定
  languages?: SupportedLanguage[]; // 対応言語（デフォルト: ["ja"]）
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
  // コンバージョン設定（Pro機能）
  conversionSettings?: ConversionSettings;
  createdAt: Date;
  lastUsedAt?: Date; // 最終使用日時（チャット送信時に更新）
};

// コンバージョン設定
export type ConversionSettings = {
  enabled: boolean;
  triggers: ConversionTrigger[];
};

export type ConversionTrigger = {
  id: string;
  name: string;                    // コンバージョン名（例: "お問い合わせ完了"）
  type: "url" | "click" | "form";  // トリガータイプ
  // URL型: 特定のURLパターンにマッチしたらCV
  urlPattern?: string;             // URLパターン（部分一致、例: "/thanks", "/complete"）
  urlMatchType?: "contains" | "exact" | "regex";  // マッチ方法
  // クリック型: 特定の要素がクリックされたらCV
  clickSelector?: string;          // CSSセレクタ（例: "#submit-btn", ".contact-btn"）
  clickText?: string;              // ボタンのテキスト（例: "送信する"）- セレクタより優先
  // フォーム型: 特定のフォームが送信されたらCV
  formSelector?: string;           // フォームのCSSセレクタ
  formButtonText?: string;         // 送信ボタンのテキスト - セレクタより優先
  // 共通
  value?: number;                  // コンバージョン価値（オプション）
  enabled: boolean;
};

// 招待
export type Invitation = {
  _id?: string;
  invitationId: string;
  email?: string;            // メール招待の場合のメールアドレス
  token?: string;            // URL共有の場合のトークン
  isLinkInvitation?: boolean; // URL共有かどうか
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

// 会話ログのソース（どこからの送信か）
export type ChatLogSource = "website" | "admin_test" | "preview";

// 会話ログ
export type ChatLog = {
  _id?: string;
  companyId: string;
  agentId: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  // ページ情報（会話履歴で表示用）
  pageUrl?: string;
  deviceType?: "pc" | "mobile" | "tablet";
  // ソース情報（管理画面テストとウェブサイトを区別）
  source?: ChatLogSource;
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

// ==========================================
// [Notifications] システム通知用の型定義
// ==========================================

// システム通知（管理者からユーザーへの一斉通知）
export type SystemNotification = {
  _id?: string;
  notificationId: string;
  title: string;              // 通知タイトル
  message: string;            // 通知本文
  type: "info" | "update" | "warning" | "maintenance";  // 通知タイプ
  link?: string;              // リンク（オプション）
  createdBy: string;          // 作成者のuserId
  createdAt: Date;
  expiresAt?: Date | null;    // 有効期限（オプション）
};

// ユーザーごとの通知既読状態
export type NotificationRead = {
  _id?: string;
  userId: string;
  notificationId: string;
  readAt: Date;
};

// ユーザー個別通知（共有通知、ウェルカム通知など）
export type UserNotification = {
  _id?: string;
  notificationId: string;
  userId: string;             // 通知先ユーザーID
  type: "share" | "welcome" | "info";  // 通知タイプ
  title: string;              // 通知タイトル
  message: string;            // 通知本文
  link?: string;              // リンク先（エージェントページなど）
  fromUserId?: string;        // 送信者のuserId（共有通知の場合）
  fromUserName?: string;      // 送信者の名前
  agentId?: string;           // 関連エージェントID
  agentName?: string;         // 関連エージェント名
  isRead: boolean;            // 既読フラグ
  readAt?: Date;              // 既読日時
  createdAt: Date;
};

// ==========================================
// [Security] セキュリティ診断用の型定義
// ==========================================

// 重要度
export type SecuritySeverity = "critical" | "high" | "medium" | "low" | "info";

// 個別のセキュリティ問題
export type SecurityIssue = {
  id: string;
  type: string;                    // 問題の種類（https_missing, mixed_content等）
  severity: SecuritySeverity;
  title: string;                   // 問題のタイトル
  description: string;             // 詳細説明
  recommendation: string;          // 推奨対策
  details?: string;                // 追加情報（URL、バージョン等）
  detectedAt: Date;
};

// スキャン結果
export type SecurityScanResult = {
  _id?: string;
  scanId: string;
  companyId: string;
  agentId: string;
  sessionId: string;               // ウィジェットのセッションID
  pageUrl: string;                 // スキャンしたページURL
  issues: SecurityIssue[];         // 検出した問題
  // 収集したメタ情報
  meta: {
    protocol: string;              // http or https
    hasHttpForms: boolean;
    hasMixedContent: boolean;
    externalScripts: string[];
    jqueryVersion?: string;
    cookieFlags: {
      total: number;
      httpOnly: number;
      secure: number;
    };
  };
  userAgent: string;
  createdAt: Date;
};

// エージェント毎のセキュリティレポート
export type SecurityReport = {
  _id?: string;
  reportId: string;
  companyId: string;
  agentId: string;
  // スコア
  score: number;                   // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  // 問題サマリー
  issuesSummary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };
  // 最新のスキャンからの問題一覧
  latestIssues: SecurityIssue[];
  // 履歴
  scanCount: number;               // 総スキャン回数
  lastScanAt: Date;
  // 直近30日のスコア履歴
  scoreHistory: {
    date: string;                  // YYYY-MM-DD
    score: number;
    grade: "A" | "B" | "C" | "D" | "F";
  }[];
  createdAt: Date;
  updatedAt: Date;
};

// ==========================================
// [Leads] リード（見込み客）用の型定義
// ==========================================

// リード（チャットで連絡先を取得した見込み客）
export type Lead = {
  _id?: string;
  leadId: string;
  companyId: string;
  agentId: string;
  sessionId: string;         // チャットセッションID
  name?: string;             // 名前
  email?: string;            // メールアドレス
  phone?: string;            // 電話番号
  inquiry?: string;          // 問い合わせ内容
  pageUrl?: string;          // リード獲得時のページURL
  deviceType?: DeviceType;   // デバイス
  status: "new" | "contacted" | "converted" | "closed";  // ステータス
  notes?: string;            // メモ
  createdAt: Date;
  updatedAt?: Date;
};
