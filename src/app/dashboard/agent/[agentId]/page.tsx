"use client";

import { useEffect, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  BarChart3,
  Trash2,
  Copy,
  Eye,
  Users,
  MessageCircle,
  Target,
} from "lucide-react";
import { useAgent } from "../../components/AgentContext";
import { TabNavigation, type TabId } from "../../components/TabNavigation";
import { PlanBadge } from "../../components/shared";
import {
  SettingsTab,
  TestTab,
  QuickButtonsTab,
  KnowledgeTab,
  PromptTab,
  DesignTab,
  EmbedTab,
  ShareTab,
  UsersTab,
  SecurityTab,
} from "../../components/tabs";

function AgentDetailContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();

  const agentId = params.agentId as string;
  const tab = (searchParams.get("tab") || "settings") as TabId;

  const {
    agent,
    company,
    loading,
    error,
    fetchAgent,
    isProOrHigher,
  } = useAgent();

  // Analytics state
  const [analytics, setAnalytics] = useState<{
    totalPV: number;
    uniqueVisitors: number;
    chatOpens: number;
    chatOpenRate: number;
    conversions: number;
  } | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Fetch agent on mount
  useEffect(() => {
    if (agentId && status === "authenticated") {
      fetchAgent(agentId);
    }
  }, [agentId, status, fetchAgent]);

  // Fetch analytics summary
  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!agent?.companyId) return;

      try {
        const res = await fetch(`/api/analytics/summary?companyId=${agent.companyId}&period=7days`);
        if (res.ok) {
          const data = await res.json();
          if (data.summary) {
            setAnalytics({
              totalPV: data.summary.totalPV || 0,
              uniqueVisitors: data.summary.sessions || data.summary.uniqueVisitors || 0,
              chatOpens: data.summary.chatOpens || 0,
              chatOpenRate: parseFloat(data.summary.chatOpenRate) || 0,
              conversions: data.summary.chatConversions || data.summary.conversions || 0,
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch analytics:", err);
      }
    };

    fetchAnalytics();
  }, [agent?.companyId]);

  // Handle delete agent
  const handleDelete = async () => {
    if (!agent || !confirm("このエージェントを削除しますか？この操作は取り消せません。")) {
      return;
    }

    try {
      const res = await fetch(`/api/agents/${agent.agentId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json();
        alert(data.error || "削除に失敗しました");
      }
    } catch (error) {
      console.error("Failed to delete agent:", error);
      alert("削除に失敗しました");
    }
  };

  // Handle duplicate agent
  const handleDuplicate = async () => {
    if (!agent) return;

    const newName = prompt("新しいエージェントの名前を入力してください", `${agent.name} (コピー)`);
    if (!newName) return;

    try {
      const res = await fetch(`/api/agents/${agent.agentId}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/dashboard/agent/${data.agentId}`);
      } else {
        const data = await res.json();
        alert(data.error || "複製に失敗しました");
      }
    } catch (error) {
      console.error("Failed to duplicate agent:", error);
      alert("複製に失敗しました");
    }
  };

  // Loading state
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

  // Error state
  if (error || !agent || !company) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <p className="text-slate-600 mb-4">{error || "エージェントが見つかりません"}</p>
          <Link
            href="/dashboard"
            className="text-rose-600 hover:text-rose-700"
          >
            ダッシュボードに戻る
          </Link>
        </div>
      </div>
    );
  }

  // Render tab content
  const renderTabContent = () => {
    switch (tab) {
      case "settings":
        return <SettingsTab />;
      case "test":
        return <TestTab />;
      case "quickbuttons":
        return <QuickButtonsTab />;
      case "knowledge":
        return <KnowledgeTab />;
      case "prompt":
        return <PromptTab />;
      case "design":
        return <DesignTab />;
      case "embed":
        return <EmbedTab />;
      case "share":
        return <ShareTab />;
      case "users":
        return <UsersTab />;
      case "security":
        return <SecurityTab />;
      default:
        return <SettingsTab />;
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">一覧に戻る</span>
          </Link>
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex items-center gap-3">
            {agent.avatarUrl && (
              <img
                src={agent.avatarUrl}
                alt=""
                className="w-10 h-10 rounded-full object-cover"
              />
            )}
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-800">
                {agent.name}
              </h1>
              <p className="text-sm text-slate-500 truncate max-w-[200px]">
                {company.rootUrl}
              </p>
            </div>
            <PlanBadge plan={company.plan || "free"} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Analytics link */}
          <Link
            href={`/dashboard/agent/${agent.agentId}/analytics`}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
          >
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">分析</span>
          </Link>

          {/* Duplicate */}
          <button
            onClick={handleDuplicate}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
          >
            <Copy className="w-4 h-4" />
            <span className="hidden sm:inline">複製</span>
          </button>

          {/* Delete (only for owner) */}
          {!company.isShared && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">削除</span>
            </button>
          )}
        </div>
      </div>

      {/* Analytics Summary */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href={`/dashboard/agent/${agent.agentId}/analytics`}
            className="bg-white rounded-xl border border-slate-200 p-4 hover:border-rose-200 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Eye className="w-4 h-4" />
              <span className="text-xs">PV（7日間）</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{analytics.totalPV.toLocaleString()}</p>
          </Link>
          <Link
            href={`/dashboard/agent/${agent.agentId}/analytics`}
            className="bg-white rounded-xl border border-slate-200 p-4 hover:border-rose-200 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Users className="w-4 h-4" />
              <span className="text-xs">セッション（7日間）</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{analytics.uniqueVisitors.toLocaleString()}</p>
          </Link>
          <Link
            href={`/dashboard/agent/${agent.agentId}/analytics`}
            className="bg-white rounded-xl border border-slate-200 p-4 hover:border-rose-200 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <MessageCircle className="w-4 h-4" />
              <span className="text-xs">チャット開始（7日間）</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{analytics.chatOpens.toLocaleString()}</p>
            <p className="text-xs text-slate-400 mt-0.5">開始率 {(Number(analytics.chatOpenRate) || 0).toFixed(2)}%</p>
          </Link>
          <Link
            href={`/dashboard/agent/${agent.agentId}/analytics`}
            className="bg-white rounded-xl border border-slate-200 p-4 hover:border-rose-200 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-2 text-slate-500 mb-1">
              <Target className="w-4 h-4" />
              <span className="text-xs">CV（7日間）</span>
            </div>
            <p className="text-2xl font-bold text-slate-800">{analytics.conversions.toLocaleString()}</p>
          </Link>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <TabNavigation
          agentId={agent.agentId}
          currentTab={tab}
          isProOrHigher={isProOrHigher}
        />

        {/* Tab Content */}
        <div className="p-4 sm:p-6">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
}

export default function AgentDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
        </div>
      }
    >
      <AgentDetailContent />
    </Suspense>
  );
}
