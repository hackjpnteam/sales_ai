"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSession, signOut } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Plus,
  Globe,
  Zap,
  Copy,
  ExternalLink,
  Palette,
  LogOut,
  Loader2,
  MessageCircle,
  Check,
  Lock,
  BarChart3,
  ChevronDown,
  ChevronUp,
  X,
  CreditCard,
  Sparkles,
  Users,
  Smartphone,
  MapPin,
  Volume2,
  VolumeX,
  MessageSquare,
  Image,
  Trash2,
  Save,
  Upload,
  Shield,
  HelpCircle,
  Database,
  Edit3,
  PlusCircle,
  Share2,
  UserPlus,
  Mail,
  Send,
  AlertTriangle,
  Building2,
  Info,
  RefreshCw,
  Video,
  Play,
} from "lucide-react";
import Link from "next/link";
import type { CompanyInfo } from "@/lib/types";

const SUPER_ADMIN_EMAILS = ["tomura@hackjpn.com"];

type SharedUser = {
  email: string;
  userId?: string;
  role: "editor" | "viewer";
  addedAt: Date;
};

type QuickButton = {
  label: string;
  query: string;
};

type Agent = {
  agentId: string;
  companyId: string;
  name: string;
  welcomeMessage: string;
  voiceEnabled: boolean;
  themeColor: string;
  avatarUrl?: string;
  widgetPosition?: "bottom-right" | "bottom-left" | "bottom-center" | "middle-right" | "middle-left";
  widgetStyle?: "bubble" | "icon";
  iconVideoUrl?: string; // アイコン動画URL
  // クイックボタン（Pro機能）
  quickButtons?: QuickButton[];
  // プロンプト設定（Pro機能）
  systemPrompt?: string;
  knowledge?: string;
  style?: string;
  // 共有
  sharedWith?: SharedUser[];
  isShared?: boolean;
  // 基本情報
  companyInfo?: CompanyInfo;
  createdAt: Date;
};

type PromptSettings = {
  systemPrompt: string;
  knowledge: string;
  style: string;
  ngResponses: string;
  guardrails: string;
};

type UploadedAvatar = {
  avatarId: string;
  name: string;
  dataUrl: string;
};

type Company = {
  companyId: string;
  name: string;
  rootUrl: string;
  language: string;
  plan?: "free" | "lite" | "pro" | "max";
  isShared?: boolean;
  createdAt: Date;
  agents: Agent[];
};

type ProgressEvent = {
  type: "discovering" | "crawling" | "embedding" | "saving" | "complete" | "error";
  currentUrl?: string;
  currentPage?: number;
  totalPages?: number;
  percent?: number;
  chunksFound?: number;
  message?: string;
  companyId?: string;
  agentId?: string;
  themeColor?: string;
};

type CustomKnowledge = {
  knowledgeId: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

// カラーオプション
const colorOptions = [
  { name: "ローズ", value: "#D86672" },
  { name: "ブルー", value: "#4F8CFF" },
  { name: "グリーン", value: "#10B981" },
  { name: "パープル", value: "#8B5CF6" },
  { name: "オレンジ", value: "#F59E0B" },
  { name: "ピンク", value: "#EC4899" },
  { name: "ホワイト", value: "#FFFFFF" },
  { name: "ブラック", value: "#1A1A1A" },
  { name: "ゴールド", value: "#D4AF37" },
  { name: "シルバー", value: "#A8A9AD" },
];

// 位置オプション
const positionOptions = [
  { name: "右下", value: "bottom-right", icon: "↘" },
  { name: "左下", value: "bottom-left", icon: "↙" },
  { name: "中央下", value: "bottom-center", icon: "↓" },
  { name: "右中央", value: "middle-right", icon: "→" },
  { name: "左中央", value: "middle-left", icon: "←" },
] as const;

// ウィジェットスタイルオプション
const widgetStyleOptions = [
  { name: "バブル", value: "bubble", icon: "●", description: "円形背景付き" },
  { name: "アイコン", value: "icon", icon: "💬", description: "アイコンのみ" },
] as const;

// プランごとのエージェント作成上限
const AGENT_LIMITS: Record<string, number> = {
  free: 1,
  lite: 1,
  pro: 1,
  max: 5,
};

// プラン情報
const plans = {
  lite: {
    id: "lite",
    name: "Lite",
    price: "¥500",
    period: "/月",
    features: [
      "埋め込みコード取得",
      "チャットカラーカスタマイズ",
      "基本的なAI応答",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: "¥3,000",
    period: "/月",
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
    price: "¥10,000",
    period: "/月",
    features: [
      "Proプランの全機能",
      "5エージェントまで作成可能",
      "複数購入で無制限に拡張可能",
      "優先サポート",
    ],
  },
};

function DashboardContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [sharedCompanies, setSharedCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [paymentVerified, setPaymentVerified] = useState(false);

  // 共有機能
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareAgentId, setShareAgentId] = useState<string>("");
  const [shareEmail, setShareEmail] = useState("");
  const [sharingAgent, setSharingAgent] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareSuccess, setShareSuccess] = useState("");
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<{ invitationId: string; email: string; role: string; status: string }[]>([]);
  const [loadingSharedUsers, setLoadingSharedUsers] = useState(false);

  // 新規作成フォーム
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [rootUrl, setRootUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [progress, setProgress] = useState<ProgressEvent | null>(null);

  // 作成完了後のウィジェット表示
  const [showWidget, setShowWidget] = useState(false);
  const [chatWindowOpen, setChatWindowOpen] = useState(false); // バブルクリック後にチャット表示
  const [createdAgent, setCreatedAgent] = useState<{
    companyId: string;
    agentId: string;
    agentName: string;
    themeColor: string;
    widgetPosition: string;
    widgetStyle?: string;
    avatarUrl?: string;
    iconVideoUrl?: string;
  } | null>(null);

  // ウィジェットプレビュー（実際の埋め込み形式）
  const [showWidgetPreview, setShowWidgetPreview] = useState(false);
  const [previewAgent, setPreviewAgent] = useState<{
    companyId: string;
    agentId: string;
    agentName: string;
    themeColor: string;
    widgetPosition: string;
  } | null>(null);

  // プラン選択モーダル
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedCompanyForPlan, setSelectedCompanyForPlan] = useState<Company | null>(null);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);

  // カラー変更
  const [updatingColor, setUpdatingColor] = useState<string | null>(null);

  // エージェント設定編集
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editAgentName, setEditAgentName] = useState("");
  const [editWelcomeMessage, setEditWelcomeMessage] = useState("");
  const [editVoiceEnabled, setEditVoiceEnabled] = useState(true);
  const [editAvatarUrl, setEditAvatarUrl] = useState("/agent-avatar.png");
  const [savingSettings, setSavingSettings] = useState(false);

  // 基本情報編集
  const [editingCompanyInfo, setEditingCompanyInfo] = useState<string | null>(null);
  const [editCompanyInfo, setEditCompanyInfo] = useState<CompanyInfo>({});
  const [savingCompanyInfo, setSavingCompanyInfo] = useState(false);

  // 再クロール
  const [recrawlingAgent, setRecrawlingAgent] = useState<string | null>(null);
  const [recrawlProgress, setRecrawlProgress] = useState<{ percent: number; currentUrl?: string } | null>(null);

  // アバター管理
  const [uploadedAvatars, setUploadedAvatars] = useState<UploadedAvatar[]>([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [loadingAvatars, setLoadingAvatars] = useState(false);

  // アイコン動画管理
  const [uploadingVideo, setUploadingVideo] = useState<string | null>(null);

  // エージェント削除
  const [deletingAgent, setDeletingAgent] = useState<string | null>(null);

  // 埋め込みコードヘルプモーダル
  const [showEmbedHelp, setShowEmbedHelp] = useState(false);

  // カスタムナレッジ（Pro機能）
  const [customKnowledges, setCustomKnowledges] = useState<Record<string, CustomKnowledge[]>>({});
  const [showKnowledgeModal, setShowKnowledgeModal] = useState(false);
  const [editingKnowledge, setEditingKnowledge] = useState<CustomKnowledge | null>(null);
  const [knowledgeCompanyId, setKnowledgeCompanyId] = useState<string>("");
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  // プロンプト設定（Pro機能）
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [promptAgentId, setPromptAgentId] = useState<string>("");
  const [promptCompanyPlan, setPromptCompanyPlan] = useState<string>("");
  const [promptSettings, setPromptSettings] = useState<PromptSettings>({
    systemPrompt: "",
    knowledge: "",
    style: "",
    ngResponses: "",
    guardrails: "",
  });
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [loadingPrompt, setLoadingPrompt] = useState(false);

  // クイックボタン編集（Pro機能）
  const [editingQuickButtons, setEditingQuickButtons] = useState<string | null>(null);
  const [quickButtonsForm, setQuickButtonsForm] = useState<QuickButton[]>([
    { label: "", query: "" },
    { label: "", query: "" },
    { label: "", query: "" },
    { label: "", query: "" },
    { label: "", query: "" },
  ]);
  const [savingQuickButtons, setSavingQuickButtons] = useState(false);

  // Maxプラン購入数
  const [maxPlanCount, setMaxPlanCount] = useState(0);

  // プラン変更処理中
  const [changingPlanCompany, setChangingPlanCompany] = useState<string | null>(null);

  const [hasFetched, setHasFetched] = useState(false);

  const fetchCompanies = useCallback(async (force = false) => {
    // 既にフェッチ済みで強制でなければスキップ（StrictMode対策）
    if (hasFetched && !force) return;

    try {
      const res = await fetch("/api/user/companies");
      if (res.ok) {
        const data = await res.json();
        // デバッグ: 会社データをログ出力
        console.log("[Dashboard] Fetched companies:", data.companies?.map((c: Company) => ({
          companyId: c.companyId,
          name: c.name,
          plan: c.plan,
          agentCount: c.agents?.length,
        })));
        setCompanies(data.companies || []);
        setSharedCompanies(data.sharedCompanies || []);
        setMaxPlanCount(data.maxPlanCount || 0);
        // 初期状態では全て閉じた状態にする
        setHasFetched(true);
      }
    } catch (error) {
      console.error("Failed to fetch companies:", error);
    } finally {
      setLoading(false);
    }
  }, [hasFetched]);

  // 決済成功後にプランを確認・更新
  const verifyPayment = useCallback(async (companyId: string, plan: string) => {
    try {
      console.log("[Dashboard] Verifying payment for", companyId, plan);
      const res = await fetch("/api/stripe/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, plan }),
      });

      if (res.ok) {
        console.log("[Dashboard] Payment verified successfully");
        // 会社一覧を再取得
        await fetchCompanies(true);
        // URLからクエリパラメータを削除
        router.replace("/dashboard");
      } else {
        console.error("[Dashboard] Payment verification failed");
      }
    } catch (error) {
      console.error("[Dashboard] Payment verification error:", error);
    }
  }, [router, fetchCompanies]);

  // 決済成功パラメータをチェック
  useEffect(() => {
    const success = searchParams.get("success");
    const companyId = searchParams.get("companyId");
    const plan = searchParams.get("plan");

    if (success === "true" && companyId && plan && !paymentVerified) {
      setPaymentVerified(true);
      verifyPayment(companyId, plan);
    }
  }, [searchParams, paymentVerified, verifyPayment]);

  // 初期データ読み込み
  useEffect(() => {
    if (status === "authenticated") {
      fetchCompanies();
    }
  }, [status, fetchCompanies]);

  // カード展開時にカスタムナレッジを自動読み込み
  useEffect(() => {
    if (expandedCompany) {
      // 該当する会社を検索
      const company = [...companies, ...sharedCompanies].find(c => c.companyId === expandedCompany);
      // Proプラン以上で、まだナレッジを読み込んでいない場合に自動読み込み
      if ((company?.plan === "pro" || company?.plan === "max") && !customKnowledges[expandedCompany]) {
        fetch(`/api/knowledge?companyId=${expandedCompany}`)
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data) {
              setCustomKnowledges(prev => ({ ...prev, [expandedCompany]: data.knowledges || [] }));
            }
          })
          .catch(err => console.error("Failed to auto-fetch knowledge:", err));
      }
    }
  }, [expandedCompany, companies, sharedCompanies, customKnowledges]);

  // カスタムナレッジ取得
  const fetchCustomKnowledge = async (companyId: string) => {
    try {
      const res = await fetch(`/api/knowledge?companyId=${companyId}`);
      if (res.ok) {
        const data = await res.json();
        setCustomKnowledges(prev => ({ ...prev, [companyId]: data.knowledges || [] }));
      }
    } catch (error) {
      console.error("Failed to fetch knowledge:", error);
    }
  };

  // カスタムナレッジ保存
  const handleSaveKnowledge = async () => {
    if (!knowledgeCompanyId || !knowledgeTitle.trim() || !knowledgeContent.trim()) return;
    if (knowledgeContent.length > 3000) {
      alert("コンテンツは3000文字以内にしてください");
      return;
    }

    setSavingKnowledge(true);
    try {
      const method = editingKnowledge ? "PUT" : "POST";
      const body = editingKnowledge
        ? { companyId: knowledgeCompanyId, knowledgeId: editingKnowledge.knowledgeId, title: knowledgeTitle, content: knowledgeContent }
        : { companyId: knowledgeCompanyId, title: knowledgeTitle, content: knowledgeContent };

      const res = await fetch("/api/knowledge", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setShowKnowledgeModal(false);
        setEditingKnowledge(null);
        setKnowledgeTitle("");
        setKnowledgeContent("");
        await fetchCustomKnowledge(knowledgeCompanyId);
      } else {
        const data = await res.json();
        alert(data.error || "保存に失敗しました");
      }
    } catch (error) {
      console.error("Failed to save knowledge:", error);
      alert("保存に失敗しました");
    } finally {
      setSavingKnowledge(false);
    }
  };

  // カスタムナレッジ削除
  const handleDeleteKnowledge = async (companyId: string, knowledgeId: string) => {
    if (!confirm("このナレッジを削除しますか？")) return;

    try {
      const res = await fetch(`/api/knowledge?companyId=${companyId}&knowledgeId=${knowledgeId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await fetchCustomKnowledge(companyId);
      } else {
        alert("削除に失敗しました");
      }
    } catch (error) {
      console.error("Failed to delete knowledge:", error);
      alert("削除に失敗しました");
    }
  };

  // ファイルアップロード処理
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !knowledgeCompanyId) return;

    // ファイルサイズチェック（20MB以下）
    if (file.size > 20 * 1024 * 1024) {
      alert("ファイルサイズは20MB以下にしてください");
      return;
    }

    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("companyId", knowledgeCompanyId);

      const res = await fetch("/api/knowledge/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        alert(`${data.message}\n（${data.totalCharacters}文字を読み込みました）`);
        await fetchCustomKnowledge(knowledgeCompanyId);
        setShowKnowledgeModal(false);
        setKnowledgeTitle("");
        setKnowledgeContent("");
      } else {
        alert(data.error || "アップロードに失敗しました");
      }
    } catch (error) {
      console.error("Failed to upload file:", error);
      alert("アップロードに失敗しました");
    } finally {
      setUploadingFile(false);
      // inputをリセット
      e.target.value = "";
    }
  };

  // プロンプト設定取得
  const fetchPromptSettings = async (agentId: string) => {
    setLoadingPrompt(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/prompt`);
      if (res.ok) {
        const data = await res.json();
        setPromptSettings({
          systemPrompt: data.systemPrompt || "",
          knowledge: data.knowledge || "",
          style: data.style || "",
          ngResponses: data.ngResponses || "",
          guardrails: data.guardrails || "",
        });
      }
    } catch (error) {
      console.error("Failed to fetch prompt settings:", error);
    } finally {
      setLoadingPrompt(false);
    }
  };

  // プロンプト設定保存
  const handleSavePromptSettings = async () => {
    if (!promptAgentId) return;

    setSavingPrompt(true);
    try {
      const res = await fetch(`/api/agents/${promptAgentId}/prompt`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: promptSettings.systemPrompt,
          knowledge: promptSettings.knowledge,
          style: promptSettings.style,
          ngResponses: promptSettings.ngResponses,
        }),
      });

      if (res.ok) {
        await fetchCompanies(true); // エージェントデータを再取得
        setShowPromptModal(false);
        alert("プロンプト設定を保存しました");
      } else {
        const data = await res.json();
        if (data.code === "PRO_REQUIRED") {
          alert("この機能はPro/Maxプラン限定です。アップグレードしてください。");
        } else {
          alert(data.error || "保存に失敗しました");
        }
      }
    } catch (error) {
      console.error("Failed to save prompt settings:", error);
      alert("保存に失敗しました");
    } finally {
      setSavingPrompt(false);
    }
  };

  // プロンプト設定モーダルを開く
  const openPromptModal = (agentId: string, companyPlan: string) => {
    setPromptAgentId(agentId);
    setPromptCompanyPlan(companyPlan);
    setShowPromptModal(true);
    fetchPromptSettings(agentId);
  };

  // クイックボタン編集開始
  const startEditingQuickButtons = (agent: Agent) => {
    const defaultButtons: QuickButton[] = [
      { label: "会社について", query: "会社について教えてください" },
      { label: "採用について", query: "採用情報について教えてください" },
      { label: "サービスについて", query: "提供しているサービスについて教えてください" },
    ];
    const buttons = agent.quickButtons && agent.quickButtons.length > 0
      ? [...agent.quickButtons]
      : defaultButtons;
    // 5つに揃える
    while (buttons.length < 5) {
      buttons.push({ label: "", query: "" });
    }
    setQuickButtonsForm(buttons.slice(0, 5));
    setEditingQuickButtons(agent.agentId);
  };

  // クイックボタン保存
  const handleSaveQuickButtons = async (agentId: string) => {
    setSavingQuickButtons(true);
    try {
      // 空でないボタンのみ保存
      const validButtons = quickButtonsForm.filter(b => b.label.trim() && b.query.trim());

      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quickButtons: validButtons }),
      });

      if (res.ok) {
        await fetchCompanies(true);
        setEditingQuickButtons(null);
      } else {
        const data = await res.json();
        alert(data.error || "保存に失敗しました");
      }
    } catch (error) {
      console.error("Failed to save quick buttons:", error);
      alert("保存に失敗しました");
    } finally {
      setSavingQuickButtons(false);
    }
  };

  // 共有ユーザー取得
  const fetchSharedUsers = async (agentId: string) => {
    setLoadingSharedUsers(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/share`);
      if (res.ok) {
        const data = await res.json();
        setSharedUsers(data.sharedWith || []);
        setPendingInvitations(data.pendingInvitations || []);
      }
    } catch (error) {
      console.error("Failed to fetch shared users:", error);
    } finally {
      setLoadingSharedUsers(false);
    }
  };

  // 共有モーダルを開く
  const openShareModal = (agentId: string) => {
    setShareAgentId(agentId);
    setShareEmail("");
    setShareError("");
    setShareSuccess("");
    setShowShareModal(true);
    fetchSharedUsers(agentId);
  };

  // エージェント共有
  const handleShareAgent = async () => {
    if (!shareEmail || !shareAgentId) return;

    setSharingAgent(true);
    setShareError("");
    setShareSuccess("");

    try {
      const res = await fetch(`/api/agents/${shareAgentId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: shareEmail, role: "editor" }),
      });

      const data = await res.json();

      if (res.ok) {
        if (data.shared) {
          setShareSuccess(`${shareEmail} に共有しました`);
        } else if (data.needsInvitation) {
          setShareSuccess(`${shareEmail} に招待を送信しました。ユーザー登録後に共有されます。`);
        }
        setShareEmail("");
        fetchSharedUsers(shareAgentId);
        fetchCompanies();
      } else {
        setShareError(data.error || "共有に失敗しました");
      }
    } catch (error) {
      console.error("Failed to share agent:", error);
      setShareError("共有に失敗しました");
    } finally {
      setSharingAgent(false);
    }
  };

  // 共有解除
  const handleRemoveShare = async (email: string) => {
    if (!shareAgentId) return;

    try {
      const res = await fetch(`/api/agents/${shareAgentId}/share`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        fetchSharedUsers(shareAgentId);
        fetchCompanies();
      }
    } catch (error) {
      console.error("Failed to remove share:", error);
    }
  };

  // ウェルカムメッセージ保存
  const handleSaveWelcomeMessage = async (agentId: string) => {
    setSavingSettings(true);
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          welcomeMessage: editWelcomeMessage,
          voiceEnabled: editVoiceEnabled,
          avatarUrl: editAvatarUrl,
        }),
      });

      if (res.ok) {
        await fetchCompanies(true);
        setEditingAgent(null);
      } else {
        alert("保存に失敗しました");
      }
    } catch (error) {
      console.error("Failed to save agent settings:", error);
      alert("保存に失敗しました");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    setProgress(null);

    let normalizedUrl = rootUrl.trim();
    if (!normalizedUrl.match(/^https?:\/\//i)) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    const companyName = new URL(normalizedUrl).hostname.replace(/^www\./, "").split(".")[0];

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          rootUrl: normalizedUrl,
        }),
      });

      if (!res.ok && !res.body) {
        const data = await res.json();
        throw new Error(data.error || "エラーが発生しました");
      }

      // SSEストリームを読み取り
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("ストリームを読み取れませんでした");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              setProgress(data);

              if (data.type === "complete") {
                // 成功 - ウィジェット表示
                setShowCreateForm(false);
                setRootUrl("");
                setProgress(null);
                setCreatedAgent({
                  companyId: data.companyId,
                  agentId: data.agentId,
                  agentName: `${companyName} AI`,
                  themeColor: data.themeColor || "#D86672",
                  widgetPosition: "bottom-right",
                });
                setShowWidget(true);
                fetchCompanies();
              } else if (data.type === "error") {
                setCreateError(data.message || "エラーが発生しました");
                setProgress(null);
              }
            } catch {
              // JSON parse error
            }
          }
        }
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "エラーが発生しました");
      setProgress(null);
    } finally {
      setCreating(false);
    }
  };

  // Stripeチェックアウトを開始
  const handleSelectPlan = async (plan: "lite" | "pro" | "max") => {
    if (!selectedCompanyForPlan) return;

    setProcessingPlan(plan);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyForPlan.companyId,
          plan,
          email: session?.user?.email,
        }),
      });

      const data = await res.json();

      if (data.url) {
        // Stripeチェックアウトページにリダイレクト
        window.location.href = data.url;
      } else {
        console.error("Checkout error:", data.error);
        alert("決済ページの作成に失敗しました。もう一度お試しください。");
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("エラーが発生しました。もう一度お試しください。");
    } finally {
      setProcessingPlan(null);
    }
  };

  // companyのプランを変更（FreeからMax、またはMaxからFree）
  const handleChangePlan = async (companyId: string, newPlan: "free" | "max") => {
    setChangingPlanCompany(companyId);

    try {
      const res = await fetch(`/api/company/${companyId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: newPlan }),
      });

      const data = await res.json();

      if (res.ok) {
        // ローカルの状態を更新
        setCompanies((prev) =>
          prev.map((company) =>
            company.companyId === companyId
              ? { ...company, plan: newPlan }
              : company
          )
        );
        alert(`プランを${newPlan === "max" ? "Max" : "Free"}に変更しました`);
      } else {
        if (data.code === "NO_MAX_PLAN") {
          alert("Maxプランを購入していません");
        } else if (data.code === "MAX_SLOTS_FULL") {
          alert(`Max枠が満杯です（${data.currentMaxCompanies}/${data.maxPlanCount}）`);
        } else {
          alert("プラン変更に失敗しました");
        }
      }
    } catch (error) {
      console.error("Change plan error:", error);
      alert("エラーが発生しました");
    } finally {
      setChangingPlanCompany(null);
    }
  };

  // カラー変更ハンドラー
  const handleColorChange = async (agentId: string, companyId: string, newColor: string) => {
    setUpdatingColor(agentId);

    try {
      const res = await fetch("/api/agents/color", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          themeColor: newColor,
        }),
      });

      if (res.ok) {
        // ローカルの状態を更新
        setCompanies((prev) =>
          prev.map((company) =>
            company.companyId === companyId
              ? {
                  ...company,
                  agents: company.agents.map((agent) =>
                    agent.agentId === agentId
                      ? { ...agent, themeColor: newColor }
                      : agent
                  ),
                }
              : company
          )
        );

        // ウィジェットプレビューも更新
        if (createdAgent?.agentId === agentId) {
          setCreatedAgent({ ...createdAgent, themeColor: newColor });
        }
      } else {
        const data = await res.json();
        alert(data.error || "カラーの更新に失敗しました");
      }
    } catch (error) {
      console.error("Color update error:", error);
      alert("エラーが発生しました");
    } finally {
      setUpdatingColor(null);
    }
  };

  // 位置変更ハンドラー
  const handlePositionChange = async (agentId: string, companyId: string, newPosition: "bottom-right" | "bottom-left" | "bottom-center" | "middle-right" | "middle-left") => {
    setUpdatingColor(agentId); // 同じローディング状態を共有

    try {
      const res = await fetch("/api/agents/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          widgetPosition: newPosition,
        }),
      });

      if (res.ok) {
        // ローカルの状態を更新
        setCompanies((prev) =>
          prev.map((company) =>
            company.companyId === companyId
              ? {
                  ...company,
                  agents: company.agents.map((agent) =>
                    agent.agentId === agentId
                      ? { ...agent, widgetPosition: newPosition }
                      : agent
                  ),
                }
              : company
          )
        );

        // チャットプレビューの位置も更新
        if (createdAgent?.agentId === agentId) {
          setCreatedAgent({ ...createdAgent, widgetPosition: newPosition });
        }
      } else {
        const data = await res.json();
        alert(data.error || "位置の更新に失敗しました");
      }
    } catch (error) {
      console.error("Position update error:", error);
      alert("エラーが発生しました");
    } finally {
      setUpdatingColor(null);
    }
  };

  // ウィジェットスタイル変更ハンドラー
  const handleStyleChange = async (agentId: string, companyId: string, newStyle: "bubble" | "icon") => {
    setUpdatingColor(agentId); // 同じローディング状態を共有

    try {
      const res = await fetch("/api/agents/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          widgetStyle: newStyle,
        }),
      });

      if (res.ok) {
        // ローカルの状態を更新
        setCompanies((prev) =>
          prev.map((company) =>
            company.companyId === companyId
              ? {
                  ...company,
                  agents: company.agents.map((agent) =>
                    agent.agentId === agentId
                      ? { ...agent, widgetStyle: newStyle }
                      : agent
                  ),
                }
              : company
          )
        );

        // チャットプレビューのスタイルも更新
        if (createdAgent?.agentId === agentId) {
          setCreatedAgent({ ...createdAgent, widgetStyle: newStyle });
        }
      } else {
        const data = await res.json();
        alert(data.error || "スタイルの更新に失敗しました");
      }
    } catch (error) {
      console.error("Style update error:", error);
      alert("エラーが発生しました");
    } finally {
      setUpdatingColor(null);
    }
  };

  // アイコン動画アップロード
  const handleVideoUpload = async (agentId: string, companyId: string, file: File) => {
    // クライアント側で動画の長さをチェック
    const video = document.createElement('video');
    video.preload = 'metadata';

    const durationCheck = new Promise<boolean>((resolve) => {
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        if (video.duration > 5) {
          alert('動画は5秒以内にしてください');
          resolve(false);
        } else {
          resolve(true);
        }
      };
      video.onerror = () => {
        alert('動画ファイルの読み込みに失敗しました');
        resolve(false);
      };
    });

    video.src = URL.createObjectURL(file);
    const isValid = await durationCheck;
    if (!isValid) return;

    setUploadingVideo(agentId);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('agentId', agentId);

      const res = await fetch('/api/icon-video', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        // ローカルの状態を更新
        setCompanies((prev) =>
          prev.map((company) =>
            company.companyId === companyId
              ? {
                  ...company,
                  agents: company.agents.map((agent) =>
                    agent.agentId === agentId
                      ? { ...agent, iconVideoUrl: data.iconVideoUrl }
                      : agent
                  ),
                }
              : company
          )
        );
      } else {
        const data = await res.json();
        alert(data.error || '動画のアップロードに失敗しました');
      }
    } catch (error) {
      console.error('Video upload error:', error);
      alert('エラーが発生しました');
    } finally {
      setUploadingVideo(null);
    }
  };

  // アイコン動画削除
  const handleVideoDelete = async (agentId: string, companyId: string) => {
    if (!confirm('動画を削除しますか？')) return;

    setUploadingVideo(agentId);

    try {
      const res = await fetch('/api/icon-video', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });

      if (res.ok) {
        // ローカルの状態を更新
        setCompanies((prev) =>
          prev.map((company) =>
            company.companyId === companyId
              ? {
                  ...company,
                  agents: company.agents.map((agent) =>
                    agent.agentId === agentId
                      ? { ...agent, iconVideoUrl: undefined }
                      : agent
                  ),
                }
              : company
          )
        );
      } else {
        const data = await res.json();
        alert(data.error || '動画の削除に失敗しました');
      }
    } catch (error) {
      console.error('Video delete error:', error);
      alert('エラーが発生しました');
    } finally {
      setUploadingVideo(null);
    }
  };

  // アバター一覧を取得
  const fetchAvatars = async (agentId: string) => {
    setLoadingAvatars(true);
    try {
      const res = await fetch(`/api/avatars?agentId=${agentId}`);
      if (res.ok) {
        const data = await res.json();
        setUploadedAvatars(data.avatars || []);
      }
    } catch (error) {
      console.error("Failed to fetch avatars:", error);
    } finally {
      setLoadingAvatars(false);
    }
  };

  // アバターをアップロード
  const handleAvatarUpload = async (agentId: string, file: File) => {
    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("agentId", agentId);
      formData.append("name", file.name);

      const res = await fetch("/api/avatars", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setUploadedAvatars((prev) => [data.avatar, ...prev]);
        // アップロードしたアバターを選択
        setEditAvatarUrl(data.avatar.dataUrl);
      } else {
        const data = await res.json();
        alert(data.error || "アップロードに失敗しました");
      }
    } catch (error) {
      console.error("Avatar upload error:", error);
      alert("アップロードに失敗しました");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // アバターを削除
  const handleDeleteAvatar = async (avatarId: string, dataUrl: string) => {
    if (!confirm("このアバターを削除しますか？")) return;

    try {
      const res = await fetch("/api/avatars", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId }),
      });

      if (res.ok) {
        setUploadedAvatars((prev) => prev.filter((a) => a.avatarId !== avatarId));
        // 削除したアバターが選択中の場合はデフォルトに戻す
        if (editAvatarUrl === dataUrl) {
          setEditAvatarUrl("/agent-avatar.png");
        }
      } else {
        const data = await res.json();
        alert(data.error || "削除に失敗しました");
      }
    } catch (error) {
      console.error("Avatar delete error:", error);
      alert("削除に失敗しました");
    }
  };

  // エージェントを削除
  const handleDeleteAgent = async (agentId: string, companyName: string) => {
    if (!confirm(`「${companyName}」のエージェントを削除しますか？\n\nこの操作は取り消せません。関連するすべてのデータ（会話履歴、埋め込みデータなど）も削除されます。`)) {
      return;
    }

    setDeletingAgent(agentId);

    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        // ローカルの状態から削除
        setCompanies((prev) => prev.filter((c) => c.agents[0]?.agentId !== agentId));
        // ウィジェットが表示中なら閉じる
        if (createdAgent?.agentId === agentId) {
          setShowWidget(false);
          setCreatedAgent(null);
        }
      } else {
        const data = await res.json();
        alert(data.error || "削除に失敗しました");
      }
    } catch (error) {
      console.error("Delete agent error:", error);
      alert("削除に失敗しました");
    } finally {
      setDeletingAgent(null);
    }
  };

  // エージェント設定編集を開始
  const startEditingAgent = async (agent: Agent) => {
    setEditingAgent(agent.agentId);
    setEditAgentName(agent.name || "AI");
    setEditWelcomeMessage(agent.welcomeMessage || "いらっしゃいませ。ご質問があれば何でもお聞きください。");
    setEditVoiceEnabled(agent.voiceEnabled !== false);
    setEditAvatarUrl(agent.avatarUrl || "/agent-avatar.png");
    // アバター一覧を取得
    await fetchAvatars(agent.agentId);
  };

  // エージェント設定を保存
  const saveAgentSettings = async (agentId: string, companyId: string) => {
    setSavingSettings(true);

    // Proプラン未満は音声機能を無効にする
    const company = companies.find(c => c.companyId === companyId);
    const voiceEnabledValue = (company?.plan === "pro" || company?.plan === "max") ? editVoiceEnabled : false;

    try {
      const res = await fetch("/api/agents/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          name: editAgentName,
          welcomeMessage: editWelcomeMessage,
          voiceEnabled: voiceEnabledValue,
          avatarUrl: editAvatarUrl,
        }),
      });

      if (res.ok) {
        // ローカルの状態を更新
        setCompanies((prev) =>
          prev.map((c) =>
            c.companyId === companyId
              ? {
                  ...c,
                  agents: c.agents.map((agent) =>
                    agent.agentId === agentId
                      ? {
                          ...agent,
                          name: editAgentName,
                          welcomeMessage: editWelcomeMessage,
                          voiceEnabled: voiceEnabledValue,
                          avatarUrl: editAvatarUrl,
                        }
                      : agent
                  ),
                }
              : c
          )
        );
        setEditingAgent(null);
      } else {
        const data = await res.json();
        alert(data.error || "設定の保存に失敗しました");
      }
    } catch (error) {
      console.error("Settings save error:", error);
      alert("エラーが発生しました");
    } finally {
      setSavingSettings(false);
    }
  };

  // 基本情報を保存
  const saveCompanyInfo = async (agentId: string, companyId: string) => {
    setSavingCompanyInfo(true);
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyInfo: editCompanyInfo,
        }),
      });

      if (res.ok) {
        // ローカルの状態を更新
        setCompanies((prev) =>
          prev.map((c) =>
            c.companyId === companyId
              ? {
                  ...c,
                  agents: c.agents.map((agent) =>
                    agent.agentId === agentId
                      ? {
                          ...agent,
                          companyInfo: editCompanyInfo,
                        }
                      : agent
                  ),
                }
              : c
          )
        );
        setEditingCompanyInfo(null);
      } else {
        const data = await res.json();
        alert(data.error || "基本情報の保存に失敗しました");
      }
    } catch (error) {
      console.error("Company info save error:", error);
      alert("エラーが発生しました");
    } finally {
      setSavingCompanyInfo(false);
    }
  };

  // 基本情報編集を開始
  const startEditingCompanyInfo = (agent: Agent) => {
    setEditingCompanyInfo(agent.agentId);
    setEditCompanyInfo(agent.companyInfo || {});
  };

  // 再クロールして基本情報を再取得
  const recrawlAgent = async (agentId: string, companyId: string) => {
    if (!confirm("サイトを再クロールして基本情報を更新しますか？\n\n※プロンプトやナレッジの設定は保持されます")) {
      return;
    }

    setRecrawlingAgent(agentId);
    setRecrawlProgress({ percent: 0 });
    try {
      const res = await fetch(`/api/agents/${agentId}/recrawl`, {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || "再クロールに失敗しました");
        return;
      }

      // SSEストリーミングを読み取る
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        alert("ストリーミングに失敗しました");
        return;
      }

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              // CrawlProgressのtype: "discovering" | "crawling" | "embedding" | "saving" | "extracting" | "complete"
              const progressTypes = ["discovering", "crawling", "embedding", "saving", "extracting"];
              if (progressTypes.includes(data.type)) {
                setRecrawlProgress({
                  percent: data.percent || 0,
                  currentUrl: data.currentUrl,
                });
              } else if (data.type === "complete") {
                if (data.success && data.companyInfo) {
                  setCompanies((prev) =>
                    prev.map((c) =>
                      c.companyId === companyId
                        ? {
                            ...c,
                            agents: c.agents.map((agent) =>
                              agent.agentId === agentId
                                ? {
                                    ...agent,
                                    companyInfo: data.companyInfo,
                                    themeColor: data.themeColor || agent.themeColor,
                                  }
                                : agent
                            ),
                          }
                        : c
                    )
                  );
                  alert(`基本情報を更新しました（${data.pagesCount || 0}ページをクロール）`);
                } else {
                  alert(data.message || "基本情報を抽出できませんでした");
                }
              } else if (data.type === "error") {
                alert(data.error || "再クロールに失敗しました");
              }
            } catch (e) {
              console.error("Failed to parse SSE data:", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Recrawl error:", error);
      alert("エラーが発生しました");
    } finally {
      setRecrawlingAgent(null);
      setRecrawlProgress(null);
    }
  };

  const getEmbedCode = (company: Company) => {
    const widgetBaseUrl = typeof window !== "undefined"
      ? window.location.origin + "/widget"
      : "http://localhost:4000/widget";

    // 設定はサーバーから動的に取得されるため、companyIdとwidgetBaseUrlのみ必要
    return `<script
  src="${typeof window !== "undefined" ? window.location.origin : "http://localhost:4000"}/widget.js"
  data-company-id="${company.companyId}"
  data-widget-base-url="${widgetBaseUrl}"
  defer
></script>`;
  };

  const handleCopy = (companyId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(companyId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getPlanBadge = (plan?: string, companyId?: string) => {
    const badge = (() => {
      switch (plan) {
        case "max":
          return (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-amber-400 to-orange-500 text-white">
              MAX
            </span>
          );
        case "pro":
          return (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
              PRO
            </span>
          );
        case "lite":
          return (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              LITE
            </span>
          );
        default:
          return (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
              FREE
            </span>
          );
      }
    })();

    // Maxプラン購入者で、FreeプランのcompanyならMaxへ変更ボタンを表示
    if (maxPlanCount > 0 && (!plan || plan === "free") && companyId) {
      return (
        <div className="flex items-center gap-2">
          {badge}
          <span
            onClick={(e) => {
              e.stopPropagation();
              if (changingPlanCompany !== companyId) {
                handleChangePlan(companyId, "max");
              }
            }}
            className={`px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors cursor-pointer ${changingPlanCompany === companyId ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {changingPlanCompany === companyId ? "..." : "→Max"}
          </span>
        </div>
      );
    }

    // MaxプランのcompanyならFreeへ戻すボタンを表示
    if (plan === "max" && companyId) {
      return (
        <div className="flex items-center gap-2">
          {badge}
          <span
            onClick={(e) => {
              e.stopPropagation();
              if (changingPlanCompany !== companyId && confirm("このcompanyをFreeプランに戻しますか？")) {
                handleChangePlan(companyId, "free");
              }
            }}
            className={`px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors cursor-pointer ${changingPlanCompany === companyId ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {changingPlanCompany === companyId ? "..." : "→Free"}
          </span>
        </div>
      );
    }

    return badge;
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-rose-500 mx-auto mb-4" />
          <p className="text-slate-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ユーザー情報 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800">
            ようこそ、{session?.user?.name || session?.user?.email?.split("@")[0]}さん
          </h2>
          <p className="text-slate-600 text-xs sm:text-sm mt-1 truncate max-w-[250px] sm:max-w-none">
            {session?.user?.email}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {session?.user?.email && SUPER_ADMIN_EMAILS.includes(session.user.email.toLowerCase()) && (
            <Link
              href="/superadmin"
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs sm:text-sm font-medium hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg"
            >
              <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Super Admin</span>
              <span className="sm:hidden">管理</span>
            </Link>
          )}
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs sm:text-sm hover:bg-slate-50 transition-all"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">ログアウト</span>
          </button>
        </div>
      </div>

      {/* エージェント数表示と新規作成ボタン */}
      <div className="mb-4 sm:mb-6">
        {(() => {
          // 各プランのcompany数をカウント
          const planCounts: Record<string, number> = { free: 0, lite: 0, pro: 0, max: 0 };
          for (const company of companies) {
            const companyPlan = company.plan || "free";
            planCounts[companyPlan] = (planCounts[companyPlan] || 0) + 1;
          }

          // エージェント上限を計算
          // Free: 上限なし
          // Lite/Pro: それぞれ1エージェント/company
          // Max: maxPlanCount × 5 エージェント（ユーザー全体で共有）
          const paidAgentLimit = planCounts.lite + planCounts.pro;
          const maxAgentLimit = Math.max(maxPlanCount, planCounts.max > 0 ? 1 : 0) * 5;
          const agentLimit = paidAgentLimit + maxAgentLimit;

          const currentAgentCount = companies.reduce((sum, c) => sum + c.agents.length, 0);
          // 有料プランがある場合のみ上限チェック（Freeのみの場合は無制限）
          const canCreateMore = agentLimit === 0 || currentAgentCount < agentLimit;

          // プラン表示用のサマリーを作成（有料枠を表示）
          const maxSlots = maxAgentLimit; // Max枠数
          const proSlots = planCounts.pro; // Pro枠数
          const liteSlots = planCounts.lite; // Lite枠数
          const freeSlots = planCounts.free; // Free枠数
          const paidSlots = maxSlots + proSlots; // 有料枠合計

          let planSummary = "";
          if (paidSlots > 0) {
            const paidParts: string[] = [];
            if (maxSlots > 0) paidParts.push(`Max ${maxSlots}`);
            if (proSlots > 0) paidParts.push(`Pro ${proSlots}`);
            planSummary = `有料枠: ${paidParts.join(" + ")} = ${paidSlots}枠`;
            if (liteSlots > 0 || freeSlots > 0) {
              const freeParts: string[] = [];
              if (liteSlots > 0) freeParts.push(`Lite ${liteSlots}`);
              if (freeSlots > 0) freeParts.push(`Free ${freeSlots}`);
              planSummary += ` + ${freeParts.join(" + ")}`;
            }
          } else {
            // 有料枠なし
            const parts: string[] = [];
            if (liteSlots > 0) parts.push(`Lite ${liteSlots}枠`);
            if (freeSlots > 0) parts.push(`Free ${freeSlots}枠`);
            planSummary = parts.join(", ");
          }

          return (
            <>
              {/* エージェント数表示 */}
              <div className="flex flex-wrap items-center gap-4 mb-3">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="font-medium">エージェント:</span>
                  <span className={`font-bold ${!canCreateMore ? "text-red-500" : "text-slate-800"}`}>
                    {currentAgentCount} / {agentLimit === 0 ? "無制限" : agentLimit}
                  </span>
                  <span className="text-xs text-slate-400">
                    ({planSummary})
                  </span>
                </div>
                {!canCreateMore && maxPlanCount === 0 && (
                  <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                    Maxプランで+5枠追加可能
                  </span>
                )}
                {(maxPlanCount > 0 || planCounts.max > 0) && (
                  <>
                    <span className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-full flex items-center gap-1">
                      <span className="font-medium">Max枠:</span>
                      <span className="font-bold">{planCounts.max}</span>
                      <span>/</span>
                      <span>{maxPlanCount}</span>
                      <span className="text-amber-500">（残り{maxPlanCount - planCounts.max}枠）</span>
                    </span>
                    <button
                      onClick={() => {
                        setSelectedCompanyForPlan(companies[0] || null);
                        setShowPlanModal(true);
                      }}
                      className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-full hover:bg-purple-100 transition-colors"
                    >
                      +5枠を追加購入
                    </button>
                  </>
                )}
              </div>

              {!showCreateForm ? (
                <button
                  onClick={() => setShowCreateForm(true)}
                  disabled={!canCreateMore}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-medium text-white shadow-md transition-all text-sm ${
                    canCreateMore ? "hover:shadow-lg hover:scale-[1.02]" : "opacity-50 cursor-not-allowed"
                  }`}
                  style={{ background: "linear-gradient(135deg, #D86672 0%, #D86672 100%)" }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  {canCreateMore ? "新規作成" : "上限"}
                </button>
              ) : (
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg border border-rose-100 p-4 sm:p-6">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5 text-rose-500" />
              新規エージェント作成
            </h3>
            <form onSubmit={handleCreateAgent} className="space-y-4">
              <div>
                <input
                  type="text"
                  value={rootUrl}
                  onChange={(e) => setRootUrl(e.target.value)}
                  placeholder="example.com または https://example.com"
                  className="w-full border border-rose-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-300"
                  required
                  disabled={creating}
                />
              </div>

              {/* 進捗表示 */}
              {progress && (
                <div className="bg-rose-50 rounded-xl p-4 border border-rose-100">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="relative">
                      <Loader2 className="w-6 h-6 text-rose-500 animate-spin" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">
                        {progress.message || "処理中..."}
                      </p>
                      {progress.currentUrl && (
                        <p className="text-xs text-slate-500 truncate max-w-md">
                          {progress.currentUrl}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* プログレスバー */}
                  <div className="w-full bg-rose-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-rose-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${progress.percent || 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-slate-500">
                    <span>
                      {progress.currentPage || 0} / {progress.totalPages || 30} ページ
                    </span>
                    <span>{progress.percent || 0}%</span>
                  </div>
                </div>
              )}

              {createError && (
                <p className="text-red-600 text-sm">{createError}</p>
              )}
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-3 rounded-xl font-semibold text-white shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #D86672 0%, #D86672 100%)" }}
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      作成中...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      作成
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setRootUrl("");
                    setCreateError("");
                    setProgress(null);
                  }}
                  disabled={creating}
                  className="px-6 py-3 rounded-xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all disabled:opacity-50"
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        )}
            </>
          );
        })()}
      </div>

      {/* 会社リスト */}
      {companies.length === 0 && !showCreateForm ? (
        <div className="bg-white rounded-2xl shadow-lg border border-rose-100 p-12 text-center">
          <MessageCircle className="w-12 h-12 text-rose-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-800 mb-2">
            まだエージェントがありません
          </h3>
          <p className="text-slate-600 text-sm">
            上のボタンから新しいエージェントを作成しましょう
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {companies.map((company) => {
            const isExpanded = expandedCompany === company.companyId;
            const agent = company.agents[0];
            const isPaid = company.plan === "lite" || company.plan === "pro" || company.plan === "max";

            return (
              <div
                key={company.companyId}
                className="bg-white rounded-2xl shadow-lg border border-rose-100 overflow-hidden"
              >
                {/* ヘッダー */}
                <div
                  onClick={() => setExpandedCompany(isExpanded ? null : company.companyId)}
                  className="w-full px-4 sm:px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all gap-2 cursor-pointer"
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    <div
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: agent?.themeColor + "20" }}
                    >
                      <Globe className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: agent?.themeColor }} />
                    </div>
                    <div className="text-left min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-800 truncate">{company.name}</h3>
                      <p className="text-xs sm:text-sm text-slate-500 truncate">{company.rootUrl}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
                    {company.isShared && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full flex items-center gap-1 hidden sm:flex">
                        <Users className="w-3 h-3" />
                        共有
                      </span>
                    )}
                    {getPlanBadge(company.plan, company.companyId)}
                    {/* 削除ボタン（共有されていないエージェントのみ） */}
                    {!company.isShared && agent && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAgent(agent.agentId, company.name);
                        }}
                        disabled={deletingAgent === agent.agentId}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
                        title="エージェントを削除"
                      >
                        {deletingAgent === agent.agentId ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* 展開コンテンツ */}
                {isExpanded && agent && (
                  <div className="px-6 pb-6 space-y-6 border-t border-slate-100 pt-6">
                    {/* 基本設定（無料） */}
                    <div className="bg-slate-50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-medium text-slate-700 flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-rose-500" />
                          基本設定
                        </h4>
                        <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                          無料
                        </span>
                      </div>

                      {editingAgent === agent.agentId ? (
                        <div className="space-y-4">
                          {/* アバター選択 */}
                          <div>
                            <label className="block text-sm text-slate-600 mb-2 flex items-center gap-2">
                              <Image className="w-4 h-4" />
                              アイコン画像
                            </label>

                            {/* アバター選択エリア */}
                            <div className="flex flex-wrap gap-3 items-start">
                              {/* デフォルトアバター */}
                              <button
                                type="button"
                                onClick={() => setEditAvatarUrl("/agent-avatar.png")}
                                className={`relative w-14 h-14 rounded-full overflow-hidden border-2 transition-all flex-shrink-0 ${
                                  editAvatarUrl === "/agent-avatar.png"
                                    ? "border-rose-500 ring-2 ring-rose-200"
                                    : "border-slate-200 hover:border-slate-300"
                                }`}
                                title="デフォルト"
                              >
                                <img
                                  src="/agent-avatar.png"
                                  alt="Default"
                                  className="w-full h-full object-cover"
                                />
                              </button>

                              {/* アップロード済みアバター */}
                              {loadingAvatars ? (
                                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                                </div>
                              ) : (
                                uploadedAvatars.map((avatar) => (
                                  <div key={avatar.avatarId} className="relative group">
                                    <button
                                      type="button"
                                      onClick={() => setEditAvatarUrl(avatar.dataUrl)}
                                      className={`w-14 h-14 rounded-full overflow-hidden border-2 transition-all ${
                                        editAvatarUrl === avatar.dataUrl
                                          ? "border-rose-500 ring-2 ring-rose-200"
                                          : "border-slate-200 hover:border-slate-300"
                                      }`}
                                      title={avatar.name}
                                    >
                                      <img
                                        src={avatar.dataUrl}
                                        alt={avatar.name}
                                        className="w-full h-full object-cover"
                                      />
                                    </button>
                                    {/* 削除ボタン */}
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAvatar(avatar.avatarId, avatar.dataUrl)}
                                      className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                                      title="削除"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))
                              )}

                              {/* アップロードボタン */}
                              <label
                                className={`w-14 h-14 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-rose-400 hover:bg-rose-50 transition-all ${
                                  uploadingAvatar ? "opacity-50 cursor-not-allowed" : ""
                                }`}
                                title="画像をアップロード"
                              >
                                {uploadingAvatar ? (
                                  <Loader2 className="w-5 h-5 animate-spin text-rose-500" />
                                ) : (
                                  <Upload className="w-5 h-5 text-slate-400" />
                                )}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  disabled={uploadingAvatar}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      handleAvatarUpload(agent.agentId, file);
                                    }
                                    e.target.value = "";
                                  }}
                                />
                              </label>
                            </div>

                            <p className="text-xs text-slate-500 mt-2">
                              画像をアップロードするか、デフォルトを選択してください（1MB以下）
                            </p>
                          </div>

                          {/* チャットタイトル（エージェント名） */}
                          <div>
                            <label className="block text-sm text-slate-600 mb-2">
                              チャットタイトル
                            </label>
                            <input
                              type="text"
                              value={editAgentName}
                              onChange={(e) => setEditAgentName(e.target.value)}
                              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-300"
                              placeholder="AI コンシェルジュ"
                            />
                            <p className="text-xs text-slate-500 mt-1">
                              チャットウィジェットに表示される名前です
                            </p>
                          </div>

                          {/* 挨拶メッセージ */}
                          <div>
                            <label className="block text-sm text-slate-600 mb-2">
                              最初の挨拶メッセージ
                            </label>
                            <textarea
                              value={editWelcomeMessage}
                              onChange={(e) => setEditWelcomeMessage(e.target.value)}
                              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-300 resize-none"
                              rows={3}
                              placeholder="いらっしゃいませ。ご質問があれば何でもお聞きください。"
                            />
                          </div>

                          {/* 音声モード（Proプラン以上限定） */}
                          <div className="flex items-center justify-between">
                            <label className="text-sm text-slate-600 flex items-center gap-2">
                              {(company.plan === "pro" || company.plan === "max") ? (
                                editVoiceEnabled ? (
                                  <Volume2 className="w-4 h-4 text-rose-500" />
                                ) : (
                                  <VolumeX className="w-4 h-4 text-slate-400" />
                                )
                              ) : (
                                <Lock className="w-4 h-4 text-slate-400" />
                              )}
                              音声モード
                              {(company.plan !== "pro" && company.plan !== "max") && (
                                <span className="text-xs bg-gradient-to-r from-amber-400 to-orange-500 text-white px-2 py-0.5 rounded-full">
                                  Pro
                                </span>
                              )}
                            </label>
                            {(company.plan === "pro" || company.plan === "max") ? (
                              <button
                                onClick={() => setEditVoiceEnabled(!editVoiceEnabled)}
                                className={`relative w-12 h-6 rounded-full transition-all ${
                                  editVoiceEnabled ? "bg-rose-500" : "bg-slate-300"
                                }`}
                              >
                                <div
                                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                                    editVoiceEnabled ? "left-7" : "left-1"
                                  }`}
                                />
                              </button>
                            ) : (
                              <div className="relative w-12 h-6 rounded-full bg-slate-200 cursor-not-allowed">
                                <div className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full" />
                              </div>
                            )}
                          </div>

                          {/* 保存・キャンセルボタン */}
                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={() => saveAgentSettings(agent.agentId, company.companyId)}
                              disabled={savingSettings}
                              className="flex-1 py-2 rounded-xl font-medium text-white text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                              style={{ background: "linear-gradient(135deg, #D86672 0%, #D86672 100%)" }}
                            >
                              {savingSettings ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4" />
                              )}
                              保存
                            </button>
                            <button
                              onClick={() => setEditingAgent(null)}
                              disabled={savingSettings}
                              className="px-4 py-2 rounded-xl font-medium text-slate-600 text-sm bg-white border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-50"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {/* 現在の設定を表示 */}
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200">
                              <img
                                src={agent.avatarUrl || "/agent-avatar.png"}
                                alt="Agent avatar"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.src = "/agent-avatar.png";
                                }}
                              />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm text-slate-700 line-clamp-2">
                                {agent.welcomeMessage || "いらっしゃいませ。ご質問があれば何でもお聞きください。"}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {agent.voiceEnabled !== false ? (
                                <Volume2 className="w-4 h-4 text-rose-500" />
                              ) : (
                                <VolumeX className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => startEditingAgent(agent)}
                            className="w-full py-2 rounded-xl font-medium text-rose-600 text-sm border border-rose-200 hover:bg-rose-50 transition-all"
                          >
                            設定を編集
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 基本情報（自動取得） */}
                    <div className="bg-blue-50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-medium text-slate-700 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-blue-500" />
                          基本情報
                        </h4>
                        <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                          自動取得
                        </span>
                      </div>

                      {editingCompanyInfo === agent.agentId ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs text-slate-600 mb-1">会社名</label>
                              <input
                                type="text"
                                value={editCompanyInfo.companyName || ""}
                                onChange={(e) => setEditCompanyInfo({ ...editCompanyInfo, companyName: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                placeholder="株式会社〇〇"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-600 mb-1">代表者</label>
                              <input
                                type="text"
                                value={editCompanyInfo.representativeName || ""}
                                onChange={(e) => setEditCompanyInfo({ ...editCompanyInfo, representativeName: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                placeholder="山田 太郎"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-600 mb-1">設立年</label>
                              <input
                                type="text"
                                value={editCompanyInfo.establishedYear || ""}
                                onChange={(e) => setEditCompanyInfo({ ...editCompanyInfo, establishedYear: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                placeholder="2020年"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-600 mb-1">従業員数</label>
                              <input
                                type="text"
                                value={editCompanyInfo.employeeCount || ""}
                                onChange={(e) => setEditCompanyInfo({ ...editCompanyInfo, employeeCount: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                placeholder="50名"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-600 mb-1">電話番号</label>
                              <input
                                type="text"
                                value={editCompanyInfo.phone || ""}
                                onChange={(e) => setEditCompanyInfo({ ...editCompanyInfo, phone: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                placeholder="03-1234-5678"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-slate-600 mb-1">メールアドレス</label>
                              <input
                                type="text"
                                value={editCompanyInfo.email || ""}
                                onChange={(e) => setEditCompanyInfo({ ...editCompanyInfo, email: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                placeholder="info@example.com"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs text-slate-600 mb-1">住所</label>
                              <input
                                type="text"
                                value={editCompanyInfo.address || ""}
                                onChange={(e) => setEditCompanyInfo({ ...editCompanyInfo, address: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                                placeholder="東京都渋谷区〇〇1-2-3"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs text-slate-600 mb-1">事業内容</label>
                              <textarea
                                value={editCompanyInfo.businessDescription || ""}
                                onChange={(e) => setEditCompanyInfo({ ...editCompanyInfo, businessDescription: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                                rows={2}
                                placeholder="Webサービスの企画・開発・運営"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs text-slate-600 mb-1">採用情報</label>
                              <textarea
                                value={editCompanyInfo.recruitmentInfo || ""}
                                onChange={(e) => setEditCompanyInfo({ ...editCompanyInfo, recruitmentInfo: e.target.value })}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                                rows={2}
                                placeholder="積極採用中。詳しくは採用ページをご覧ください。"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={() => saveCompanyInfo(agent.agentId, company.companyId)}
                              disabled={savingCompanyInfo}
                              className="flex-1 py-2 rounded-xl font-medium text-white text-sm bg-blue-500 hover:bg-blue-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                              {savingCompanyInfo ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4" />
                              )}
                              保存
                            </button>
                            <button
                              onClick={() => setEditingCompanyInfo(null)}
                              disabled={savingCompanyInfo}
                              className="px-4 py-2 rounded-xl font-medium text-slate-600 text-sm bg-white border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-50"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {agent.companyInfo && Object.values(agent.companyInfo).some(v => v) ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                              {agent.companyInfo.companyName && (
                                <div className="flex items-start gap-2">
                                  <span className="text-slate-500 min-w-[4rem]">会社名:</span>
                                  <span className="text-slate-700">{agent.companyInfo.companyName}</span>
                                </div>
                              )}
                              {agent.companyInfo.representativeName && (
                                <div className="flex items-start gap-2">
                                  <span className="text-slate-500 min-w-[4rem]">代表者:</span>
                                  <span className="text-slate-700">{agent.companyInfo.representativeName}</span>
                                </div>
                              )}
                              {agent.companyInfo.establishedYear && (
                                <div className="flex items-start gap-2">
                                  <span className="text-slate-500 min-w-[4rem]">設立年:</span>
                                  <span className="text-slate-700">{agent.companyInfo.establishedYear}</span>
                                </div>
                              )}
                              {agent.companyInfo.employeeCount && (
                                <div className="flex items-start gap-2">
                                  <span className="text-slate-500 min-w-[4rem]">従業員数:</span>
                                  <span className="text-slate-700">{agent.companyInfo.employeeCount}</span>
                                </div>
                              )}
                              {agent.companyInfo.phone && (
                                <div className="flex items-start gap-2">
                                  <span className="text-slate-500 min-w-[4rem]">電話番号:</span>
                                  <span className="text-slate-700">{agent.companyInfo.phone}</span>
                                </div>
                              )}
                              {agent.companyInfo.email && (
                                <div className="flex items-start gap-2">
                                  <span className="text-slate-500 min-w-[4rem]">メール:</span>
                                  <span className="text-slate-700">{agent.companyInfo.email}</span>
                                </div>
                              )}
                              {agent.companyInfo.address && (
                                <div className="flex items-start gap-2 sm:col-span-2">
                                  <span className="text-slate-500 min-w-[4rem]">住所:</span>
                                  <span className="text-slate-700">{agent.companyInfo.address}</span>
                                </div>
                              )}
                              {agent.companyInfo.businessDescription && (
                                <div className="flex items-start gap-2 sm:col-span-2">
                                  <span className="text-slate-500 min-w-[4rem]">事業内容:</span>
                                  <span className="text-slate-700">{agent.companyInfo.businessDescription}</span>
                                </div>
                              )}
                              {agent.companyInfo.recruitmentInfo && (
                                <div className="flex items-start gap-2 sm:col-span-2">
                                  <span className="text-slate-500 min-w-[4rem]">採用情報:</span>
                                  <span className="text-slate-700">{agent.companyInfo.recruitmentInfo}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-slate-500">
                              サイトから基本情報を取得できませんでした。編集ボタンから手動で追加できます。
                            </p>
                          )}
                          <div className="flex gap-2">
                            <button
                              onClick={() => startEditingCompanyInfo(agent)}
                              className="flex-1 py-2 rounded-xl font-medium text-blue-600 text-sm border border-blue-200 hover:bg-blue-50 transition-all"
                            >
                              基本情報を編集
                            </button>
                            <button
                              onClick={() => recrawlAgent(agent.agentId, company.companyId)}
                              disabled={recrawlingAgent === agent.agentId}
                              className="flex items-center justify-center gap-1 px-4 py-2 rounded-xl font-medium text-emerald-600 text-sm border border-emerald-200 hover:bg-emerald-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              title="サイトを再クロールして基本情報を更新"
                            >
                              <RefreshCw className={`w-4 h-4 ${recrawlingAgent === agent.agentId ? "animate-spin" : ""}`} />
                              {recrawlingAgent === agent.agentId
                                ? `取得中... ${recrawlProgress?.percent ?? 0}%`
                                : "再取得"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* プレビュー（基本設定の直下） */}
                    <div className="bg-gradient-to-r from-rose-50 to-pink-50 rounded-xl p-4">
                      <h4 className="font-medium text-slate-700 flex items-center gap-2 mb-3">
                        <ExternalLink className="w-4 h-4 text-rose-500" />
                        プレビュー
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            setCreatedAgent({
                              companyId: company.companyId,
                              agentId: agent.agentId,
                              agentName: agent.name,
                              themeColor: agent.themeColor,
                              widgetPosition: agent.widgetPosition || "bottom-right",
                              widgetStyle: agent.widgetStyle || "bubble",
                              avatarUrl: agent.avatarUrl,
                              iconVideoUrl: agent.iconVideoUrl,
                            });
                            setChatWindowOpen(false);
                            setShowWidget(true);
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:shadow-lg"
                          style={{ background: "linear-gradient(135deg, #D86672 0%, #D86672 100%)" }}
                        >
                          <MessageCircle className="w-4 h-4" />
                          チャットを試す
                        </button>
                        <button
                          onClick={() => {
                            setPreviewAgent({
                              companyId: company.companyId,
                              agentId: agent.agentId,
                              agentName: agent.name,
                              themeColor: agent.themeColor,
                              widgetPosition: agent.widgetPosition || "bottom-right",
                            });
                            setShowWidgetPreview(true);
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-all border border-slate-200"
                        >
                          <Globe className="w-4 h-4" />
                          ウィジェットで試す
                        </button>
                      </div>
                    </div>

                    {/* カラー選択 */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-slate-700 flex items-center gap-2">
                          <Palette className="w-4 h-4 text-rose-500" />
                          チャットカラー
                        </h4>
                        <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                          無料
                        </span>
                        {updatingColor === agent.agentId && (
                          <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                        )}
                      </div>
                      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                        {colorOptions.map((color) => (
                          <button
                            key={color.value}
                            onClick={() => handleColorChange(agent.agentId, company.companyId, color.value)}
                            disabled={updatingColor === agent.agentId}
                            className={`w-8 h-8 rounded-lg transition-all ${
                              agent.themeColor === color.value
                                ? "ring-2 ring-offset-2 scale-110"
                                : ""
                            } hover:scale-105 cursor-pointer ${
                              updatingColor === agent.agentId ? "opacity-50" : ""
                            } ${
                              color.value === "#FFFFFF" ? "border border-slate-300" : ""
                            }`}
                            style={{
                              backgroundColor: color.value,
                              // @ts-expect-error - CSS custom property for Tailwind ring color
                              "--tw-ring-color": color.value,
                            }}
                            title={color.name}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        カラーをクリックして変更できます
                      </p>
                    </div>

                    {/* ウィジェット位置 - Lite以上で利用可能 */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="font-medium text-slate-700 flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-rose-500" />
                          表示位置
                        </h4>
                        <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                          無料
                        </span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {positionOptions.map((pos) => (
                          <button
                            key={pos.value}
                            onClick={() => handlePositionChange(agent.agentId, company.companyId, pos.value)}
                            disabled={updatingColor === agent.agentId}
                            className={`flex flex-col items-center justify-center px-2 py-2 sm:px-3 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                              (agent.widgetPosition || "bottom-right") === pos.value
                                ? "bg-rose-500 text-white shadow-md"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            } ${updatingColor === agent.agentId ? "opacity-50" : ""}`}
                          >
                            <span className="text-base sm:text-lg mb-0.5">{pos.icon}</span>
                            <span className="whitespace-nowrap">{pos.name}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        ※ 中央配置はモバイルでは下部に表示されます
                      </p>
                    </div>

                    {/* ウィジェットスタイル */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="font-medium text-slate-700 flex items-center gap-2">
                          <MessageCircle className="w-4 h-4 text-rose-500" />
                          ウィジェットスタイル
                        </h4>
                        <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                          無料
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {/* バブルスタイル */}
                        <button
                          onClick={() => handleStyleChange(agent.agentId, company.companyId, "bubble")}
                          disabled={updatingColor === agent.agentId}
                          className={`relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                            (agent.widgetStyle || "bubble") === "bubble"
                              ? "border-rose-500 bg-rose-50"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          } ${updatingColor === agent.agentId ? "opacity-50" : ""}`}
                        >
                          {(agent.widgetStyle || "bubble") === "bubble" && (
                            <div className="absolute top-2 right-2">
                              <Check className="w-4 h-4 text-rose-500" />
                            </div>
                          )}
                          {/* バブルプレビュー */}
                          <div
                            className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg mb-2"
                            style={{ backgroundColor: agent.themeColor }}
                          >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                          </div>
                          <span className="font-medium text-slate-700">バブル</span>
                          <span className="text-xs text-slate-500">円形背景付き</span>
                        </button>

                        {/* アイコンスタイル */}
                        <button
                          onClick={() => handleStyleChange(agent.agentId, company.companyId, "icon")}
                          disabled={updatingColor === agent.agentId}
                          className={`relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                            agent.widgetStyle === "icon"
                              ? "border-rose-500 bg-rose-50"
                              : "border-slate-200 bg-white hover:border-slate-300"
                          } ${updatingColor === agent.agentId ? "opacity-50" : ""}`}
                        >
                          {agent.widgetStyle === "icon" && (
                            <div className="absolute top-2 right-2">
                              <Check className="w-4 h-4 text-rose-500" />
                            </div>
                          )}
                          {/* アイコンプレビュー（アバター画像） */}
                          <div className="w-12 h-12 rounded-full overflow-hidden shadow-md mb-2 border-2 border-white">
                            <img
                              src={agent.avatarUrl || "/agent-avatar.png"}
                              alt="Avatar"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="font-medium text-slate-700">アイコン</span>
                          <span className="text-xs text-slate-500">アバター画像</span>
                        </button>
                      </div>

                      {/* アイコン動画アップロード（アイコンスタイル選択時のみ表示） */}
                      {agent.widgetStyle === "icon" && (
                        <div className="mt-4 p-3 bg-slate-50 rounded-xl">
                          <div className="flex items-center gap-2 mb-2">
                            <Video className="w-4 h-4 text-rose-500" />
                            <span className="text-sm font-medium text-slate-700">アイコン動画</span>
                            <span className="text-xs text-slate-500">（5秒以内）</span>
                          </div>
                          {agent.iconVideoUrl ? (
                            <div className="space-y-2">
                              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-md mx-auto">
                                <video
                                  src={agent.iconVideoUrl}
                                  autoPlay
                                  loop
                                  muted
                                  playsInline
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <button
                                onClick={() => handleVideoDelete(agent.agentId, company.companyId)}
                                disabled={uploadingVideo === agent.agentId}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-all disabled:opacity-50"
                              >
                                {uploadingVideo === agent.agentId ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3 h-3" />
                                )}
                                動画を削除
                              </button>
                            </div>
                          ) : (
                            <label className="block cursor-pointer">
                              <input
                                type="file"
                                accept="video/mp4,video/webm,video/quicktime"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleVideoUpload(agent.agentId, company.companyId, file);
                                  }
                                  e.target.value = '';
                                }}
                                disabled={uploadingVideo === agent.agentId}
                              />
                              <div className={`flex items-center justify-center gap-2 px-3 py-2 text-xs text-slate-600 bg-white border border-dashed border-slate-300 rounded-lg hover:bg-slate-50 transition-all ${uploadingVideo === agent.agentId ? 'opacity-50' : ''}`}>
                                {uploadingVideo === agent.agentId ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    アップロード中...
                                  </>
                                ) : (
                                  <>
                                    <Upload className="w-3 h-3" />
                                    動画をアップロード
                                  </>
                                )}
                              </div>
                            </label>
                          )}
                          <p className="text-xs text-slate-400 mt-2 text-center">
                            MP4/WebM/MOV形式・5MB以下
                          </p>
                        </div>
                      )}
                    </div>

                    {/* クイックボタン - Lite以上で利用可能 */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="font-medium text-slate-700 flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-rose-500" />
                          クイックボタン
                        </h4>
                        <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                          無料
                        </span>
                      </div>
                      {editingQuickButtons === agent.agentId ? (
                        <div className="space-y-3">
                          {quickButtonsForm.map((btn, idx) => (
                            <div key={idx} className="bg-slate-50 rounded-xl p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-slate-500 w-16">ボタン{idx + 1}</span>
                              </div>
                              <input
                                type="text"
                                placeholder="ラベル（例: 会社について）"
                                value={btn.label}
                                onChange={(e) => {
                                  const newButtons = [...quickButtonsForm];
                                  newButtons[idx].label = e.target.value;
                                  setQuickButtonsForm(newButtons);
                                }}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                              />
                              <input
                                type="text"
                                placeholder="送信メッセージ（例: 会社について教えてください）"
                                value={btn.query}
                                onChange={(e) => {
                                  const newButtons = [...quickButtonsForm];
                                  newButtons[idx].query = e.target.value;
                                  setQuickButtonsForm(newButtons);
                                }}
                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                              />
                            </div>
                          ))}
                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={() => handleSaveQuickButtons(agent.agentId)}
                              disabled={savingQuickButtons}
                              className="flex-1 py-2 rounded-xl font-medium text-white text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                              style={{ background: "linear-gradient(135deg, #D86672 0%, #D86672 100%)" }}
                            >
                              {savingQuickButtons ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Save className="w-4 h-4" />
                              )}
                              保存
                            </button>
                            <button
                              onClick={() => setEditingQuickButtons(null)}
                              disabled={savingQuickButtons}
                              className="px-4 py-2 rounded-xl font-medium text-slate-600 text-sm bg-white border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-50"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="bg-slate-50 rounded-xl p-3">
                            {agent.quickButtons && agent.quickButtons.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {agent.quickButtons.map((btn, idx) => (
                                  <span
                                    key={idx}
                                    className="px-3 py-1.5 bg-white rounded-lg text-sm text-slate-700 border border-slate-200"
                                  >
                                    {btn.label}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-slate-500">デフォルトのボタンを使用中</p>
                            )}
                          </div>
                          <button
                            onClick={() => startEditingQuickButtons(agent)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 transition-all"
                          >
                            <Edit3 className="w-3 h-3" />
                            編集
                          </button>
                        </div>
                      )}
                    </div>

                    {/* カスタムナレッジ - Pro機能 */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-slate-700 flex items-center gap-2">
                          <Database className="w-4 h-4 text-rose-500" />
                          カスタムナレッジ
                          <span className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                            {(company.plan === "pro" || company.plan === "max") ? "Pro" : <>
                              <Lock className="w-3 h-3" />
                              Pro
                            </>}
                          </span>
                        </h4>
                        {(company.plan === "pro" || company.plan === "max") && (
                          <button
                            onClick={() => {
                              setKnowledgeCompanyId(company.companyId);
                              setEditingKnowledge(null);
                              setKnowledgeTitle("");
                              setKnowledgeContent("");
                              setShowKnowledgeModal(true);
                              fetchCustomKnowledge(company.companyId);
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-purple-500 hover:bg-purple-600 transition-all"
                          >
                            <PlusCircle className="w-3 h-3" />
                            追加
                          </button>
                        )}
                      </div>
                      {(company.plan === "pro" || company.plan === "max") ? (
                        <div className="space-y-2">
                          {(customKnowledges[company.companyId] || []).length === 0 ? (
                            <div className="bg-purple-50 rounded-xl p-4 text-center">
                              <Database className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                              <p className="text-sm text-purple-700">
                                カスタムナレッジを追加すると、AIがその情報を使って回答します
                              </p>
                              <p className="text-xs text-purple-500 mt-1">
                                例: よくある質問、製品情報、会社のポリシーなど
                              </p>
                            </div>
                          ) : (
                            (customKnowledges[company.companyId] || []).map((k) => (
                              <div key={k.knowledgeId} className="bg-slate-50 rounded-xl p-3 flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-slate-800 text-sm">{k.title}</p>
                                  <p className="text-xs text-slate-500 truncate mt-1">{k.content.substring(0, 100)}...</p>
                                </div>
                                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                                  <button
                                    onClick={() => {
                                      setKnowledgeCompanyId(company.companyId);
                                      setEditingKnowledge(k);
                                      setKnowledgeTitle(k.title);
                                      setKnowledgeContent(k.content);
                                      setShowKnowledgeModal(true);
                                    }}
                                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 transition-all"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteKnowledge(company.companyId, k.knowledgeId)}
                                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      ) : (
                        <div className="bg-slate-100 rounded-xl p-4 text-center">
                          <Lock className="w-5 h-5 text-slate-400 mx-auto mb-2" />
                          <p className="text-sm text-slate-600">
                            ProプランでカスタムナレッジをAIに学習させることができます
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            最大3000文字のテキストを追加可能
                          </p>
                        </div>
                      )}
                    </div>

                    {/* プロンプト設定 - Pro機能 */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-slate-700 flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-blue-500" />
                          プロンプト設定
                          <span className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                            {(company.plan === "pro" || company.plan === "max") ? "Pro" : <>
                              <Lock className="w-3 h-3" />
                              Pro
                            </>}
                          </span>
                        </h4>
                        {(company.plan === "pro" || company.plan === "max") && agent && (
                          <button
                            onClick={() => openPromptModal(agent.agentId, company.plan || "free")}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 transition-all"
                          >
                            <Edit3 className="w-3 h-3" />
                            編集
                          </button>
                        )}
                      </div>
                      {(company.plan === "pro" || company.plan === "max") ? (
                        <div className="bg-blue-50 rounded-xl p-4">
                          <div className="space-y-3 text-sm">
                            <div>
                              <p className="text-xs text-blue-600 font-medium mb-1">役割定義</p>
                              <p className="text-slate-700">
                                {agent?.systemPrompt ? agent.systemPrompt.substring(0, 100) + (agent.systemPrompt.length > 100 ? "..." : "") : "（未設定）"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-blue-600 font-medium mb-1">会話スタイル</p>
                              <p className="text-slate-700">
                                {agent?.style || "（未設定）"}
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-blue-500 mt-3">
                            GPTsのようにAIの振る舞いをカスタマイズできます
                          </p>
                        </div>
                      ) : (
                        <div className="bg-slate-100 rounded-xl p-4 text-center">
                          <Lock className="w-5 h-5 text-slate-400 mx-auto mb-2" />
                          <p className="text-sm text-slate-600">
                            ProプランでAIの振る舞いをカスタマイズできます
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            役割定義・ナレッジ・会話スタイルを設定可能
                          </p>
                        </div>
                      )}
                    </div>

                    {/* 埋め込みコード */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-slate-700 flex items-center gap-2">
                          <Copy className="w-4 h-4 text-rose-500" />
                          埋め込みコード
                          <button
                            onClick={() => setShowEmbedHelp(true)}
                            className="p-1 rounded-full hover:bg-slate-100 transition-all"
                            title="埋め込み方法を確認"
                          >
                            <HelpCircle className="w-4 h-4 text-slate-400" />
                          </button>
                        </h4>
                        {!isPaid && (
                          <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                            <Lock className="w-3 h-3" />
                            有料
                          </span>
                        )}
                      </div>
                      {isPaid ? (
                        <>
                          <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto whitespace-pre-wrap">
                            {getEmbedCode(company)}
                          </pre>
                          <button
                            onClick={() => handleCopy(company.companyId, getEmbedCode(company))}
                            className="mt-3 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all flex items-center gap-2"
                            style={{
                              background: copiedId === company.companyId
                                ? "linear-gradient(135deg, #10B981 0%, #059669 100%)"
                                : "linear-gradient(135deg, #D86672 0%, #D86672 100%)",
                            }}
                          >
                            {copiedId === company.companyId ? (
                              <>
                                <Check className="w-4 h-4" />
                                コピーしました！
                              </>
                            ) : (
                              <>
                                <Copy className="w-4 h-4" />
                                コードをコピー
                              </>
                            )}
                          </button>
                        </>
                      ) : (
                        <div className="bg-slate-100 rounded-xl p-4 text-center">
                          <Lock className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                          <p className="text-sm text-slate-600">
                            有料プランで埋め込みコードを取得できます
                          </p>
                          <button
                            onClick={() => {
                              setSelectedCompanyForPlan(company);
                              setShowPlanModal(true);
                            }}
                            className="inline-flex items-center gap-2 mt-3 px-6 py-3 rounded-xl text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all"
                            style={{ background: "linear-gradient(135deg, #D86672 0%, #D86672 100%)" }}
                          >
                            <Lock className="w-4 h-4" />
                            プランを選んでアンロック
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Proプラン以上: 分析 */}
                    {(company.plan === "pro" || company.plan === "max") && (
                      <div>
                        <h4 className="font-medium text-slate-700 flex items-center gap-2 mb-3">
                          <BarChart3 className="w-4 h-4 text-rose-500" />
                          分析ダッシュボード
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                            PRO
                          </span>
                        </h4>
                        <Link
                          href={`/dashboard/analytics?companyId=${company.companyId}&companyName=${encodeURIComponent(company.name)}`}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 transition-all"
                        >
                          詳細分析を見る
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      </div>
                    )}

                    {/* Liteプラン: 分析（制限付き） */}
                    {company.plan === "lite" && (
                      <div>
                        <h4 className="font-medium text-slate-700 flex items-center gap-2 mb-3">
                          <BarChart3 className="w-4 h-4 text-slate-400" />
                          分析ダッシュボード
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">
                            制限付き
                          </span>
                        </h4>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/dashboard/analytics?companyId=${company.companyId}&companyName=${encodeURIComponent(company.name)}`}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                          >
                            基本分析を見る
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => {
                              setSelectedCompanyForPlan(company);
                              setShowPlanModal(true);
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 transition-all"
                          >
                            <Sparkles className="w-4 h-4" />
                            Proで詳細分析
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Freeプラン: 分析（Pro/Maxアップグレード誘導） */}
                    {(!company.plan || company.plan === "free") && (
                      <div className="bg-gradient-to-r from-purple-50 to-rose-50 rounded-xl p-4">
                        <h4 className="font-medium text-slate-700 flex items-center gap-2 mb-2">
                          <BarChart3 className="w-4 h-4 text-purple-500" />
                          分析ダッシュボード
                          <Lock className="w-3 h-3 text-slate-400" />
                        </h4>
                        <p className="text-sm text-slate-500 mb-3">
                          Pro/Maxプランでチャット経由CVR、質問分析、AI改善提案などの詳細分析が利用可能
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => {
                              setSelectedCompanyForPlan(company);
                              setShowPlanModal(true);
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-purple-500 to-rose-500 hover:from-purple-600 hover:to-rose-600 transition-all shadow-sm"
                          >
                            <Sparkles className="w-4 h-4" />
                            Proプランにアップグレード
                          </button>
                          <button
                            onClick={() => {
                              setSelectedCompanyForPlan(company);
                              setShowPlanModal(true);
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 transition-all shadow-sm"
                          >
                            <Zap className="w-4 h-4" />
                            Maxプランにアップグレード
                          </button>
                        </div>
                      </div>
                    )}

                    {/* エージェント共有 & 削除 */}
                    <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-2">
                      {/* 共有ボタン（自分が所有するエージェントのみ） */}
                      {!agent.isShared && (
                        <button
                          onClick={() => openShareModal(agent.agentId)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-all"
                        >
                          <Share2 className="w-4 h-4" />
                          共有
                          {agent.sharedWith && agent.sharedWith.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-200 text-blue-700 rounded-full">
                              {agent.sharedWith.length}
                            </span>
                          )}
                        </button>
                      )}
                      {/* 削除ボタン（自分が所有するエージェントのみ） */}
                      {!agent.isShared && (
                        <button
                          onClick={() => handleDeleteAgent(agent.agentId, company.name)}
                          disabled={deletingAgent === agent.agentId}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingAgent === agent.agentId ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              削除中...
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-4 h-4" />
                              削除
                            </>
                          )}
                        </button>
                      )}
                      {/* 共有エージェントの表示 */}
                      {agent.isShared && (
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium text-slate-500 bg-slate-100">
                          <Users className="w-3 h-3" />
                          共有されています
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* 共有されたエージェント */}
          {sharedCompanies.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" />
                共有されたエージェント
              </h2>
              <div className="space-y-4">
                {sharedCompanies.map((company) => {
                  const isExpanded = expandedCompany === company.companyId;
                  const agent = company.agents[0];
                  const isPaid = company.plan === "lite" || company.plan === "pro" || company.plan === "max";

                  return (
                    <div
                      key={`shared-${company.companyId}`}
                      className="bg-white rounded-2xl shadow-lg border border-blue-100 overflow-hidden"
                    >
                      {/* ヘッダー */}
                      <button
                        onClick={() => setExpandedCompany(isExpanded ? null : company.companyId)}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all"
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center relative"
                            style={{ backgroundColor: (agent?.themeColor || "#3B82F6") + "20" }}
                          >
                            <Globe
                              className="w-6 h-6"
                              style={{ color: agent?.themeColor || "#3B82F6" }}
                            />
                            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                              <Users className="w-3 h-3 text-white" />
                            </div>
                          </div>
                          <div className="text-left">
                            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                              {company.name || company.rootUrl}
                              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full">
                                共有
                              </span>
                            </h2>
                            <p className="text-sm text-slate-500 truncate max-w-[200px] sm:max-w-none">
                              {company.rootUrl}
                            </p>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-400" />
                        )}
                      </button>

                      {/* 展開コンテンツ（編集機能付き） */}
                      {isExpanded && agent && (
                        <div className="px-6 pb-6 border-t border-slate-100 pt-4 space-y-6">
                          <p className="text-sm text-slate-500">
                            このエージェントはあなたと共有されています。編集が可能です。
                          </p>

                          {/* 基本設定 */}
                          <div className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-xl p-4">
                            <h4 className="font-medium text-slate-700 flex items-center gap-2 mb-3">
                              <MessageCircle className="w-4 h-4 text-blue-500" />
                              基本設定
                            </h4>
                            {editingAgent === agent.agentId ? (
                              <div className="space-y-4">
                                <div>
                                  <label className="block text-xs font-medium text-slate-500 mb-1">
                                    エージェント名
                                  </label>
                                  <input
                                    type="text"
                                    value={editAgentName}
                                    onChange={(e) => setEditAgentName(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-slate-500 mb-1">
                                    ウェルカムメッセージ
                                  </label>
                                  <textarea
                                    value={editWelcomeMessage}
                                    onChange={(e) => setEditWelcomeMessage(e.target.value)}
                                    rows={2}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                  />
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-sm text-slate-600">音声読み上げ</span>
                                  {isPaid ? (
                                    <button
                                      onClick={() => setEditVoiceEnabled(!editVoiceEnabled)}
                                      className={`relative w-12 h-6 rounded-full transition-colors ${
                                        editVoiceEnabled ? "bg-blue-500" : "bg-slate-200"
                                      }`}
                                    >
                                      <div
                                        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                                          editVoiceEnabled ? "left-7" : "left-1"
                                        }`}
                                      />
                                    </button>
                                  ) : (
                                    <div className="relative w-12 h-6 rounded-full bg-slate-200 cursor-not-allowed">
                                      <div className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-2 pt-2">
                                  <button
                                    onClick={() => saveAgentSettings(agent.agentId, company.companyId)}
                                    disabled={savingSettings}
                                    className="flex-1 py-2 rounded-xl font-medium text-white text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 bg-blue-500 hover:bg-blue-600"
                                  >
                                    {savingSettings ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Save className="w-4 h-4" />
                                    )}
                                    保存
                                  </button>
                                  <button
                                    onClick={() => setEditingAgent(null)}
                                    disabled={savingSettings}
                                    className="px-4 py-2 rounded-xl font-medium text-slate-600 text-sm bg-white border border-slate-200 hover:bg-slate-50 transition-all disabled:opacity-50"
                                  >
                                    キャンセル
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full overflow-hidden border border-slate-200">
                                    <img
                                      src={agent.avatarUrl || "/agent-avatar.png"}
                                      alt="Agent avatar"
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        e.currentTarget.src = "/agent-avatar.png";
                                      }}
                                    />
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-slate-800">{agent.name}</p>
                                    <p className="text-xs text-slate-500 line-clamp-1">
                                      {agent.welcomeMessage || "いらっしゃいませ。"}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {agent.voiceEnabled !== false ? (
                                      <Volume2 className="w-4 h-4 text-blue-500" />
                                    ) : (
                                      <VolumeX className="w-4 h-4 text-slate-400" />
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={() => startEditingAgent(agent)}
                                  className="w-full py-2 rounded-xl font-medium text-blue-600 text-sm border border-blue-200 hover:bg-blue-50 transition-all"
                                >
                                  設定を編集
                                </button>
                              </div>
                            )}
                          </div>

                          {/* プレビュー */}
                          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-4">
                            <h4 className="font-medium text-slate-700 flex items-center gap-2 mb-3">
                              <ExternalLink className="w-4 h-4 text-blue-500" />
                              プレビュー
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => {
                                  setCreatedAgent({
                                    companyId: company.companyId,
                                    agentId: agent.agentId,
                                    agentName: agent.name,
                                    themeColor: agent.themeColor,
                                    widgetPosition: agent.widgetPosition || "bottom-right",
                                    widgetStyle: agent.widgetStyle || "bubble",
                                    avatarUrl: agent.avatarUrl,
                                    iconVideoUrl: agent.iconVideoUrl,
                                  });
                                  setChatWindowOpen(false);
                                  setShowWidget(true);
                                }}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 transition-all"
                              >
                                <MessageCircle className="w-4 h-4" />
                                チャットを試す
                              </button>
                              <button
                                onClick={() => {
                                  setPreviewAgent({
                                    companyId: agent.companyId,
                                    agentId: agent.agentId,
                                    agentName: agent.name,
                                    themeColor: agent.themeColor,
                                    widgetPosition: agent.widgetPosition || "bottom-right",
                                  });
                                  setShowWidgetPreview(true);
                                }}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-all border border-slate-200"
                              >
                                <Globe className="w-4 h-4" />
                                ウィジェットで試す
                              </button>
                            </div>
                          </div>

                          {/* カラー選択 */}
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-medium text-slate-700 flex items-center gap-2">
                                <Palette className="w-4 h-4 text-blue-500" />
                                チャットカラー
                              </h4>
                              {updatingColor === agent.agentId && (
                                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                              )}
                            </div>
                            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                              {colorOptions.map((color) => (
                                <button
                                  key={color.value}
                                  onClick={() => handleColorChange(agent.agentId, company.companyId, color.value)}
                                  disabled={updatingColor === agent.agentId}
                                  className={`w-8 h-8 rounded-lg transition-all ${
                                    agent.themeColor === color.value
                                      ? "ring-2 ring-offset-2 scale-110"
                                      : ""
                                  } hover:scale-105 cursor-pointer ${
                                    updatingColor === agent.agentId ? "opacity-50" : ""
                                  } ${
                                    color.value === "#FFFFFF" ? "border border-slate-300" : ""
                                  }`}
                                  style={{
                                    backgroundColor: color.value,
                                    // @ts-expect-error - CSS custom property for Tailwind ring color
                                    "--tw-ring-color": color.value,
                                  }}
                                  title={color.name}
                                />
                              ))}
                            </div>
                          </div>

                          {/* ウィジェット位置 */}
                          <div>
                            <h4 className="font-medium text-slate-700 flex items-center gap-2 mb-3">
                              <MapPin className="w-4 h-4 text-blue-500" />
                              表示位置
                            </h4>
                            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                              {positionOptions.map((pos) => (
                                <button
                                  key={pos.value}
                                  onClick={() => handlePositionChange(agent.agentId, company.companyId, pos.value)}
                                  disabled={updatingColor === agent.agentId}
                                  className={`flex flex-col items-center justify-center px-2 py-2 sm:px-3 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                                    (agent.widgetPosition || "bottom-right") === pos.value
                                      ? "bg-blue-500 text-white shadow-md"
                                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                  } ${updatingColor === agent.agentId ? "opacity-50" : ""}`}
                                >
                                  <span className="text-base sm:text-lg mb-0.5">{pos.icon}</span>
                                  <span className="whitespace-nowrap">{pos.name}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* ウィジェットスタイル */}
                          <div>
                            <h4 className="font-medium text-slate-700 flex items-center gap-2 mb-3">
                              <MessageCircle className="w-4 h-4 text-blue-500" />
                              ウィジェットスタイル
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                              {/* バブルスタイル */}
                              <button
                                onClick={() => handleStyleChange(agent.agentId, company.companyId, "bubble")}
                                disabled={updatingColor === agent.agentId}
                                className={`relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                                  (agent.widgetStyle || "bubble") === "bubble"
                                    ? "border-blue-500 bg-blue-50"
                                    : "border-slate-200 bg-white hover:border-slate-300"
                                } ${updatingColor === agent.agentId ? "opacity-50" : ""}`}
                              >
                                {(agent.widgetStyle || "bubble") === "bubble" && (
                                  <div className="absolute top-2 right-2">
                                    <Check className="w-4 h-4 text-blue-500" />
                                  </div>
                                )}
                                <div
                                  className="w-12 h-12 rounded-full flex items-center justify-center shadow-lg mb-2"
                                  style={{ backgroundColor: agent.themeColor }}
                                >
                                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                  </svg>
                                </div>
                                <span className="font-medium text-slate-700">バブル</span>
                                <span className="text-xs text-slate-500">円形背景付き</span>
                              </button>

                              {/* アイコンスタイル */}
                              <button
                                onClick={() => handleStyleChange(agent.agentId, company.companyId, "icon")}
                                disabled={updatingColor === agent.agentId}
                                className={`relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                                  agent.widgetStyle === "icon"
                                    ? "border-blue-500 bg-blue-50"
                                    : "border-slate-200 bg-white hover:border-slate-300"
                                } ${updatingColor === agent.agentId ? "opacity-50" : ""}`}
                              >
                                {agent.widgetStyle === "icon" && (
                                  <div className="absolute top-2 right-2">
                                    <Check className="w-4 h-4 text-blue-500" />
                                  </div>
                                )}
                                {/* アイコンプレビュー（アバター画像） */}
                                <div className="w-12 h-12 rounded-full overflow-hidden shadow-md mb-2 border-2 border-white">
                                  <img
                                    src={agent.avatarUrl || "/agent-avatar.png"}
                                    alt="Avatar"
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <span className="font-medium text-slate-700">アイコン</span>
                                <span className="text-xs text-slate-500">アバター画像</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* チャットウィジェット（位置に応じて配置） */}
      {showWidget && createdAgent && (
        <div
          className={`fixed z-50 ${
            createdAgent.widgetPosition === "bottom-left"
              ? "bottom-6 left-6"
              : createdAgent.widgetPosition === "bottom-center"
              ? "bottom-6 left-1/2 -translate-x-1/2"
              : createdAgent.widgetPosition === "middle-left"
              ? "top-1/2 -translate-y-1/2 left-6"
              : createdAgent.widgetPosition === "middle-right"
              ? "top-1/2 -translate-y-1/2 right-6"
              : "bottom-6 right-6"
          }`}
        >
          {!chatWindowOpen ? (
            /* バブル表示（クリックでチャット開く） */
            <div className="relative">
              {/* ツールチップ */}
              <div
                className={`absolute bottom-full mb-3 whitespace-nowrap bg-white rounded-xl px-4 py-2 shadow-lg border border-slate-200 text-sm text-slate-700 ${
                  createdAgent.widgetPosition === "bottom-left" || createdAgent.widgetPosition === "middle-left"
                    ? "left-0"
                    : createdAgent.widgetPosition === "bottom-center"
                    ? "left-1/2 -translate-x-1/2"
                    : "right-0"
                }`}
              >
                <span>AIアシスタントが対応します</span>
                {/* 矢印 */}
                <div
                  className={`absolute top-full w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-white ${
                    createdAgent.widgetPosition === "bottom-left" || createdAgent.widgetPosition === "middle-left"
                      ? "left-5"
                      : createdAgent.widgetPosition === "bottom-center"
                      ? "left-1/2 -translate-x-1/2"
                      : "right-5"
                  }`}
                />
              </div>

              {/* 閉じるボタン */}
              <button
                onClick={() => setShowWidget(false)}
                className={`absolute -top-2 w-6 h-6 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-slate-100 transition-all z-10 border border-slate-200 ${
                  createdAgent.widgetPosition === "bottom-left" || createdAgent.widgetPosition === "middle-left"
                    ? "-left-2"
                    : "-right-2"
                }`}
              >
                <X className="w-3 h-3 text-slate-600" />
              </button>

              {/* バブル/アイコン */}
              <button
                onClick={() => setChatWindowOpen(true)}
                className="transition-transform hover:scale-110"
              >
                {createdAgent.widgetStyle === "icon" ? (
                  /* アイコンスタイル（動画またはアバター画像） */
                  <div className="w-14 h-14 rounded-full overflow-hidden shadow-lg border-2 border-white">
                    {createdAgent.iconVideoUrl ? (
                      <video
                        src={createdAgent.iconVideoUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={createdAgent.avatarUrl || "/agent-avatar.png"}
                        alt="AI Assistant"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                ) : (
                  /* バブルスタイル（デフォルト） */
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
                    style={{ backgroundColor: createdAgent.themeColor }}
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                  </div>
                )}
              </button>
            </div>
          ) : (
            /* チャットウィンドウ表示 */
            <div className="relative">
              {/* 閉じるボタン */}
              <button
                onClick={() => {
                  setChatWindowOpen(false);
                  setShowWidget(false);
                }}
                className={`absolute -top-2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-slate-100 transition-all z-10 border border-slate-200 ${
                  createdAgent.widgetPosition === "bottom-left" || createdAgent.widgetPosition === "middle-left"
                    ? "-left-2"
                    : "-right-2"
                }`}
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>

              {/* ウィジェットiframe */}
              <div
                className="rounded-2xl overflow-hidden shadow-2xl border-2"
                style={{ borderColor: createdAgent.themeColor }}
              >
                <iframe
                  key={`widget-${createdAgent.agentId}-${createdAgent.themeColor}`}
                  src={`/widget?companyId=${createdAgent.companyId}&agentName=${encodeURIComponent(createdAgent.agentName)}&themeColor=${encodeURIComponent(createdAgent.themeColor)}`}
                  width="380"
                  height="600"
                  className="bg-white max-h-[80vh]"
                  title="Chat Widget"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* プラン選択モーダル */}
      {showPlanModal && selectedCompanyForPlan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            {/* ヘッダー */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800">プランを選択</h2>
                <p className="text-sm text-slate-600 mt-1">
                  {selectedCompanyForPlan.name} の機能をアンロック
                </p>
              </div>
              <button
                onClick={() => setShowPlanModal(false)}
                className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-all"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            {/* 現在のエージェント状況 */}
            {maxPlanCount > 0 && (
              <div className="px-6 pt-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
                  <div className="flex items-center gap-2 text-amber-800">
                    <Zap className="w-4 h-4" />
                    <span className="font-medium">現在のMaxプラン:</span>
                    <span>{maxPlanCount}つ購入済み（最大{maxPlanCount * 5}エージェント）</span>
                  </div>
                </div>
              </div>
            )}

            {/* プラン一覧 */}
            <div className="p-6 grid md:grid-cols-3 gap-6">
              {/* Liteプラン */}
              <div className="rounded-2xl border-2 border-blue-200 p-6 hover:border-blue-400 transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{plans.lite.name}</h3>
                    <p className="text-2xl font-bold text-blue-600">
                      {plans.lite.price}
                      <span className="text-sm font-normal text-slate-500">{plans.lite.period}</span>
                    </p>
                  </div>
                </div>
                <ul className="space-y-2 mb-6">
                  {plans.lite.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                      <Check className="w-4 h-4 text-blue-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleSelectPlan("lite")}
                  disabled={processingPlan !== null || selectedCompanyForPlan.plan === "lite"}
                  className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #4F8CFF 0%, #3B82F6 100%)" }}
                >
                  {processingPlan === "lite" ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      処理中...
                    </>
                  ) : selectedCompanyForPlan.plan === "lite" ? (
                    <>
                      <Check className="w-5 h-5" />
                      現在のプラン
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      Liteプランを選択
                    </>
                  )}
                </button>
              </div>

              {/* Proプラン */}
              <div className="rounded-2xl border-2 border-purple-300 p-6 hover:border-purple-400 transition-all relative overflow-hidden">
                <div className="absolute top-4 right-4">
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                    おすすめ
                  </span>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{plans.pro.name}</h3>
                    <p className="text-2xl font-bold text-purple-600">
                      {plans.pro.price}
                      <span className="text-sm font-normal text-slate-500">{plans.pro.period}</span>
                    </p>
                  </div>
                </div>
                <ul className="space-y-2 mb-6">
                  {plans.pro.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                      <Check className="w-4 h-4 text-purple-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleSelectPlan("pro")}
                  disabled={processingPlan !== null || selectedCompanyForPlan.plan === "pro" || selectedCompanyForPlan.plan === "max"}
                  className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)" }}
                >
                  {processingPlan === "pro" ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      処理中...
                    </>
                  ) : (selectedCompanyForPlan.plan === "pro" || selectedCompanyForPlan.plan === "max") ? (
                    <>
                      <Check className="w-5 h-5" />
                      現在のプラン
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Proプランを選択
                    </>
                  )}
                </button>
              </div>

              {/* Maxプラン */}
              <div className="rounded-2xl border-2 border-amber-300 p-6 hover:border-amber-400 transition-all relative overflow-hidden bg-gradient-to-br from-amber-50 to-orange-50">
                <div className="absolute top-4 right-4">
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-amber-400 to-orange-500 text-white">
                    最上位
                  </span>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 flex items-center justify-center">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{plans.max.name}</h3>
                    <p className="text-2xl font-bold text-amber-600">
                      {plans.max.price}
                      <span className="text-sm font-normal text-slate-500">{plans.max.period}</span>
                    </p>
                  </div>
                </div>
                <ul className="space-y-2 mb-6">
                  {plans.max.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                      <Check className="w-4 h-4 text-amber-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleSelectPlan("max")}
                  disabled={processingPlan !== null}
                  className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #F59E0B 0%, #EA580C 100%)" }}
                >
                  {processingPlan === "max" ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      処理中...
                    </>
                  ) : maxPlanCount > 0 ? (
                    <>
                      <Plus className="w-5 h-5" />
                      追加購入 (+5エージェント)
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      Maxプランを選択
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 機能比較 */}
            <div className="p-6 bg-slate-50 border-t border-slate-100">
              <h4 className="font-semibold text-slate-800 mb-4">Pro/Maxプランの追加機能</h4>
              <div className="grid md:grid-cols-4 gap-4">
                <div className="flex items-center gap-3 text-sm text-slate-700">
                  <Users className="w-5 h-5 text-purple-500" />
                  <span>会話履歴トラッキング</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-700">
                  <MapPin className="w-5 h-5 text-purple-500" />
                  <span>位置情報分析</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-700">
                  <Smartphone className="w-5 h-5 text-purple-500" />
                  <span>端末情報分析</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-700">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <span>複数エージェント (Maxのみ)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* カスタムナレッジ追加・編集モーダル */}
      {showKnowledgeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* ヘッダー */}
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Database className="w-5 h-5 text-purple-500" />
                  {editingKnowledge ? "ナレッジを編集" : "ナレッジを追加"}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  AIが回答に使用する情報を追加
                </p>
              </div>
              <button
                onClick={() => {
                  setShowKnowledgeModal(false);
                  setEditingKnowledge(null);
                  setKnowledgeTitle("");
                  setKnowledgeContent("");
                }}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-all"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />
              </button>
            </div>

            {/* コンテンツ */}
            <div className="p-4 sm:p-6 space-y-4">
              {/* ファイルアップロード（新規追加時のみ） */}
              {!editingKnowledge && (
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-100">
                  <label className="block text-sm font-medium text-purple-700 mb-3 flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    ファイルからインポート
                  </label>
                  <div className="flex items-center gap-3">
                    <label className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 border-dashed border-purple-300 bg-white cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition-all ${uploadingFile ? "opacity-50 cursor-not-allowed" : ""}`}>
                      <input
                        type="file"
                        accept=".pdf,.docx,.txt,.md"
                        onChange={handleFileUpload}
                        disabled={uploadingFile}
                        className="hidden"
                      />
                      {uploadingFile ? (
                        <>
                          <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
                          <span className="text-sm text-purple-600">読み込み中...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-5 h-5 text-purple-500" />
                          <span className="text-sm text-purple-600">PDF / Word / テキストファイルを選択</span>
                        </>
                      )}
                    </label>
                  </div>
                  <p className="text-xs text-purple-500 mt-2">
                    対応形式: PDF, DOCX, TXT, MD（最大20MB）
                  </p>
                </div>
              )}

              {/* 区切り線（新規追加時のみ） */}
              {!editingKnowledge && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-slate-200"></div>
                  <span className="text-xs text-slate-400">または手動で入力</span>
                  <div className="flex-1 border-t border-slate-200"></div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  タイトル
                </label>
                <input
                  type="text"
                  value={knowledgeTitle}
                  onChange={(e) => setKnowledgeTitle(e.target.value)}
                  placeholder="例: 営業時間について"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  内容（最大3000文字）
                </label>
                <textarea
                  value={knowledgeContent}
                  onChange={(e) => setKnowledgeContent(e.target.value)}
                  placeholder="例: 当店の営業時間は平日9:00-18:00、土日祝日は10:00-17:00です。年末年始（12/31-1/3）は休業となります。"
                  rows={8}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-y min-h-[150px] focus:outline-none focus:ring-2 focus:ring-purple-300"
                />
                <p className={`text-xs mt-1 ${knowledgeContent.length > 3000 ? "text-red-500" : "text-slate-400"}`}>
                  {knowledgeContent.length} / 3000文字
                </p>
              </div>
            </div>

            {/* フッター */}
            <div className="p-4 sm:p-6 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => {
                  setShowKnowledgeModal(false);
                  setEditingKnowledge(null);
                  setKnowledgeTitle("");
                  setKnowledgeContent("");
                }}
                className="flex-1 py-3 rounded-xl font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveKnowledge}
                disabled={savingKnowledge || !knowledgeTitle.trim() || !knowledgeContent.trim() || knowledgeContent.length > 3000}
                className="flex-1 py-3 rounded-xl font-medium text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)" }}
              >
                {savingKnowledge ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {editingKnowledge ? "更新" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* プロンプト設定モーダル */}
      {showPromptModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto">
            {/* ヘッダー */}
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-500" />
                  プロンプト設定
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  GPTsのようにAIの振る舞いをカスタマイズ
                </p>
              </div>
              <button
                onClick={() => setShowPromptModal(false)}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-all"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />
              </button>
            </div>

            {/* コンテンツ */}
            {loadingPrompt ? (
              <div className="p-8 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : (
              <div className="p-4 sm:p-6 space-y-6">
                {/* 役割定義 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    役割定義（System Prompt）
                  </label>
                  <textarea
                    value={promptSettings.systemPrompt}
                    onChange={(e) => setPromptSettings(prev => ({ ...prev, systemPrompt: e.target.value }))}
                    placeholder="例: あなたはプロの採用担当者です。弊社のキャリア情報をユーザーに的確に導けるように指導してください。"
                    rows={6}
                    disabled={promptCompanyPlan !== "pro" && promptCompanyPlan !== "max"}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-y min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    AIの基本的な役割や人格を定義します
                  </p>
                </div>

                {/* ナレッジ */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    ナレッジ（会社固有の情報）
                  </label>
                  <textarea
                    value={promptSettings.knowledge}
                    onChange={(e) => setPromptSettings(prev => ({ ...prev, knowledge: e.target.value }))}
                    placeholder="例: 弊社は2010年設立のIT企業です。主力サービスはクラウド会計ソフト「○○」で、中小企業向けに提供しています。営業時間は平日9:00-18:00です。"
                    rows={10}
                    disabled={promptCompanyPlan !== "pro" && promptCompanyPlan !== "max"}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-y min-h-[200px] focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    会社概要、サービス説明、よくある質問への回答など（常にAIに参照される情報）
                  </p>
                </div>

                {/* 会話スタイル */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    会話スタイル
                  </label>
                  <textarea
                    value={promptSettings.style}
                    onChange={(e) => setPromptSettings(prev => ({ ...prev, style: e.target.value }))}
                    placeholder="例: 丁寧で親しみやすいトーンで話してください。専門用語は避け、わかりやすく説明してください。"
                    rows={6}
                    disabled={promptCompanyPlan !== "pro" && promptCompanyPlan !== "max"}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-y min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    トーン、話し方、フォーマットなど
                  </p>
                </div>

                {/* NG回答 */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    NG回答（絶対に回答してはいけない内容）
                  </label>
                  <textarea
                    value={promptSettings.ngResponses}
                    onChange={(e) => setPromptSettings(prev => ({ ...prev, ngResponses: e.target.value }))}
                    placeholder="例:
- 競合他社の○○社についての質問には回答しない
- 価格交渉や値引きの約束はしない
- 個人の連絡先を聞かれても教えない
- 社内の機密情報（売上、人事など）は開示しない"
                    rows={6}
                    disabled={promptCompanyPlan !== "pro" && promptCompanyPlan !== "max"}
                    className="w-full border border-red-100 rounded-xl px-4 py-3 text-sm resize-y min-h-[120px] focus:outline-none focus:ring-2 focus:ring-red-300 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    AIが絶対に回答してはいけないトピックや内容を指定します
                  </p>
                </div>

                {/* ガードレール（読み取り専用） */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-500" />
                    制約条件（編集不可）
                  </label>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 whitespace-pre-line">
                    {promptSettings.guardrails}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    安全性のため、この制約は自動的に適用されます
                  </p>
                </div>

                {/* Pro/Max限定の案内 */}
                {promptCompanyPlan !== "pro" && promptCompanyPlan !== "max" && (
                  <div className="bg-purple-50 rounded-xl p-4 flex items-start gap-3">
                    <Lock className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-purple-800">
                        プロンプト設定はPro/Maxプラン限定機能です
                      </p>
                      <p className="text-xs text-purple-600 mt-1">
                        Pro/Maxプランにアップグレードすると、AIの振る舞いを自由にカスタマイズできます
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* フッター */}
            <div className="p-4 sm:p-6 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setShowPromptModal(false)}
                className="flex-1 py-3 rounded-xl font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                キャンセル
              </button>
              <button
                onClick={handleSavePromptSettings}
                disabled={savingPrompt || (promptCompanyPlan !== "pro" && promptCompanyPlan !== "max")}
                className="flex-1 py-3 rounded-xl font-medium text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)" }}
              >
                {savingPrompt ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 共有モーダル */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            {/* ヘッダー */}
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-blue-500" />
                  エージェントを共有
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  他のユーザーと共同編集できます
                </p>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-all"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />
              </button>
            </div>

            {/* メール入力 */}
            <div className="p-4 sm:p-6 border-b border-slate-100">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                メールアドレスで招待
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    placeholder="example@email.com"
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleShareAgent();
                      }
                    }}
                  />
                </div>
                <button
                  onClick={handleShareAgent}
                  disabled={sharingAgent || !shareEmail}
                  className="px-4 py-2.5 rounded-xl font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                >
                  {sharingAgent ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
              {shareError && (
                <p className="text-sm text-red-600 mt-2">{shareError}</p>
              )}
              {shareSuccess && (
                <p className="text-sm text-green-600 mt-2">{shareSuccess}</p>
              )}
            </div>

            {/* 共有ユーザー一覧 */}
            <div className="p-4 sm:p-6">
              <h3 className="text-sm font-medium text-slate-700 mb-3">
                共有中のユーザー
              </h3>
              {loadingSharedUsers ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                </div>
              ) : sharedUsers.length === 0 && pendingInvitations.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">
                  <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  まだ共有されていません
                </div>
              ) : (
                <div className="space-y-2">
                  {sharedUsers.map((user) => (
                    <div
                      key={user.email}
                      className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <span className="text-sm font-medium text-blue-600">
                            {user.email.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-700">
                            {user.email}
                          </p>
                          <p className="text-xs text-slate-500">
                            {user.role === "editor" ? "編集可能" : "閲覧のみ"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveShare(user.email)}
                        className="text-slate-400 hover:text-red-500 transition-all"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {pendingInvitations.map((inv) => (
                    <div
                      key={inv.email}
                      className="bg-amber-50 rounded-xl px-4 py-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                            <Mail className="w-4 h-4 text-amber-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-700">
                              {inv.email}
                            </p>
                            <p className="text-xs text-amber-600">
                              招待中（未登録ユーザー）
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveShare(inv.email)}
                          className="text-slate-400 hover:text-red-500 transition-all"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {/* 招待リンク */}
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={`${typeof window !== 'undefined' ? window.location.origin : ''}/signup?invitation=${inv.invitationId}`}
                          className="flex-1 text-xs bg-white border border-amber-200 rounded-lg px-2 py-1.5 text-slate-600"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/signup?invitation=${inv.invitationId}`);
                            setShareSuccess("招待リンクをコピーしました");
                            setTimeout(() => setShareSuccess(""), 3000);
                          }}
                          className="px-2 py-1.5 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-all"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* フッター */}
            <div className="p-4 sm:p-6 border-t border-slate-100">
              <button
                onClick={() => setShowShareModal(false)}
                className="w-full py-3 rounded-xl font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 埋め込みコードヘルプモーダル */}
      {showEmbedHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* ヘッダー */}
            <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-rose-500" />
                  埋め込みコードの設置方法
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-1">
                  サイトにチャットボットを追加する手順
                </p>
              </div>
              <button
                onClick={() => setShowEmbedHelp(false)}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-all"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />
              </button>
            </div>

            {/* コンテンツ */}
            <div className="p-4 sm:p-6 space-y-6">
              {/* ステップ1 */}
              <div className="flex gap-3 sm:gap-4">
                <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 font-bold text-sm">
                  1
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm sm:text-base">埋め込みコードをコピー</h3>
                  <p className="text-slate-600 text-xs sm:text-sm mt-1">
                    ダッシュボードの「埋め込みコード」セクションにある「コードをコピー」ボタンをクリックします。
                  </p>
                </div>
              </div>

              {/* ステップ2 */}
              <div className="flex gap-3 sm:gap-4">
                <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 font-bold text-sm">
                  2
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm sm:text-base">HTMLファイルを開く</h3>
                  <p className="text-slate-600 text-xs sm:text-sm mt-1">
                    サイトのHTMLファイル（通常は <code className="bg-slate-100 px-1.5 py-0.5 rounded text-rose-600">index.html</code> など）をテキストエディタで開きます。
                  </p>
                </div>
              </div>

              {/* ステップ3 */}
              <div className="flex gap-3 sm:gap-4">
                <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 font-bold text-sm">
                  3
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm sm:text-base">コードを貼り付け</h3>
                  <p className="text-slate-600 text-xs sm:text-sm mt-1">
                    コピーした埋め込みコードを <code className="bg-slate-100 px-1.5 py-0.5 rounded text-rose-600">&lt;/body&gt;</code> タグの直前に貼り付けます。
                  </p>
                  <div className="mt-3 bg-slate-900 rounded-xl p-3 sm:p-4 text-xs overflow-x-auto">
                    <pre className="text-slate-300">
{`<html>
<head>...</head>
<body>
  <!-- サイトのコンテンツ -->

  `}<span className="text-green-400">{`<!-- ここに埋め込みコードを貼り付け -->`}</span>{`
  `}<span className="text-yellow-300">{`<script src="..." defer></script>`}</span>{`
</body>
</html>`}
                    </pre>
                  </div>
                </div>
              </div>

              {/* ステップ4 */}
              <div className="flex gap-3 sm:gap-4">
                <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 font-bold text-sm">
                  4
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 text-sm sm:text-base">保存してアップロード</h3>
                  <p className="text-slate-600 text-xs sm:text-sm mt-1">
                    ファイルを保存し、サーバーにアップロードします。サイトを開くと右下にチャットボタンが表示されます。
                  </p>
                </div>
              </div>

              {/* CMSの場合 */}
              <div className="bg-blue-50 rounded-xl p-3 sm:p-4 border border-blue-100">
                <h4 className="font-semibold text-blue-800 text-sm flex items-center gap-2 mb-2">
                  <Globe className="w-4 h-4" />
                  WordPress・Wix・STUDIOなどのCMSの場合
                </h4>
                <p className="text-blue-700 text-xs sm:text-sm">
                  管理画面の「カスタムHTML」や「スクリプト設定」などから、フッター部分にコードを追加できます。
                  各CMSのドキュメントで「カスタムスクリプト」の追加方法を確認してください。
                </p>
              </div>

              {/* 注意事項 */}
              <div className="bg-amber-50 rounded-xl p-3 sm:p-4 border border-amber-100">
                <h4 className="font-semibold text-amber-800 text-sm mb-2">ご注意</h4>
                <ul className="text-amber-700 text-xs sm:text-sm space-y-1">
                  <li>• コードは各ページに1回だけ設置してください</li>
                  <li>• 設置後、変更が反映されるまで数分かかる場合があります</li>
                  <li>• ご不明な点があれば、サポートまでお問い合わせください</li>
                </ul>
              </div>
            </div>

            {/* フッター */}
            <div className="p-4 sm:p-6 border-t border-slate-100">
              <button
                onClick={() => setShowEmbedHelp(false)}
                className="w-full py-3 rounded-xl font-semibold text-white transition-all"
                style={{ background: "linear-gradient(135deg, #D86672 0%, #D86672 100%)" }}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ウィジェットプレビューモーダル */}
      {showWidgetPreview && previewAgent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          {/* 背景 - サンプルサイト風 */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-100 to-slate-200">
            <div className="h-full flex flex-col">
              {/* ダミーヘッダー */}
              <div className="bg-white shadow-sm px-8 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded bg-slate-300" />
                  <div className="w-24 h-4 bg-slate-300 rounded" />
                </div>
                <div className="flex gap-6">
                  <div className="w-16 h-4 bg-slate-200 rounded" />
                  <div className="w-16 h-4 bg-slate-200 rounded" />
                  <div className="w-16 h-4 bg-slate-200 rounded" />
                </div>
              </div>

              {/* ダミーコンテンツ */}
              <div className="flex-1 p-8">
                <div className="max-w-4xl mx-auto">
                  <div className="w-48 h-8 bg-slate-300 rounded mb-4" />
                  <div className="w-full h-4 bg-slate-200 rounded mb-2" />
                  <div className="w-3/4 h-4 bg-slate-200 rounded mb-2" />
                  <div className="w-5/6 h-4 bg-slate-200 rounded mb-8" />

                  <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="bg-white rounded-lg p-4 shadow-sm">
                      <div className="w-12 h-12 rounded bg-slate-200 mb-3" />
                      <div className="w-20 h-4 bg-slate-200 rounded mb-2" />
                      <div className="w-full h-3 bg-slate-100 rounded" />
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm">
                      <div className="w-12 h-12 rounded bg-slate-200 mb-3" />
                      <div className="w-20 h-4 bg-slate-200 rounded mb-2" />
                      <div className="w-full h-3 bg-slate-100 rounded" />
                    </div>
                    <div className="bg-white rounded-lg p-4 shadow-sm">
                      <div className="w-12 h-12 rounded bg-slate-200 mb-3" />
                      <div className="w-20 h-4 bg-slate-200 rounded mb-2" />
                      <div className="w-full h-3 bg-slate-100 rounded" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 閉じるボタン */}
          <button
            onClick={() => setShowWidgetPreview(false)}
            className="absolute top-4 right-4 z-[110] w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-slate-100 transition-all"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>

          {/* 説明バナー */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[110] bg-white/90 backdrop-blur-sm rounded-full px-6 py-2 shadow-lg">
            <p className="text-sm text-slate-700">
              <span className="font-medium">ウィジェットプレビュー</span> - 実際のサイトでの表示イメージです
            </p>
          </div>

          {/* ウィジェットボタン */}
          <button
            onClick={() => {
              const wrapper = document.getElementById("widget-preview-wrapper");
              if (wrapper) {
                wrapper.style.display = wrapper.style.display === "none" ? "block" : "none";
              }
            }}
            className="fixed z-[105] rounded-full px-4 py-2.5 text-white text-sm font-medium shadow-lg hover:scale-105 transition-all"
            style={{
              backgroundColor: previewAgent.themeColor,
              ...(previewAgent.widgetPosition === "bottom-left"
                ? { left: "16px", bottom: "16px" }
                : previewAgent.widgetPosition === "bottom-center"
                ? { left: "50%", bottom: "16px", transform: "translateX(-50%)" }
                : { right: "16px", bottom: "16px" }),
            }}
          >
            AI相談
          </button>

          {/* ウィジェット iframe */}
          <div
            id="widget-preview-wrapper"
            className="fixed z-[104] shadow-2xl rounded-2xl overflow-hidden"
            style={{
              width: "360px",
              height: "520px",
              maxWidth: "95vw",
              maxHeight: "80vh",
              bottom: "70px",
              ...(previewAgent.widgetPosition === "bottom-left"
                ? { left: "16px" }
                : previewAgent.widgetPosition === "bottom-center"
                ? { left: "50%", transform: "translateX(-50%)" }
                : { right: "16px" }),
            }}
          >
            <iframe
              src={`/widget?companyId=${previewAgent.companyId}&agentName=${encodeURIComponent(previewAgent.agentName)}&themeColor=${encodeURIComponent(previewAgent.themeColor)}`}
              className="w-full h-full border-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Loading component
function DashboardLoading() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-rose-500 mx-auto mb-4" />
        <p className="text-slate-600">読み込み中...</p>
      </div>
    </div>
  );
}

// Default export with Suspense wrapper
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent />
    </Suspense>
  );
}
