"use client";

// [Analytics] 解析ダッシュボード（Pro機能）

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  MessageCircle,
  Target,
  Users,
  Eye,
  Smartphone,
  Monitor,
  Tablet,
  ChevronLeft,
  Lock,
  Sparkles,
  Loader2,
  RefreshCw,
  Calendar,
  FileText,
  Brain,
  ArrowUpRight,
  ArrowDownRight,
  MessagesSquare,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";

type SummaryData = {
  totalPV: number;
  sessions: number;
  uniqueVisitors: number;
  chatOpens: number;
  chatMessages: number;
  conversions: number;
  chatOpenRate: string;
  chatCVR: string;
  nonChatCVR: string;
  chatConversions: number;
  chatSessions: number;
};

type DailyData = {
  date: string;
  pageViews: number;
  chatOpens: number;
  conversions: number;
};

type PageData = {
  url: string;
  path: string;
  views: number;
  uniqueVisitors: number;
  sessions: number;
  chatOpens: number;
  chatOpenRate: number;
  conversions: number;
  chatCVR: number;
};

type CategoryData = {
  category: string;
  count: number;
  examples: string[];
};

type Suggestion = {
  title: string;
  category: string;
  priority: string;
  description: string;
  expectedImpact: string;
};

type ConversationMessage = {
  role: string;
  content: string;
  createdAt: string;
};

type ConversationData = {
  sessionId: string;
  pageUrl: string | null;
  pagePath: string | null;
  deviceType: string | null;
  startedAt: string;
  endedAt: string;
  messages: ConversationMessage[];
};

function AnalyticsContent() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const companyId = searchParams.get("companyId");
  const companyName = searchParams.get("companyName");

  const [activeTab, setActiveTab] = useState<"overview" | "pages" | "chat" | "questions" | "conversations" | "ai">("overview");
  const [period, setPeriod] = useState("7days");
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // データ
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [deviceDistribution, setDeviceDistribution] = useState<{pc: number; mobile: number; tablet: number}>({pc: 0, mobile: 0, tablet: 0});
  const [pages, setPages] = useState<PageData[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // 会話履歴
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [conversationsPage, setConversationsPage] = useState(1);
  const [conversationsTotalPages, setConversationsTotalPages] = useState(1);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [expandedConversations, setExpandedConversations] = useState<Set<string>>(new Set());

  // データ取得
  const fetchData = useCallback(async () => {
    if (!companyId) return;

    setLoading(true);
    setError(null);

    try {
      // サマリー取得
      const summaryRes = await fetch(
        `/api/analytics/summary?companyId=${companyId}&period=${period}`
      );
      const summaryData = await summaryRes.json();

      if (summaryData.error) {
        setError(summaryData.error);
        setLoading(false);
        return;
      }

      setIsPro(summaryData.isPro);
      setSummary(summaryData.summary || {
        totalPV: 0,
        sessions: 0,
        uniqueVisitors: 0,
        chatOpens: 0,
        chatMessages: 0,
        conversions: 0,
        chatOpenRate: "0",
        chatCVR: "0",
        nonChatCVR: "0",
        chatConversions: 0,
        chatSessions: 0,
      });
      setDailyData(summaryData.dailyData || []);
      setDeviceDistribution(summaryData.deviceDistribution || {pc: 0, mobile: 0, tablet: 0});

      // Proプランのみ追加データを取得
      if (summaryData.isPro) {
        // ページ別データ
        const pagesRes = await fetch(
          `/api/analytics/pages?companyId=${companyId}&period=${period}`
        );
        const pagesData = await pagesRes.json();
        if (!pagesData.error) {
          setPages(pagesData.pages || []);
        }

        // 質問分析データ
        const questionsRes = await fetch(
          `/api/analytics/questions?companyId=${companyId}&period=${period}`
        );
        const questionsData = await questionsRes.json();
        if (!questionsData.error) {
          setCategories(questionsData.categories || []);
        }
      }
    } catch (err) {
      console.error("Analytics fetch error:", err);
      setError("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [companyId, period]);

  // AI提案を取得
  const fetchInsights = async () => {
    if (!companyId || !isPro) return;

    setLoadingInsights(true);
    try {
      const res = await fetch(
        `/api/analytics/insights?companyId=${companyId}&period=30days`
      );
      const data = await res.json();
      if (!data.error) {
        setSuggestions(data.suggestions || []);
      }
    } catch (err) {
      console.error("Insights fetch error:", err);
    } finally {
      setLoadingInsights(false);
    }
  };

  // 会話履歴を取得
  const fetchConversations = useCallback(async (pageNum: number = 1) => {
    if (!companyId || !isPro) return;

    setLoadingConversations(true);
    try {
      const res = await fetch(
        `/api/analytics/conversations?companyId=${companyId}&period=${period}&page=${pageNum}&limit=20`
      );
      const data = await res.json();
      if (!data.error && data.conversations) {
        setConversations(data.conversations);
        setConversationsPage(data.pagination?.page || 1);
        setConversationsTotalPages(data.pagination?.totalPages || 1);
      }
    } catch (err) {
      console.error("Conversations fetch error:", err);
    } finally {
      setLoadingConversations(false);
    }
  }, [companyId, isPro, period]);

  // 会話の展開/折りたたみ
  const toggleConversation = (sessionId: string) => {
    setExpandedConversations((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated" && companyId) {
      fetchData();
    }
  }, [status, companyId, period, fetchData, router]);

  // 会話履歴タブが選択されたらデータを取得
  useEffect(() => {
    if (activeTab === "conversations" && isPro && conversations.length === 0) {
      fetchConversations(1);
    }
  }, [activeTab, isPro, conversations.length, fetchConversations]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-6">
        <div className="max-w-4xl mx-auto text-center py-20">
          <p className="text-slate-600">会社IDが指定されていません</p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex items-center gap-2 text-rose-600 hover:text-rose-700"
          >
            <ChevronLeft className="w-4 h-4" />
            ダッシュボードに戻る
          </Link>
        </div>
      </div>
    );
  }

  // 期間オプション
  const periodOptions = [
    { value: "today", label: "今日" },
    { value: "yesterday", label: "昨日" },
    { value: "7days", label: "7日間" },
    { value: "30days", label: "30日間" },
    { value: "90days", label: "90日間" },
  ];

  // タブ定義
  const tabs = [
    { id: "overview", label: "概要", icon: BarChart3 },
    { id: "pages", label: "ページ別", icon: FileText, proOnly: true },
    { id: "conversations", label: "会話履歴", icon: MessagesSquare, proOnly: true },
    { id: "chat", label: "チャット×CV", icon: Target, proOnly: true },
    { id: "questions", label: "質問分析", icon: MessageCircle, proOnly: true },
    { id: "ai", label: "AIレポート", icon: Brain, proOnly: true },
  ];

  // 最大値を取得（グラフ用）
  const maxPV = Math.max(...dailyData.map(d => d.pageViews), 1);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* ヘッダー */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="flex items-center gap-1 text-slate-600 hover:text-slate-800 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                戻る
              </Link>
              <div>
                <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-rose-500" />
                  解析ダッシュボード
                </h1>
                <p className="text-sm text-slate-500">{companyName || "解析データ"}</p>
              </div>
            </div>

            {/* 期間セレクター */}
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-slate-400" />
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
              >
                {periodOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                onClick={fetchData}
                className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                title="更新"
              >
                <RefreshCw className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Pro制限バナー */}
        {!isPro && (
          <div className="mb-6 bg-gradient-to-r from-purple-50 to-rose-50 rounded-2xl p-6 border border-purple-100">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-purple-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-800 mb-1">
                  Proプランで解析機能をフル活用
                </h3>
                <p className="text-sm text-slate-600 mb-3">
                  ページ別分析、チャット×CV分析、質問カテゴリ分析、AI改善提案など、
                  より深い洞察が得られます。
                </p>
                <Link
                  href={`/dashboard?upgrade=${companyId}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
                >
                  Proにアップグレード
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* タブナビゲーション */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isDisabled = tab.proOnly && !isPro;
            return (
              <button
                key={tab.id}
                onClick={() => !isDisabled && setActiveTab(tab.id as typeof activeTab)}
                disabled={isDisabled}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? "bg-rose-500 text-white shadow-md"
                    : isDisabled
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-white text-slate-600 border border-slate-200 hover:border-rose-200 hover:text-rose-600"
                }`}
              >
                {isDisabled ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
                {tab.label}
                {tab.proOnly && !isPro && (
                  <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded">
                    Pro
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 概要タブ */}
        {activeTab === "overview" && summary && (
          <div className="space-y-6">
            {/* サマリーカード */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                  <Eye className="w-4 h-4" />
                  総PV
                </div>
                <div className="text-2xl font-bold text-slate-800">
                  {(summary.totalPV ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                  <Users className="w-4 h-4" />
                  セッション
                </div>
                <div className="text-2xl font-bold text-slate-800">
                  {(summary.sessions ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                  <MessageCircle className="w-4 h-4" />
                  チャット開始
                </div>
                <div className="text-2xl font-bold text-slate-800">
                  {(summary.chatOpens ?? 0).toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  開始率 {summary.chatOpenRate ?? "0"}%
                </div>
              </div>
              <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                  <Target className="w-4 h-4" />
                  コンバージョン
                </div>
                <div className="text-2xl font-bold text-slate-800">
                  {(summary.conversions ?? 0).toLocaleString()}
                </div>
              </div>
            </div>

            {/* CVR比較 */}
            {isPro && (
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-rose-500" />
                  チャットの効果
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  CVR（コンバージョン率）= お問い合わせや購入などの目標達成率。チャットを利用したユーザーと利用していないユーザーでCVRを比較し、チャットの効果を測定します。
                </p>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="text-center p-4 bg-green-50 rounded-xl">
                    <div className="text-sm text-slate-600 mb-1">チャット利用者のCVR</div>
                    <div className="text-3xl font-bold text-green-600">
                      {summary.chatCVR ?? "0"}%
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {summary.chatSessions ?? 0}セッション / {summary.chatConversions ?? 0}CV
                    </div>
                  </div>
                  <div className="text-center p-4 bg-slate-50 rounded-xl">
                    <div className="text-sm text-slate-600 mb-1">非チャットユーザーのCVR</div>
                    <div className="text-3xl font-bold text-slate-600">
                      {summary.nonChatCVR ?? "0"}%
                    </div>
                  </div>
                </div>
                {parseFloat(summary.chatCVR ?? "0") > parseFloat(summary.nonChatCVR ?? "0") && (
                  <div className="mt-4 p-3 bg-green-50 rounded-lg text-center">
                    <span className="text-green-700 font-medium flex items-center justify-center gap-1">
                      <ArrowUpRight className="w-4 h-4" />
                      チャット利用者は非利用者より{" "}
                      {(parseFloat(summary.chatCVR ?? "0") / Math.max(parseFloat(summary.nonChatCVR ?? "0"), 0.01)).toFixed(1)}倍
                      CVしやすい！
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* 日別グラフ */}
            {isPro && dailyData.length > 0 && (
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-4">日別推移</h3>
                <div className="flex gap-1">
                  {dailyData.map((day, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center">
                      <div className="text-xs text-slate-600 font-medium mb-1">
                        {day.pageViews}
                      </div>
                      <div className="w-full h-32 flex items-end">
                        <div
                          className="w-full bg-rose-400 rounded-t transition-all hover:bg-rose-500"
                          style={{ height: `${(day.pageViews / maxPV) * 100}%`, minHeight: "4px" }}
                          title={`PV: ${day.pageViews}`}
                        />
                      </div>
                      <div className="text-xs text-slate-500 truncate w-full text-center mt-1">
                        {day.date.slice(5)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-4 mt-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-rose-400 rounded" />
                    PV
                  </span>
                </div>
              </div>
            )}

            {/* デバイス分布 */}
            {isPro && (
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-4">デバイス分布</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-slate-50 rounded-xl">
                    <Monitor className="w-6 h-6 mx-auto text-slate-600 mb-2" />
                    <div className="text-xl font-bold text-slate-800">
                      {deviceDistribution.pc}
                    </div>
                    <div className="text-xs text-slate-500">PC</div>
                  </div>
                  <div className="text-center p-4 bg-slate-50 rounded-xl">
                    <Smartphone className="w-6 h-6 mx-auto text-slate-600 mb-2" />
                    <div className="text-xl font-bold text-slate-800">
                      {deviceDistribution.mobile}
                    </div>
                    <div className="text-xs text-slate-500">モバイル</div>
                  </div>
                  <div className="text-center p-4 bg-slate-50 rounded-xl">
                    <Tablet className="w-6 h-6 mx-auto text-slate-600 mb-2" />
                    <div className="text-xl font-bold text-slate-800">
                      {deviceDistribution.tablet}
                    </div>
                    <div className="text-xs text-slate-500">タブレット</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ページ別タブ */}
        {activeTab === "pages" && isPro && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">ページ別パフォーマンス</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 text-sm text-slate-600">
                  <tr>
                    <th className="text-left px-4 py-3">ページ</th>
                    <th className="text-right px-4 py-3">PV</th>
                    <th className="text-right px-4 py-3">チャット開始率</th>
                    <th className="text-right px-4 py-3">チャットCVR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pages.map((page, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-800 truncate max-w-xs">
                          {page.path}
                        </div>
                        <a
                          href={page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-slate-500 truncate max-w-xs block hover:text-rose-500 hover:underline"
                        >
                          {page.url}
                        </a>
                      </td>
                      <td className="text-right px-4 py-3 text-sm text-slate-800">
                        {page.views.toLocaleString()}
                      </td>
                      <td className="text-right px-4 py-3">
                        <span className={`text-sm font-medium ${page.chatOpenRate > 5 ? "text-green-600" : "text-slate-600"}`}>
                          {page.chatOpenRate}%
                        </span>
                      </td>
                      <td className="text-right px-4 py-3">
                        <span className={`text-sm font-medium ${page.chatCVR > 0 ? "text-green-600" : "text-slate-600"}`}>
                          {page.chatCVR}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {pages.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        データがありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 会話履歴タブ */}
        {activeTab === "conversations" && isPro && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <MessagesSquare className="w-5 h-5 text-rose-500" />
                  会話履歴
                </h3>
                <button
                  onClick={() => fetchConversations(conversationsPage)}
                  disabled={loadingConversations}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingConversations ? "animate-spin" : ""}`} />
                  更新
                </button>
              </div>

              {loadingConversations && conversations.length === 0 ? (
                <div className="py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-rose-500 mx-auto mb-4" />
                  <p className="text-slate-600">会話履歴を読み込み中...</p>
                </div>
              ) : conversations.length === 0 ? (
                <div className="py-12 text-center">
                  <MessagesSquare className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600">この期間の会話履歴はありません</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {conversations.map((conv) => {
                    const isExpanded = expandedConversations.has(conv.sessionId);
                    const userMessages = conv.messages.filter((m) => m.role === "user");
                    const firstUserMessage = userMessages[0]?.content || "";

                    return (
                      <div key={conv.sessionId} className="hover:bg-slate-50 transition-colors">
                        {/* ヘッダー部分（クリックで展開） */}
                        <button
                          onClick={() => toggleConversation(conv.sessionId)}
                          className="w-full p-4 text-left flex items-start gap-4"
                        >
                          <div className="flex-shrink-0 mt-1">
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-slate-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-slate-800">
                                {new Date(conv.startedAt).toLocaleDateString("ja-JP", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                                {conv.messages.length}件のメッセージ
                              </span>
                              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                                {conv.deviceType
                                  ? conv.deviceType === "pc" ? "PC" : conv.deviceType === "mobile" ? "モバイル" : "タブレット"
                                  : "不明"}
                              </span>
                            </div>
                            {/* ページURL */}
                            <div className="flex items-center gap-1 mb-2">
                              <span className="text-xs text-slate-500">ページ:</span>
                              {conv.pageUrl ? (
                                <a
                                  href={conv.pageUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-xs text-rose-500 hover:text-rose-600 hover:underline truncate max-w-md flex items-center gap-1"
                                >
                                  {conv.pagePath || conv.pageUrl}
                                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                </a>
                              ) : (
                                <span className="text-xs text-slate-400">取得中...</span>
                              )}
                            </div>
                            {/* 最初の質問をプレビュー表示 */}
                            <p className="text-sm text-slate-600 truncate">
                              {firstUserMessage.slice(0, 100)}{firstUserMessage.length > 100 ? "..." : ""}
                            </p>
                          </div>
                        </button>

                        {/* 展開時の会話内容 */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pl-14">
                            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                              {conv.messages.map((msg, idx) => (
                                <div
                                  key={idx}
                                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                                >
                                  <div
                                    className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                                      msg.role === "user"
                                        ? "bg-rose-500 text-white"
                                        : "bg-white border border-slate-200 text-slate-800"
                                    }`}
                                  >
                                    <p className="text-sm whitespace-pre-wrap break-words">
                                      {msg.content}
                                    </p>
                                    <p className={`text-xs mt-1 ${msg.role === "user" ? "text-rose-200" : "text-slate-400"}`}>
                                      {new Date(msg.createdAt).toLocaleTimeString("ja-JP", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ページネーション */}
              {conversationsTotalPages > 1 && (
                <div className="p-4 border-t border-slate-100 flex items-center justify-center gap-2">
                  <button
                    onClick={() => fetchConversations(conversationsPage - 1)}
                    disabled={conversationsPage <= 1 || loadingConversations}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    前へ
                  </button>
                  <span className="text-sm text-slate-600">
                    {conversationsPage} / {conversationsTotalPages}
                  </span>
                  <button
                    onClick={() => fetchConversations(conversationsPage + 1)}
                    disabled={conversationsPage >= conversationsTotalPages || loadingConversations}
                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    次へ
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* チャット×CVタブ */}
        {activeTab === "chat" && isPro && summary && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4">チャットとコンバージョンの関係</h3>
              <div className="grid md:grid-cols-2 gap-8">
                {/* チャット利用者 */}
                <div className="relative">
                  <div className="text-center mb-4">
                    <div className="text-lg font-medium text-slate-700">チャット利用者</div>
                  </div>
                  <div className="bg-gradient-to-b from-green-50 to-green-100 rounded-2xl p-6">
                    <div className="text-center">
                      <div className="text-5xl font-bold text-green-600 mb-2">
                        {summary.chatCVR ?? "0"}%
                      </div>
                      <div className="text-sm text-slate-600">コンバージョン率</div>
                      <div className="mt-4 pt-4 border-t border-green-200">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="text-slate-500">セッション</div>
                            <div className="font-bold text-slate-800">{summary.chatSessions ?? 0}</div>
                          </div>
                          <div>
                            <div className="text-slate-500">CV数</div>
                            <div className="font-bold text-slate-800">{summary.chatConversions ?? 0}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 非チャット利用者 */}
                <div className="relative">
                  <div className="text-center mb-4">
                    <div className="text-lg font-medium text-slate-700">非チャット利用者</div>
                  </div>
                  <div className="bg-gradient-to-b from-slate-50 to-slate-100 rounded-2xl p-6">
                    <div className="text-center">
                      <div className="text-5xl font-bold text-slate-600 mb-2">
                        {summary.nonChatCVR ?? "0"}%
                      </div>
                      <div className="text-sm text-slate-600">コンバージョン率</div>
                      <div className="mt-4 pt-4 border-t border-slate-200">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <div className="text-slate-500">セッション</div>
                            <div className="font-bold text-slate-800">
                              {(summary.sessions ?? 0) - (summary.chatSessions ?? 0)}
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500">CV数</div>
                            <div className="font-bold text-slate-800">
                              {(summary.conversions ?? 0) - (summary.chatConversions ?? 0)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* インサイト */}
              {parseFloat(summary.chatCVR ?? "0") > parseFloat(summary.nonChatCVR ?? "0") ? (
                <div className="mt-6 p-4 bg-green-50 rounded-xl border border-green-200">
                  <div className="flex items-start gap-3">
                    <ArrowUpRight className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-green-800">チャットがCVを後押ししています</div>
                      <div className="text-sm text-green-700 mt-1">
                        チャットを利用したユーザーは、非利用者と比較して
                        <strong>
                          {(parseFloat(summary.chatCVR ?? "0") / Math.max(parseFloat(summary.nonChatCVR ?? "0"), 0.01)).toFixed(1)}倍
                        </strong>
                        高い確率でコンバージョンしています。
                        チャットの露出を増やすことで、さらなるCV増加が期待できます。
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <div className="flex items-start gap-3">
                    <ArrowDownRight className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-amber-800">チャット体験の改善余地があります</div>
                      <div className="text-sm text-amber-700 mt-1">
                        チャット利用者のCVRが低めです。チャットの回答品質やユーザー導線を見直すことで、
                        コンバージョン率の改善が期待できます。
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 質問分析タブ */}
        {activeTab === "questions" && isPro && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-800">質問カテゴリランキング</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {categories.map((cat, i) => (
                  <div key={i} className="p-4 hover:bg-slate-50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center text-sm font-bold">
                          {i + 1}
                        </span>
                        <span className="font-medium text-slate-800">{cat.category}</span>
                      </div>
                      <span className="text-sm text-slate-500">{cat.count}件</span>
                    </div>
                    {cat.examples.length > 0 && (
                      <div className="ml-9 mt-2 space-y-1">
                        {cat.examples.slice(0, 2).map((ex, j) => (
                          <div key={j} className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                            &ldquo;{ex.slice(0, 100)}{ex.length > 100 ? "..." : ""}&rdquo;
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {categories.length === 0 && (
                  <div className="p-8 text-center text-slate-500">
                    質問データがまだありません
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AIレポートタブ */}
        {activeTab === "ai" && isPro && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-500" />
                  AI改善提案
                </h3>
                <button
                  onClick={fetchInsights}
                  disabled={loadingInsights}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 transition-colors disabled:opacity-50"
                >
                  {loadingInsights ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {suggestions.length > 0 ? "再生成" : "提案を生成"}
                </button>
              </div>

              {loadingInsights && (
                <div className="py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-4" />
                  <p className="text-slate-600">AIがデータを分析中...</p>
                </div>
              )}

              {!loadingInsights && suggestions.length === 0 && (
                <div className="py-12 text-center bg-slate-50 rounded-xl">
                  <Brain className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600 mb-2">
                    AIがあなたのデータを分析し、改善提案を行います
                  </p>
                  <p className="text-sm text-slate-500">
                    「提案を生成」ボタンをクリックしてください
                  </p>
                </div>
              )}

              {!loadingInsights && suggestions.length > 0 && (
                <div className="space-y-4">
                  {suggestions.map((suggestion, i) => (
                    <div
                      key={i}
                      className="p-4 border border-slate-200 rounded-xl hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            suggestion.priority === "高"
                              ? "bg-red-100 text-red-600"
                              : suggestion.priority === "中"
                              ? "bg-amber-100 text-amber-600"
                              : "bg-green-100 text-green-600"
                          }`}
                        >
                          {i + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-slate-800">
                              {suggestion.title}
                            </span>
                            <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                              {suggestion.category}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded ${
                                suggestion.priority === "高"
                                  ? "bg-red-100 text-red-600"
                                  : suggestion.priority === "中"
                                  ? "bg-amber-100 text-amber-600"
                                  : "bg-green-100 text-green-600"
                              }`}
                            >
                              優先度: {suggestion.priority}
                            </span>
                          </div>
                          <p className="text-sm text-slate-600 mb-2">
                            {suggestion.description}
                          </p>
                          <p className="text-xs text-slate-500">
                            期待効果: {suggestion.expectedImpact}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-rose-500 mx-auto mb-4" />
            <p className="text-slate-600">読み込み中...</p>
          </div>
        </div>
      </div>
    }>
      <AnalyticsContent />
    </Suspense>
  );
}
