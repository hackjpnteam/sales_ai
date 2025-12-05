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
} from "lucide-react";
import Link from "next/link";

const SUPER_ADMIN_EMAILS = ["tomura@hackjpn.com"];

type Agent = {
  agentId: string;
  companyId: string;
  name: string;
  welcomeMessage: string;
  voiceEnabled: boolean;
  themeColor: string;
  avatarUrl?: string;
  widgetPosition?: "bottom-right" | "bottom-left" | "bottom-center";
  // プロンプト設定（Pro機能）
  systemPrompt?: string;
  knowledge?: string;
  style?: string;
  createdAt: Date;
};

type PromptSettings = {
  systemPrompt: string;
  knowledge: string;
  style: string;
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
  plan?: "free" | "lite" | "pro";
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
];

// 位置オプション
const positionOptions = [
  { name: "右下", value: "bottom-right" },
  { name: "左下", value: "bottom-left" },
  { name: "中央下", value: "bottom-center" },
] as const;

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
};

function DashboardContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [paymentVerified, setPaymentVerified] = useState(false);

  // 新規作成フォーム
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [rootUrl, setRootUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [progress, setProgress] = useState<ProgressEvent | null>(null);

  // 作成完了後のウィジェット表示
  const [showWidget, setShowWidget] = useState(false);
  const [createdAgent, setCreatedAgent] = useState<{
    companyId: string;
    agentId: string;
    agentName: string;
    themeColor: string;
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
  const [editWelcomeMessage, setEditWelcomeMessage] = useState("");
  const [editVoiceEnabled, setEditVoiceEnabled] = useState(true);
  const [editAvatarUrl, setEditAvatarUrl] = useState("/agent-avatar.png");
  const [savingSettings, setSavingSettings] = useState(false);

  // アバター管理
  const [uploadedAvatars, setUploadedAvatars] = useState<UploadedAvatar[]>([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [loadingAvatars, setLoadingAvatars] = useState(false);

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

  // プロンプト設定（Pro機能）
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [promptAgentId, setPromptAgentId] = useState<string>("");
  const [promptCompanyPlan, setPromptCompanyPlan] = useState<string>("");
  const [promptSettings, setPromptSettings] = useState<PromptSettings>({
    systemPrompt: "",
    knowledge: "",
    style: "",
    guardrails: "",
  });
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [loadingPrompt, setLoadingPrompt] = useState(false);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await fetch("/api/user/companies");
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
        // 最初の会社を展開
        if (data.companies?.length > 0) {
          setExpandedCompany(data.companies[0].companyId);
        }
      }
    } catch (error) {
      console.error("Failed to fetch companies:", error);
    } finally {
      setLoading(false);
    }
  }, []);

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
        await fetchCompanies();
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
        }),
      });

      if (res.ok) {
        setShowPromptModal(false);
        alert("プロンプト設定を保存しました");
      } else {
        const data = await res.json();
        if (data.code === "PRO_REQUIRED") {
          alert("この機能はProプラン限定です。アップグレードしてください。");
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
        await fetchCompanies();
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
  const handleSelectPlan = async (plan: "lite" | "pro") => {
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
  const handlePositionChange = async (agentId: string, companyId: string, newPosition: "bottom-right" | "bottom-left" | "bottom-center") => {
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
    setEditWelcomeMessage(agent.welcomeMessage || "いらっしゃいませ。ご質問があれば何でもお聞きください。");
    setEditVoiceEnabled(agent.voiceEnabled !== false);
    setEditAvatarUrl(agent.avatarUrl || "/agent-avatar.png");
    // アバター一覧を取得
    await fetchAvatars(agent.agentId);
  };

  // エージェント設定を保存
  const saveAgentSettings = async (agentId: string, companyId: string) => {
    setSavingSettings(true);

    try {
      const res = await fetch("/api/agents/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          welcomeMessage: editWelcomeMessage,
          voiceEnabled: editVoiceEnabled,
          avatarUrl: editAvatarUrl,
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
                      ? {
                          ...agent,
                          welcomeMessage: editWelcomeMessage,
                          voiceEnabled: editVoiceEnabled,
                          avatarUrl: editAvatarUrl,
                        }
                      : agent
                  ),
                }
              : company
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

  const getEmbedCode = (company: Company, agent: Agent) => {
    const widgetBaseUrl = typeof window !== "undefined"
      ? window.location.origin + "/widget"
      : "http://localhost:4000/widget";

    const position = agent.widgetPosition || "bottom-right";

    return `<script
  src="${typeof window !== "undefined" ? window.location.origin : "http://localhost:4000"}/widget.js"
  data-company-id="${company.companyId}"
  data-agent-name="${agent.name}"
  data-theme-color="${agent.themeColor}"
  data-widget-position="${position}"
  data-widget-base-url="${widgetBaseUrl}"
  defer
></script>`;
  };

  const handleCopy = (companyId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(companyId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getPlanBadge = (plan?: string) => {
    switch (plan) {
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

      {/* 新規作成ボタン */}
      <div className="mb-4 sm:mb-6">
        {!showCreateForm ? (
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold text-white shadow-lg hover:shadow-xl transition-all text-sm sm:text-base"
            style={{ background: "linear-gradient(135deg, #D86672 0%, #D86672 100%)" }}
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            新しいエージェントを作成
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
            const isPaid = company.plan === "lite" || company.plan === "pro";

            return (
              <div
                key={company.companyId}
                className="bg-white rounded-2xl shadow-lg border border-rose-100 overflow-hidden"
              >
                {/* ヘッダー */}
                <button
                  onClick={() => setExpandedCompany(isExpanded ? null : company.companyId)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: agent?.themeColor + "20" }}
                    >
                      <Globe className="w-6 h-6" style={{ color: agent?.themeColor }} />
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-slate-800">{company.name}</h3>
                      <p className="text-sm text-slate-500">{company.rootUrl}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getPlanBadge(company.plan)}
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                </button>

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

                          {/* 音声モード */}
                          <div className="flex items-center justify-between">
                            <label className="text-sm text-slate-600 flex items-center gap-2">
                              {editVoiceEnabled ? (
                                <Volume2 className="w-4 h-4 text-rose-500" />
                              ) : (
                                <VolumeX className="w-4 h-4 text-slate-400" />
                              )}
                              音声モード
                            </label>
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
                      <div className="flex gap-2">
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

                    {/* ウィジェット位置 - Pro会員のみ */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="font-medium text-slate-700 flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-rose-500" />
                          表示位置
                        </h4>
                        {company.plan !== "pro" ? (
                          <span className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                            <Lock className="w-3 h-3" />
                            Pro
                          </span>
                        ) : (
                          <span className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                            Pro
                          </span>
                        )}
                      </div>
                      {company.plan === "pro" ? (
                        <div className="flex gap-2">
                          {positionOptions.map((pos) => (
                            <button
                              key={pos.value}
                              onClick={() => handlePositionChange(agent.agentId, company.companyId, pos.value)}
                              disabled={updatingColor === agent.agentId}
                              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                (agent.widgetPosition || "bottom-right") === pos.value
                                  ? "bg-purple-500 text-white shadow-md"
                                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                              } ${updatingColor === agent.agentId ? "opacity-50" : ""}`}
                            >
                              {pos.name}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-slate-100 rounded-xl p-4 text-center">
                          <Lock className="w-5 h-5 text-slate-400 mx-auto mb-2" />
                          <p className="text-sm text-slate-600">
                            Proプランで表示位置を変更できます
                          </p>
                        </div>
                      )}
                    </div>

                    {/* ウェルカムメッセージ編集 */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="font-medium text-slate-700 flex items-center gap-2">
                          <MessageCircle className="w-4 h-4 text-rose-500" />
                          ウェルカムメッセージ
                        </h4>
                      </div>
                      {editingAgent === agent.agentId ? (
                        <div className="space-y-3">
                          <textarea
                            value={editWelcomeMessage}
                            onChange={(e) => setEditWelcomeMessage(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-rose-300"
                            rows={3}
                            placeholder="チャット開始時に表示するメッセージを入力..."
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveWelcomeMessage(agent.agentId)}
                              disabled={savingSettings}
                              className="px-4 py-2 rounded-xl text-sm font-medium text-white flex items-center gap-2 disabled:opacity-50"
                              style={{ background: "linear-gradient(135deg, #10B981 0%, #059669 100%)" }}
                            >
                              {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                              保存
                            </button>
                            <button
                              onClick={() => setEditingAgent(null)}
                              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50 rounded-xl p-4">
                          <p className="text-sm text-slate-700 mb-3">{agent.welcomeMessage}</p>
                          <button
                            onClick={() => {
                              setEditingAgent(agent.agentId);
                              setEditWelcomeMessage(agent.welcomeMessage);
                              setEditVoiceEnabled(agent.voiceEnabled);
                              setEditAvatarUrl(agent.avatarUrl || "/agent-avatar.png");
                            }}
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
                            {company.plan === "pro" ? "Pro" : <>
                              <Lock className="w-3 h-3" />
                              Pro
                            </>}
                          </span>
                        </h4>
                        {company.plan === "pro" && (
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
                      {company.plan === "pro" ? (
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
                          {/* カスタムナレッジを読み込み */}
                          {!customKnowledges[company.companyId] && (
                            <button
                              onClick={() => fetchCustomKnowledge(company.companyId)}
                              className="w-full py-2 text-sm text-purple-600 hover:text-purple-700"
                            >
                              ナレッジを読み込む
                            </button>
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
                            {company.plan === "pro" ? "Pro" : <>
                              <Lock className="w-3 h-3" />
                              Pro
                            </>}
                          </span>
                        </h4>
                        {company.plan === "pro" && agent && (
                          <button
                            onClick={() => openPromptModal(agent.agentId, company.plan || "free")}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 transition-all"
                          >
                            <Edit3 className="w-3 h-3" />
                            編集
                          </button>
                        )}
                      </div>
                      {company.plan === "pro" ? (
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
                            {getEmbedCode(company, agent)}
                          </pre>
                          <button
                            onClick={() => handleCopy(company.companyId, getEmbedCode(company, agent))}
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

                    {/* プレビュー */}
                    <div>
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
                            });
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
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all"
                        >
                          <Globe className="w-4 h-4" />
                          ウィジェットで試す
                        </button>
                      </div>
                    </div>

                    {/* Proプラン: 分析 */}
                    {company.plan === "pro" && (
                      <div>
                        <h4 className="font-medium text-slate-700 flex items-center gap-2 mb-3">
                          <BarChart3 className="w-4 h-4 text-rose-500" />
                          分析ダッシュボード
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                            PRO
                          </span>
                        </h4>
                        <a
                          href={`/admin/agents/${agent.agentId}`}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 transition-all"
                        >
                          詳細分析を見る
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    )}

                    {/* プランアップグレードボタン（有料だけどProではない場合） */}
                    {company.plan === "lite" && (
                      <div className="pt-4 border-t border-slate-100">
                        <button
                          onClick={() => {
                            setSelectedCompanyForPlan(company);
                            setShowPlanModal(true);
                          }}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-purple-700 bg-purple-100 hover:bg-purple-200 transition-all"
                        >
                          <Sparkles className="w-4 h-4" />
                          Proプランにアップグレード
                        </button>
                      </div>
                    )}

                    {/* エージェント削除 */}
                    <div className="pt-4 border-t border-slate-100">
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
                            エージェントを削除
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 右下のチャットウィジェット */}
      {showWidget && createdAgent && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="relative">
            {/* 閉じるボタン */}
            <button
              onClick={() => setShowWidget(false)}
              className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-slate-100 transition-all z-10 border border-slate-200"
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
                className="bg-white"
                title="Chat Widget"
              />
            </div>
          </div>
        </div>
      )}

      {/* プラン選択モーダル */}
      {showPlanModal && selectedCompanyForPlan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
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

            {/* プラン一覧 */}
            <div className="p-6 grid md:grid-cols-2 gap-6">
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
                  disabled={processingPlan !== null || selectedCompanyForPlan.plan === "pro"}
                  className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)" }}
                >
                  {processingPlan === "pro" ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      処理中...
                    </>
                  ) : selectedCompanyForPlan.plan === "pro" ? (
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
            </div>

            {/* 機能比較 */}
            <div className="p-6 bg-slate-50 border-t border-slate-100">
              <h4 className="font-semibold text-slate-800 mb-4">Proプランの追加機能</h4>
              <div className="grid md:grid-cols-3 gap-4">
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
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-300"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
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
                    rows={4}
                    disabled={promptCompanyPlan !== "pro"}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-100 disabled:cursor-not-allowed"
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
                    rows={5}
                    disabled={promptCompanyPlan !== "pro"}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    会社概要、サービス説明、よくある質問への回答など
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
                    rows={3}
                    disabled={promptCompanyPlan !== "pro"}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-100 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    トーン、話し方、フォーマットなど
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

                {/* Pro限定の案内 */}
                {promptCompanyPlan !== "pro" && (
                  <div className="bg-purple-50 rounded-xl p-4 flex items-start gap-3">
                    <Lock className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-purple-800">
                        プロンプト設定はProプラン限定機能です
                      </p>
                      <p className="text-xs text-purple-600 mt-1">
                        Proプランにアップグレードすると、AIの振る舞いを自由にカスタマイズできます
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
                disabled={savingPrompt || promptCompanyPlan !== "pro"}
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
