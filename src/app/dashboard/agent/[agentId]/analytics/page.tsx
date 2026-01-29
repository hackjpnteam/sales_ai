"use client";

// [Analytics] 解析ダッシュボード（Pro機能）
// エージェント固有のルート: /dashboard/agent/[agentId]/analytics

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
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
  MessagesSquare,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
  ArrowLeft,
  Download,
} from "lucide-react";

// ツールチップコンポーネント
function Tooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex ml-1">
      <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-lg">
        {text}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
      </div>
    </div>
  );
}

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

type QuestionRankingData = {
  text: string;
  count: number;
  lastDate: string;
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

type AgentInfo = {
  agentId: string;
  name: string;
  companyId: string;
  plan: string;
};

function AnalyticsContent() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const agentId = params.agentId as string;
  // Support legacy companyId parameter for backwards compatibility
  const legacyCompanyId = searchParams.get("companyId");
  const legacyCompanyName = searchParams.get("companyName");

  const [activeTab, setActiveTab] = useState<"overview" | "pages" | "chat" | "questions" | "conversations" | "ai">("overview");
  const [period, setPeriod] = useState("7days");
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Agent info
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(legacyCompanyId);

  // データ
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [deviceDistribution, setDeviceDistribution] = useState<{pc: number; mobile: number; tablet: number}>({pc: 0, mobile: 0, tablet: 0});
  const [pages, setPages] = useState<PageData[]>([]);
  const [questionRanking, setQuestionRanking] = useState<QuestionRankingData[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // 会話履歴
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [conversationsPage, setConversationsPage] = useState(1);
  const [conversationsTotalPages, setConversationsTotalPages] = useState(1);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [expandedConversations, setExpandedConversations] = useState<Set<string>>(new Set());

  // Fetch agent info to get companyId
  useEffect(() => {
    const fetchAgentInfo = async () => {
      if (!agentId || legacyCompanyId) return;

      try {
        const res = await fetch("/api/user/companies");
        if (!res.ok) return;

        const data = await res.json();
        const allCompanies = [...(data.companies || []), ...(data.sharedCompanies || [])];

        for (const company of allCompanies) {
          const agent = company.agents?.find((a: { agentId: string }) => a.agentId === agentId);
          if (agent) {
            setAgentInfo({
              agentId: agent.agentId,
              name: agent.name,
              companyId: company.companyId,
              plan: company.plan || "free",
            });
            setCompanyId(company.companyId);
            return;
          }
        }
      } catch (err) {
        console.error("Failed to fetch agent info:", err);
      }
    };

    fetchAgentInfo();
  }, [agentId, legacyCompanyId]);

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
          setQuestionRanking(questionsData.questionRanking || []);
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

  // CSVエクスポート関数
  const exportQuestionsToCSV = () => {
    if (questionRanking.length === 0) return;

    // BOM（Byte Order Mark）を追加してExcelで文字化けを防ぐ
    const BOM = "\uFEFF";

    // CSVヘッダー
    const headers = ["順位", "質問内容", "出現回数", "最終日時"];

    // CSVデータ行を生成
    const rows = questionRanking.map((q, index) => {
      // 質問内容にカンマや改行が含まれる場合はダブルクォートで囲む
      const escapedText = `"${q.text.replace(/"/g, '""')}"`;
      const lastDate = new Date(q.lastDate).toLocaleString("ja-JP");
      return [index + 1, escapedText, q.count, lastDate].join(",");
    });

    // CSVコンテンツを生成
    const csvContent = BOM + headers.join(",") + "\n" + rows.join("\n");

    // Blobを作成してダウンロード
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `質問ランキング_${agentName}_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-rose-500 mx-auto mb-4" />
          <p className="text-slate-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  if (!companyId && !agentId) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-600">エージェントが指定されていません</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-flex items-center gap-2 text-rose-600 hover:text-rose-700"
        >
          <ChevronLeft className="w-4 h-4" />
          ダッシュボードに戻る
        </Link>
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
    { id: "questions", label: "質問分析", icon: MessageCircle, proOnly: true },
    { id: "ai", label: "AIレポート", icon: Brain, proOnly: true },
  ];

  // 最大値を取得（グラフ用）
  const maxPV = Math.max(...dailyData.map(d => d.pageViews), 1);

  const agentName = agentInfo?.name || legacyCompanyName || "エージェント";
  const backUrl = agentId ? `/dashboard/agent/${agentId}` : "/dashboard";

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={backUrl}
            className="flex items-center gap-1 text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">戻る</span>
          </Link>
          <div className="h-6 w-px bg-slate-200" />
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-rose-500" />
              解析ダッシュボード
            </h1>
            <p className="text-sm text-slate-500">{agentName}</p>
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

      {/* Pro制限バナー */}
      {!isPro && (
        <div className="bg-gradient-to-r from-purple-50 to-rose-50 rounded-2xl p-6 border border-purple-100">
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
      <div className="flex gap-2 overflow-x-auto pb-2">
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
                <Tooltip text="ページが表示された回数の合計" />
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {(summary.totalPV ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                <Users className="w-4 h-4" />
                セッション
                <Tooltip text="ユニークな訪問数（30分以内の再訪問は同一セッション）" />
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {(summary.sessions ?? 0).toLocaleString()}
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                <MessageCircle className="w-4 h-4" />
                チャット開始
                <Tooltip text="チャットウィジェットを開いた回数" />
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {(summary.chatOpens ?? 0).toLocaleString()}
              </div>
              <div className="flex items-center text-xs text-slate-500 mt-1">
                開始率 {summary.chatOpenRate ?? "0"}%
                <Tooltip text="セッション数に対するチャット開始数の割合" />
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500 text-sm mb-2">
                <Target className="w-4 h-4" />
                コンバージョン
                <Tooltip text="設定したコンバージョン目標が達成された回数" />
              </div>
              <div className="text-2xl font-bold text-slate-800">
                {(summary.conversions ?? 0).toLocaleString()}
              </div>
            </div>
          </div>

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
                  <th className="text-right px-4 py-3">
                    <span className="inline-flex items-center">
                      PV
                      <Tooltip text="そのページが表示された回数" />
                    </span>
                  </th>
                  <th className="text-right px-4 py-3">
                    <span className="inline-flex items-center">
                      チャット開始率
                      <Tooltip text="そのページでチャットを開いた割合" />
                    </span>
                  </th>
                  <th className="text-right px-4 py-3">
                    <span className="inline-flex items-center">
                      チャットCVR
                      <Tooltip text="チャット利用者のコンバージョン率" />
                    </span>
                  </th>
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

      {/* 質問分析タブ */}
      {activeTab === "questions" && isPro && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-800">質問ランキング</h3>
                <p className="text-sm text-slate-500 mt-1">ウェブサイトからの質問を頻度順に表示（管理画面テストは除外）</p>
              </div>
              <button
                onClick={exportQuestionsToCSV}
                disabled={questionRanking.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="CSVでダウンロード"
              >
                <Download className="w-4 h-4" />
                CSVダウンロード
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {questionRanking.map((q, i) => (
                <div key={i} className="p-4 hover:bg-slate-50">
                  <div className="flex items-start gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      i < 3 ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-600"
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 break-words">
                        {q.text.length > 150 ? q.text.slice(0, 150) + "..." : q.text}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        <span className="font-medium text-rose-600">{q.count}回</span>
                        <span>最終: {new Date(q.lastDate).toLocaleDateString("ja-JP")}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {questionRanking.length === 0 && (
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
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-center">
          {error}
        </div>
      )}
    </div>
  );
}

export default function AgentAnalyticsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-rose-500 mx-auto mb-4" />
          <p className="text-slate-600">読み込み中...</p>
        </div>
      </div>
    }>
      <AnalyticsContent />
    </Suspense>
  );
}
