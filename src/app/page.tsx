"use client";

import { useState, useEffect } from "react";
import { Sparkles, Globe, Zap, ArrowRight, Copy, ExternalLink, MessageCircle, X, Lock, CreditCard, Palette, Check, BarChart3, Users, Smartphone, MapPin, MessageSquare, LogIn, UserPlus, Bot, Clock, Shield, TrendingUp, Building2, ShoppingCart, Briefcase, GraduationCap, Heart, Headphones, ChevronRight, BadgePercent, Rocket, FileText } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import type { PlanType } from "@/lib/stripe";

// Color scheme
const colors = {
  primary: "#D86672",      // メインレッド
  background: "#F1E8F0",   // ライトピンクグレー
  text: "#2B2B2B",         // テキスト黒
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

// デモ用のCompany ID（hackjpn.com）
const DEMO_COMPANY_ID = "30ac1882-0497-4ce3-8774-d359d779e36b";

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
};

export default function Home() {
  const { data: session, status } = useSession();
  const [rootUrl, setRootUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [result, setResult] = useState<{
    companyId: string;
    agentId: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [widgetKey, setWidgetKey] = useState(0);

  // Plan features
  const [currentPlan, setCurrentPlan] = useState<PlanType>("free");
  const [checkingPlan, setCheckingPlan] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<"lite" | "pro">("lite");
  const [expandedPlan, setExpandedPlan] = useState<"lite" | "pro" | null>(null);
  const [selectedColor, setSelectedColor] = useState(colorOptions[0].value);
  const [email, setEmail] = useState("");
  const [trackingData, setTrackingData] = useState<{
    stats: {
      totalSessions: number;
      totalConversations: number;
      deviceDistribution: Record<string, number>;
      ageDistribution: Record<string, number>;
      locationDistribution: Record<string, number>;
    } | null;
  }>({ stats: null });

  // Check plan status when result is available
  useEffect(() => {
    const checkPlanStatus = async () => {
      if (result?.companyId) {
        setCheckingPlan(true);
        try {
          const res = await fetch(`/api/subscription/status?companyId=${result.companyId}`);
          const data = await res.json();
          setCurrentPlan(data.plan || "free");

          // Proプランの場合はトラッキングデータも取得
          if (data.plan === "pro") {
            const trackingRes = await fetch(`/api/tracking?companyId=${result.companyId}&limit=100`);
            if (trackingRes.ok) {
              const trackingJson = await trackingRes.json();
              setTrackingData({ stats: trackingJson.stats });
            }
          }
        } catch {
          console.error("Failed to check plan status");
        } finally {
          setCheckingPlan(false);
        }
      }
    };
    checkPlanStatus();
  }, [result?.companyId]);

  // Check for success query param
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("success") === "true") {
        const companyId = params.get("companyId");
        const plan = params.get("plan") as PlanType;
        if (companyId) {
          setResult({ companyId, agentId: "" });
          setCurrentPlan(plan || "lite");
          // Clean URL
          window.history.replaceState({}, "", "/");
        }
      }
    }
  }, []);

  // resultが変わったらwidgetを強制リロード
  useEffect(() => {
    if (result) {
      setWidgetKey((prev) => prev + 1);
      // 自動的にウィジェットを開く
      setWidgetOpen(true);
    }
  }, [result]);

  const getCompanyNameFromUrl = (url: string): string => {
    try {
      let normalizedUrl = url.trim();
      if (!normalizedUrl.match(/^https?:\/\//i)) {
        normalizedUrl = "https://" + normalizedUrl;
      }
      const hostname = new URL(normalizedUrl).hostname;
      return hostname.replace(/^www\./, "").split(".")[0];
    } catch {
      return "サイト";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setProgress(null);

    let normalizedUrl = rootUrl.trim();
    if (!normalizedUrl.match(/^https?:\/\//i)) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    const companyName = getCompanyNameFromUrl(normalizedUrl);

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, rootUrl: normalizedUrl }),
      });

      if (!res.ok && !res.body) {
        const data = await res.json();
        throw new Error(data.error || "エラーが発生しました");
      }

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
              const data = JSON.parse(line.slice(6)) as ProgressEvent;
              setProgress(data);

              if (data.type === "complete") {
                setResult({
                  companyId: data.companyId!,
                  agentId: data.agentId!,
                });
              } else if (data.type === "error") {
                setError(data.message || "エラーが発生しました");
                setLoading(false);
                return;
              }
            } catch (parseError) {
              // JSON parse error - not an error event, just skip
              if (!(parseError instanceof SyntaxError)) {
                console.error("Unexpected error:", parseError);
              }
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (plan: "lite" | "pro") => {
    if (!result?.companyId || !email) {
      alert("メールアドレスを入力してください");
      return;
    }

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: result.companyId,
          email,
          plan,
        }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("決済ページの作成に失敗しました");
      }
    } catch {
      alert("エラーが発生しました");
    }
  };

  const widgetBaseUrl =
    typeof window !== "undefined"
      ? window.location.origin + "/widget"
      : "http://localhost:4000/widget";

  const companyName = getCompanyNameFromUrl(rootUrl);

  const embedCode = result
    ? `<script
  src="${typeof window !== "undefined" ? window.location.origin : "http://localhost:4000"}/widget.js"
  data-company-id="${result.companyId}"
  data-agent-name="${companyName} AI"
  data-theme-color="${selectedColor}"
  data-widget-base-url="${widgetBaseUrl}"
  defer
></script>`
    : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: `linear-gradient(180deg, ${colors.background} 0%, #E8DDE7 50%, #DFD4DE 100%)`,
      }}
    >
      {/* ヘッダー */}
      <header
        className="px-4 sm:px-6 py-3 sm:py-4"
        style={{
          background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary} 50%, ${colors.primary} 100%)`,
        }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Image
                src="/logo.png"
                alt="Saleschat AI"
                width={48}
                height={48}
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-white font-bold text-base sm:text-xl tracking-tight">Saleschat AI</h1>
              <p className="text-white/70 text-[10px] sm:text-xs">Powered by hackjpn</p>
            </div>
          </div>
          {/* 中央リンク */}
          <nav className="hidden md:flex items-center gap-4 text-white/80 text-sm">
            <a
              href="https://hackjpn.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              利用規約
            </a>
            <span className="text-white/40">|</span>
            <a
              href="https://hackjpn.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              情報の取り扱い
            </a>
            <span className="text-white/40">|</span>
            <a
              href="https://hackjpn.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              運営会社
            </a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            {status === "loading" ? (
              <div className="w-16 sm:w-20 h-8 sm:h-9 bg-white/20 rounded-xl animate-pulse" />
            ) : session ? (
              <>
                <Link
                  href="/dashboard"
                  className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-white/20 backdrop-blur-sm text-white text-xs sm:text-sm font-medium hover:bg-white/30 transition-all"
                >
                  <span className="hidden sm:inline">ダッシュボード</span>
                  <span className="sm:hidden">管理</span>
                  <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-white/20 backdrop-blur-sm text-white text-xs sm:text-sm font-medium hover:bg-white/30 transition-all"
                >
                  <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">ログイン</span>
                </Link>
                <Link
                  href="/signup"
                  className="flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-white text-rose-600 text-xs sm:text-sm font-medium hover:bg-white/90 transition-all"
                >
                  <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">新規登録</span>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {/* イントロ */}
        <div className="text-center mb-6 sm:mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-2 sm:mb-3">
            URLを入れるだけで<br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary} 100%)` }}
            >
              AIチャットボット
            </span>
            が完成
          </h2>
          <p className="text-slate-600 text-sm sm:text-base">
            あなたの会社専用の接客担当チャットを作成します
          </p>
        </div>

        {/* メインフォーム */}
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-rose-100 p-5 sm:p-8 mb-6 sm:mb-8">
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Globe className="w-4 h-4 text-rose-500" />
                サイトURL
              </label>
              <input
                type="text"
                value={rootUrl}
                onChange={(e) => setRootUrl(e.target.value)}
                placeholder="example.com または https://example.com"
                className="w-full border border-rose-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-300 transition-all"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-xl font-semibold text-white shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              style={{
                background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary} 100%)`,
              }}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  処理中...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  エージェントを作成
                </>
              )}
            </button>
          </form>
        </div>

        {/* ===== LP セクション ===== */}
        {!result && !loading && (
          <>
            {/* 利用用途 */}
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-rose-100 p-5 sm:p-8 mb-6 sm:mb-8">
              <div className="text-center mb-6">
                <h3 className="text-xl sm:text-2xl font-bold text-slate-800 mb-2">こんな用途に最適</h3>
                <p className="text-slate-600 text-sm">あらゆる業種・業態でご活用いただけます</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                <div className="text-center p-4 border border-slate-100 rounded-xl hover:border-rose-200 hover:bg-rose-50/50 transition-all">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-rose-100 flex items-center justify-center">
                    <ShoppingCart className="w-6 h-6 text-rose-600" />
                  </div>
                  <p className="font-medium text-slate-800 text-sm">ECサイト</p>
                  <p className="text-xs text-slate-500 mt-1">商品案内・注文サポート</p>
                </div>
                <div className="text-center p-4 border border-slate-100 rounded-xl hover:border-rose-200 hover:bg-rose-50/50 transition-all">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-blue-100 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-blue-600" />
                  </div>
                  <p className="font-medium text-slate-800 text-sm">企業サイト</p>
                  <p className="text-xs text-slate-500 mt-1">会社・サービス案内</p>
                </div>
                <div className="text-center p-4 border border-slate-100 rounded-xl hover:border-rose-200 hover:bg-rose-50/50 transition-all">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Briefcase className="w-6 h-6 text-emerald-600" />
                  </div>
                  <p className="font-medium text-slate-800 text-sm">採用サイト</p>
                  <p className="text-xs text-slate-500 mt-1">求人・応募サポート</p>
                </div>
                <div className="text-center p-4 border border-slate-100 rounded-xl hover:border-rose-200 hover:bg-rose-50/50 transition-all">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-purple-100 flex items-center justify-center">
                    <GraduationCap className="w-6 h-6 text-purple-600" />
                  </div>
                  <p className="font-medium text-slate-800 text-sm">教育機関</p>
                  <p className="text-xs text-slate-500 mt-1">入学案内・FAQ</p>
                </div>
                <div className="text-center p-4 border border-slate-100 rounded-xl hover:border-rose-200 hover:bg-rose-50/50 transition-all">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-pink-100 flex items-center justify-center">
                    <Heart className="w-6 h-6 text-pink-600" />
                  </div>
                  <p className="font-medium text-slate-800 text-sm">医療・福祉</p>
                  <p className="text-xs text-slate-500 mt-1">予約・診療案内</p>
                </div>
                <div className="text-center p-4 border border-slate-100 rounded-xl hover:border-rose-200 hover:bg-rose-50/50 transition-all">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-amber-100 flex items-center justify-center">
                    <Headphones className="w-6 h-6 text-amber-600" />
                  </div>
                  <p className="font-medium text-slate-800 text-sm">カスタマーサポート</p>
                  <p className="text-xs text-slate-500 mt-1">問い合わせ対応</p>
                </div>
              </div>
            </div>

            {/* 機能紹介 */}
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-rose-100 p-5 sm:p-8 mb-6 sm:mb-8">
              <div className="text-center mb-6">
                <h3 className="text-xl sm:text-2xl font-bold text-slate-800 mb-2">充実の機能</h3>
                <p className="text-slate-600 text-sm">あなたのビジネスを24時間サポート</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-3 p-4 bg-rose-50 rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-rose-500 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-1">AI自動学習</h4>
                    <p className="text-slate-600 text-xs sm:text-sm">URLを入力するだけでサイト内容を自動で学習し、最適な回答を生成</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-1">24時間365日対応</h4>
                    <p className="text-slate-600 text-xs sm:text-sm">深夜・休日でも即座に顧客対応。機会損失をゼロに</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-emerald-50 rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-1">CV率向上</h4>
                    <p className="text-slate-600 text-xs sm:text-sm">訪問者の疑問を即座に解消し、コンバージョンに導く</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-purple-50 rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center flex-shrink-0">
                    <BarChart3 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-1">詳細分析</h4>
                    <p className="text-slate-600 text-xs sm:text-sm">会話ログ・デバイス情報・行動分析でマーケティング強化</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center flex-shrink-0">
                    <Palette className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-1">カスタマイズ</h4>
                    <p className="text-slate-600 text-xs sm:text-sm">ブランドカラー・配置位置を自由に設定可能</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 bg-cyan-50 rounded-xl">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-1">セキュリティ</h4>
                    <p className="text-slate-600 text-xs sm:text-sm">SSL暗号化通信・安全なデータ管理で安心運用</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 導入プロセス */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl sm:rounded-3xl p-5 sm:p-8 mb-6 sm:mb-8 text-white shadow-xl">
              <div className="text-center mb-6">
                <h3 className="text-xl sm:text-2xl font-bold mb-2">かんたん3ステップで導入</h3>
                <p className="text-slate-300 text-sm">たった5分で設置完了</p>
              </div>
              <div className="space-y-4 sm:space-y-0 sm:flex sm:items-start sm:gap-4">
                <div className="flex-1 relative">
                  <div className="flex sm:flex-col items-center sm:text-center gap-4 sm:gap-2">
                    <div className="w-12 h-12 rounded-full bg-rose-500 flex items-center justify-center text-xl font-bold flex-shrink-0">
                      1
                    </div>
                    <div className="flex-1 sm:flex-none">
                      <h4 className="font-semibold mb-1">URLを入力</h4>
                      <p className="text-slate-300 text-xs sm:text-sm">あなたのサイトURLを入力するだけ</p>
                    </div>
                  </div>
                  <div className="hidden sm:block absolute top-6 left-full w-full h-0.5 bg-gradient-to-r from-rose-500 to-blue-500" style={{ width: "calc(100% - 48px)", left: "calc(50% + 24px)" }} />
                </div>
                <div className="flex-1 relative">
                  <div className="flex sm:flex-col items-center sm:text-center gap-4 sm:gap-2">
                    <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-xl font-bold flex-shrink-0">
                      2
                    </div>
                    <div className="flex-1 sm:flex-none">
                      <h4 className="font-semibold mb-1">AIが自動学習</h4>
                      <p className="text-slate-300 text-xs sm:text-sm">サイト内容を解析して学習完了</p>
                    </div>
                  </div>
                  <div className="hidden sm:block absolute top-6 left-full w-full h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500" style={{ width: "calc(100% - 48px)", left: "calc(50% + 24px)" }} />
                </div>
                <div className="flex-1">
                  <div className="flex sm:flex-col items-center sm:text-center gap-4 sm:gap-2">
                    <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-xl font-bold flex-shrink-0">
                      3
                    </div>
                    <div className="flex-1 sm:flex-none">
                      <h4 className="font-semibold mb-1">コードを貼るだけ</h4>
                      <p className="text-slate-300 text-xs sm:text-sm">HTMLタグをサイトに設置して完了</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-6 text-center">
                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full text-sm">
                  <Rocket className="w-4 h-4" />
                  プログラミング知識不要！
                </div>
              </div>
            </div>

            {/* 業界最安値アピール */}
            <div
              className="rounded-2xl sm:rounded-3xl p-5 sm:p-8 mb-6 sm:mb-8 text-white shadow-xl"
              style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, #B85561 100%)` }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <BadgePercent className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl sm:text-2xl font-bold">業界最安値に挑戦</h3>
                    <p className="text-white/80 text-sm">他社比較で最大90%OFF</p>
                  </div>
                </div>
                <div className="bg-emerald-400 text-emerald-900 px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold animate-pulse">
                  お試し無料
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                {/* Lite プラン */}
                <button
                  onClick={() => setExpandedPlan(expandedPlan === "lite" ? null : "lite")}
                  className={`bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center transition-all hover:bg-white/20 cursor-pointer ${
                    expandedPlan === "lite" ? "ring-2 ring-white" : ""
                  }`}
                >
                  <p className="text-3xl sm:text-4xl font-bold">¥500</p>
                  <p className="text-white/70 text-xs sm:text-sm">Lite プラン/月額</p>
                  <p className="text-white/50 text-[10px] mt-1">クリックして詳細</p>
                </button>
                {/* Pro プラン */}
                <button
                  onClick={() => setExpandedPlan(expandedPlan === "pro" ? null : "pro")}
                  className={`bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center transition-all hover:bg-white/20 cursor-pointer ${
                    expandedPlan === "pro" ? "ring-2 ring-white" : ""
                  }`}
                >
                  <p className="text-3xl sm:text-4xl font-bold">¥3,000</p>
                  <p className="text-white/70 text-xs sm:text-sm">Pro プラン/月額</p>
                  <p className="text-white/50 text-[10px] mt-1">クリックして詳細</p>
                </button>
              </div>

              {/* プラン詳細表示 */}
              {expandedPlan && (
                <div className="bg-white/15 backdrop-blur-sm rounded-xl p-4 mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  {expandedPlan === "lite" ? (
                    <div>
                      <h4 className="font-bold text-lg mb-2 flex items-center gap-2">
                        <Zap className="w-5 h-5" />
                        Lite プラン - ¥500/月
                      </h4>
                      <ul className="space-y-1.5 text-sm text-white/90">
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                          埋め込みコード取得
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                          チャットカラーカスタマイズ
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                          基本的なAI応答
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                          ウィジェット位置設定
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                          クイックボタン設定
                        </li>
                      </ul>
                    </div>
                  ) : (
                    <div>
                      <h4 className="font-bold text-lg mb-2 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5" />
                        Pro プラン - ¥3,000/月
                      </h4>
                      <ul className="space-y-1.5 text-sm text-white/90">
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                          Liteプランの全機能
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                          会話履歴トラッキング
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                          位置・端末情報分析
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                          詳細アナリティクスダッシュボード
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                          音声認識機能（STT）
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                          音声読み上げ機能（TTS）
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 justify-center">
                <span className="bg-white/20 px-3 py-1 rounded-full text-xs sm:text-sm">初期費用 ¥0</span>
                <span className="bg-white/20 px-3 py-1 rounded-full text-xs sm:text-sm">契約縛りなし</span>
                <span className="bg-white/20 px-3 py-1 rounded-full text-xs sm:text-sm">即日利用開始</span>
                <span className="bg-emerald-400/30 px-3 py-1 rounded-full text-xs sm:text-sm">お試し無料</span>
              </div>
            </div>

            {/* CTA */}
            <div className="text-center mb-6 sm:mb-8">
              <p className="text-slate-600 text-sm mb-3">まずは無料でお試しください</p>
              <button
                onClick={() => document.querySelector("input")?.focus()}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-white shadow-lg hover:shadow-xl transition-all"
                style={{
                  background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary} 100%)`,
                }}
              >
                <Zap className="w-5 h-5" />
                今すぐエージェントを作成
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </>
        )}

        {/* 進捗表示 */}
        {loading && progress && (
          <div className="bg-white rounded-3xl shadow-xl border border-rose-100 p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-rose-500" />
                サイト解析中...
              </h3>
              <span
                className="text-2xl font-bold bg-clip-text text-transparent"
                style={{ backgroundImage: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary} 100%)` }}
              >
                {progress.percent || 0}%
              </span>
            </div>

            {/* プログレスバー */}
            <div className="w-full bg-rose-100 rounded-full h-3 overflow-hidden mb-4">
              <div
                className="h-3 rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${progress.percent || 0}%`,
                  background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary} 100%)`,
                }}
              />
            </div>

            {/* ステータス */}
            <div className="flex items-center gap-2 text-sm text-slate-600 mb-4 min-w-0">
              <div className="animate-pulse text-lg flex-shrink-0">
                {progress.type === "discovering" && "🔍"}
                {progress.type === "crawling" && "📄"}
                {progress.type === "embedding" && "🧠"}
                {progress.type === "saving" && "💾"}
              </div>
              <span className="truncate">{progress.message}</span>
            </div>

            {/* 統計 */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-rose-100">
              <div className="text-center bg-rose-50 rounded-xl p-3">
                <div className="text-2xl font-bold text-rose-600">
                  {progress.currentPage || 0}
                </div>
                <div className="text-xs text-slate-500">解析済みページ</div>
              </div>
              <div className="text-center bg-rose-50 rounded-xl p-3">
                <div className="text-2xl font-bold text-rose-600">
                  {progress.chunksFound || 0}
                </div>
                <div className="text-xs text-slate-500">抽出データ数</div>
              </div>
            </div>

            {progress.currentUrl && (
              <div className="text-xs text-slate-400 truncate pt-4 border-t border-rose-100 mt-4">
                {progress.currentUrl}
              </div>
            )}
          </div>
        )}

        {/* エラー */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-8">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* 結果 */}
        {result && (
          <div className="space-y-6">
            {/* 成功メッセージ */}
            <div
              className="rounded-2xl p-6 text-white"
              style={{
                background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary} 100%)`,
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">エージェント作成完了!</h3>
                  <p className="text-white/80 text-sm">AIチャットボットが利用可能になりました</p>
                </div>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-sm">
                <p>Company ID: <code className="bg-white/20 px-2 py-0.5 rounded">{result.companyId}</code></p>
                <p className="mt-1">Agent ID: <code className="bg-white/20 px-2 py-0.5 rounded">{result.agentId}</code></p>
              </div>
            </div>

            {/* カラー選択（お試し可能） */}
            <div className="bg-white rounded-2xl shadow-lg border border-rose-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                  <Palette className="w-4 h-4 text-rose-500" />
                  チャットカラー
                </h3>
                {currentPlan === "free" && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                    お試し可能
                  </span>
                )}
              </div>
              <div className="grid grid-cols-6 gap-2 mb-4">
                {colorOptions.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setSelectedColor(color.value)}
                    className={`w-full aspect-square rounded-xl transition-all hover:scale-105 ${
                      selectedColor === color.value
                        ? "ring-2 ring-offset-2 scale-110"
                        : ""
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
              <p className="text-xs text-slate-500">
                {currentPlan === "free"
                  ? "カラーを選んで右下のチャットでお試しください"
                  : "選択したカラーが埋め込みコードに反映されます"}
              </p>
            </div>

            {/* 埋め込みコード（有料機能） */}
            <div className="bg-white rounded-2xl shadow-lg border border-rose-100 p-6 relative">
              <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                <Copy className="w-4 h-4 text-rose-500" />
                埋め込みコード
                {currentPlan === "free" && (
                  <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full ml-2">
                    <Lock className="w-3 h-3" />
                    有料
                  </span>
                )}
              </h3>

              {currentPlan !== "free" ? (
                <>
                  <p className="text-sm text-slate-600 mb-4">
                    以下のコードをサイトの &lt;/body&gt; 直前に貼り付けてください。
                  </p>
                  <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto whitespace-pre-wrap">
                    {embedCode}
                  </pre>
                  <button
                    onClick={handleCopy}
                    className="mt-4 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all flex items-center gap-2"
                    style={{
                      background: copied
                        ? "linear-gradient(135deg, #10B981 0%, #059669 100%)"
                        : `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary} 100%)`,
                    }}
                  >
                    <Copy className="w-4 h-4" />
                    {copied ? "コピーしました!" : "コードをコピー"}
                  </button>
                </>
              ) : (
                <>
                  <div className="relative">
                    <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto whitespace-pre-wrap blur-sm select-none">
                      {embedCode}
                    </pre>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <button
                        onClick={() => setShowUpgradeModal(true)}
                        className="px-6 py-3 rounded-xl text-sm font-semibold text-white shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                        style={{
                          background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary} 100%)`,
                        }}
                      >
                        <Lock className="w-4 h-4" />
                        プランを選んでアンロック
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 mt-4">
                    有料プランに登録すると、埋め込みコードの取得とカラーカスタマイズが可能になります。
                  </p>
                </>
              )}
            </div>

            {/* プレビューリンク */}
            <div className="bg-white rounded-2xl shadow-lg border border-rose-100 p-6">
              <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-rose-500" />
                ウィジェットプレビュー
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                直接ウィジェットページを開いてテストできます。
              </p>
              <a
                href={`/widget?companyId=${result.companyId}&agentName=${encodeURIComponent(companyName + " AI")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary} 100%)`,
                }}
              >
                ウィジェットを開く
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>

            {/* Proプランのトラッキングダッシュボード */}
            {currentPlan === "pro" && trackingData.stats && (
              <div className="bg-white rounded-2xl shadow-lg border border-rose-100 p-6">
                <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-rose-500" />
                  トラッキングダッシュボード
                  <span className="flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-full ml-2">
                    PRO
                  </span>
                </h3>

                {/* 統計カード */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-rose-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-rose-500" />
                      <span className="text-xs text-slate-600">セッション数</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-800">{trackingData.stats.totalSessions}</p>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="w-4 h-4 text-blue-500" />
                      <span className="text-xs text-slate-600">会話数</span>
                    </div>
                    <p className="text-2xl font-bold text-slate-800">{trackingData.stats.totalConversations}</p>
                  </div>
                </div>

                {/* デバイス分布 */}
                {Object.keys(trackingData.stats.deviceDistribution).length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Smartphone className="w-4 h-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-700">デバイス分布</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(trackingData.stats.deviceDistribution).map(([device, count]) => (
                        <span key={device} className="px-3 py-1 bg-slate-100 rounded-full text-xs text-slate-700">
                          {device}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 地域分布 */}
                {Object.keys(trackingData.stats.locationDistribution).length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="w-4 h-4 text-slate-500" />
                      <span className="text-sm font-medium text-slate-700">アクセス地域</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(trackingData.stats.locationDistribution).slice(0, 5).map(([location, count]) => (
                        <span key={location} className="px-3 py-1 bg-slate-100 rounded-full text-xs text-slate-700">
                          {location}: {count}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* プラン選択 */}
            {currentPlan === "free" && (
              <div className="space-y-4">
                <h3 className="text-base sm:text-lg font-semibold text-slate-800 text-center">プランを選択</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Liteプラン */}
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-full bg-blue-400 flex items-center justify-center">
                        <Zap className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-800">Lite</h4>
                        <p className="text-blue-700 font-bold text-lg">¥500<span className="text-xs font-normal">/月</span></p>
                      </div>
                    </div>
                    <ul className="space-y-1.5 mb-4 text-sm">
                      <li className="flex items-center gap-2 text-slate-700">
                        <Check className="w-3.5 h-3.5 text-green-500" />
                        埋め込みコード取得
                      </li>
                      <li className="flex items-center gap-2 text-slate-700">
                        <Check className="w-3.5 h-3.5 text-green-500" />
                        カラーカスタマイズ
                      </li>
                      <li className="flex items-center gap-2 text-slate-700">
                        <Check className="w-3.5 h-3.5 text-green-500" />
                        基本的なAI応答
                      </li>
                    </ul>
                    <button
                      onClick={() => {
                        if (!session) {
                          window.location.href = "/login?callbackUrl=" + encodeURIComponent(window.location.href);
                          return;
                        }
                        setSelectedPlan("lite");
                        setShowUpgradeModal(true);
                      }}
                      className="w-full py-2.5 rounded-xl font-semibold text-white text-sm shadow-md hover:shadow-lg transition-all"
                      style={{ background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)" }}
                    >
                      Liteを選択
                    </button>
                  </div>

                  {/* Proプラン */}
                  <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl border-2 border-purple-300 p-5 relative">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-500 text-white text-xs px-3 py-1 rounded-full">
                      おすすめ
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center">
                        <BarChart3 className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-800">Pro</h4>
                        <p className="text-purple-700 font-bold text-lg">¥3,000<span className="text-xs font-normal">/月</span></p>
                      </div>
                    </div>
                    <ul className="space-y-1.5 mb-4 text-sm">
                      <li className="flex items-center gap-2 text-slate-700">
                        <Check className="w-3.5 h-3.5 text-green-500" />
                        Liteの全機能
                      </li>
                      <li className="flex items-center gap-2 text-slate-700">
                        <Check className="w-3.5 h-3.5 text-green-500" />
                        会話履歴トラッキング
                      </li>
                      <li className="flex items-center gap-2 text-slate-700">
                        <Check className="w-3.5 h-3.5 text-green-500" />
                        位置・端末分析
                      </li>
                      <li className="flex items-center gap-2 text-slate-700">
                        <Check className="w-3.5 h-3.5 text-green-500" />
                        詳細ダッシュボード
                      </li>
                    </ul>
                    <button
                      onClick={() => {
                        if (!session) {
                          window.location.href = "/login?callbackUrl=" + encodeURIComponent(window.location.href);
                          return;
                        }
                        setSelectedPlan("pro");
                        setShowUpgradeModal(true);
                      }}
                      className="w-full py-2.5 rounded-xl font-semibold text-white text-sm shadow-md hover:shadow-lg transition-all"
                      style={{ background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)" }}
                    >
                      Proを選択
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 現在のプラン表示（有料プランの場合） */}
            {currentPlan !== "free" && (
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl border border-green-200 p-4">
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" />
                  <span className="font-medium text-slate-800">
                    現在のプラン: {currentPlan === "lite" ? "Lite" : "Pro"}
                  </span>
                  {currentPlan === "lite" && (
                    <button
                      onClick={() => { setSelectedPlan("pro"); setShowUpgradeModal(true); }}
                      className="ml-auto text-xs text-purple-600 hover:text-purple-700 font-medium"
                    >
                      Proにアップグレード
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* フッター */}
      <footer className="border-t border-slate-200 py-4 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* ロゴ・コピーライト */}
            <div className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="Saleschat AI"
                width={32}
                height={32}
                className="rounded-full"
              />
              <div>
                <p className="text-sm font-medium text-slate-700">Saleschat AI</p>
                <p className="text-xs text-slate-400">© 2024 hackjpn Inc.</p>
              </div>
            </div>

            {/* ナビゲーションリンク */}
            <nav className="flex flex-wrap items-center justify-center gap-4 text-sm text-slate-500">
              <a
                href="https://hackjpn.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-700 transition-colors"
              >
                利用規約
              </a>
              <span className="text-slate-300">|</span>
              <a
                href="https://hackjpn.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-700 transition-colors"
              >
                情報の取り扱い
              </a>
              <span className="text-slate-300">|</span>
              <a
                href="https://hackjpn.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-700 transition-colors"
              >
                運営会社
              </a>
              {!session && (
                <>
                  <span className="text-slate-300">|</span>
                  <Link
                    href="/login"
                    className="hover:text-slate-700 transition-colors"
                  >
                    ログイン
                  </Link>
                  <span className="text-slate-300">|</span>
                  <Link
                    href="/signup"
                    className="hover:text-slate-700 transition-colors"
                  >
                    新規登録
                  </Link>
                </>
              )}
            </nav>
          </div>

          {/* Powered by */}
          <p className="text-center text-xs text-slate-400 mt-3">
            Powered by <a href="https://hackjpn.com" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 transition-colors">hackjpn</a> ver 2.5
          </p>
        </div>
      </footer>

      {/* アップグレードモーダル */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-slate-800">
                {selectedPlan === "lite" ? "Liteプラン" : "Proプラン"}に登録
              </h3>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="p-2 rounded-full hover:bg-slate-100 transition-all"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div
              className={`rounded-xl p-4 mb-4 ${
                selectedPlan === "lite"
                  ? "bg-gradient-to-br from-blue-50 to-indigo-50"
                  : "bg-gradient-to-br from-purple-50 to-pink-50"
              }`}
            >
              <p className={`text-2xl font-bold ${selectedPlan === "lite" ? "text-blue-700" : "text-purple-700"}`}>
                月額 ¥{selectedPlan === "lite" ? "500" : "3,000"}
              </p>
              <p className="text-sm text-slate-600">クレジットカードで簡単決済</p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  メールアドレス
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className={`w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-all ${
                    selectedPlan === "lite"
                      ? "focus:ring-blue-300 focus:border-blue-300"
                      : "focus:ring-purple-300 focus:border-purple-300"
                  }`}
                  required
                />
              </div>
            </div>

            <button
              onClick={() => handleUpgrade(selectedPlan)}
              disabled={!email}
              className="w-full py-3 rounded-xl font-semibold text-white shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              style={{
                background: selectedPlan === "lite"
                  ? "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)"
                  : "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
              }}
            >
              <CreditCard className="w-5 h-5" />
              決済ページへ進む
            </button>

            <p className="text-xs text-slate-500 text-center mt-4">
              Stripeによる安全な決済
            </p>
          </div>
        </div>
      )}

      {/* ウィジェット表示 */}
      <>
        {/* デモバッジ - resultがある場合のみ表示（右下） */}
        {result && (
          <div className="fixed bottom-20 sm:bottom-24 right-4 sm:right-6 z-40 bg-rose-500 text-white text-[10px] sm:text-xs px-2 sm:px-3 py-1 sm:py-1.5 rounded-full shadow-lg animate-bounce">
            埋め込むとこうなります
          </div>
        )}

        {/* ユーザー作成後のウィジェット（右下） */}
        {result && widgetOpen && (
          <div className="fixed bottom-20 sm:bottom-24 right-2 sm:right-6 left-2 sm:left-auto z-50 sm:w-[380px] h-[70vh] sm:h-[600px] max-h-[600px] rounded-2xl shadow-2xl overflow-hidden border border-rose-200">
            <iframe
              key={`widget-${widgetKey}-${result.companyId}-${selectedColor}`}
              src={`/widget?companyId=${result.companyId}&agentName=${encodeURIComponent(companyName + " AI")}&themeColor=${encodeURIComponent(selectedColor)}`}
              className="w-full h-full"
              title="Chat Widget"
            />
          </div>
        )}

        {/* ユーザー作成後のフローティングボタン（右下） */}
        {result && (
          <button
            onClick={() => setWidgetOpen(!widgetOpen)}
            className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-50 w-12 h-12 sm:w-14 sm:h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110"
            style={{
              background: `linear-gradient(135deg, ${selectedColor} 0%, ${selectedColor} 100%)`,
            }}
          >
            {widgetOpen ? (
              <X className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            ) : (
              <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            )}
          </button>
        )}

        {/* デモ用 hackjpn AI ウィジェット（左下）- resultがない場合のみ */}
        {!result && widgetOpen && (
          <div className="fixed bottom-20 sm:bottom-24 left-2 sm:left-6 right-2 sm:right-auto z-50 sm:w-[380px] h-[70vh] sm:h-[600px] max-h-[600px] rounded-2xl shadow-2xl overflow-hidden border border-rose-200">
            <iframe
              key={`widget-demo-hackjpn`}
              src="https://saleschat.me/widget?companyId=e2c748ed-b950-4774-8591-06836b2e430c&agentName=hackjpn%20AI&themeColor=%23D86672"
              className="w-full h-full"
              title="hackjpn AI Chat Widget"
            />
          </div>
        )}

        {/* デモ用フローティングボタン（左下）- resultがない場合のみ */}
        {!result && (
          <button
            onClick={() => setWidgetOpen(!widgetOpen)}
            className="fixed bottom-4 sm:bottom-6 left-4 sm:left-6 z-50 w-12 h-12 sm:w-14 sm:h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110"
            style={{
              background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary} 100%)`,
            }}
          >
            {widgetOpen ? (
              <X className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            ) : (
              <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            )}
          </button>
        )}
      </>
    </div>
  );
}
