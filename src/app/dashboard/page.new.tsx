"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSession, signOut } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Globe,
  Zap,
  LogOut,
  Loader2,
  MessageCircle,
  ChevronRight,
  Shield,
  Trash2,
  Users,
  BarChart3,
  Sparkles,
  CreditCard,
} from "lucide-react";
import { PlanBadge } from "./components/shared";

const SUPER_ADMIN_EMAILS = ["tomura@hackjpn.com"];

type Agent = {
  agentId: string;
  companyId: string;
  name: string;
  welcomeMessage: string;
  voiceEnabled: boolean;
  themeColor: string;
  avatarUrl?: string;
  createdAt: Date;
};

type Company = {
  companyId: string;
  name: string;
  rootUrl: string;
  language: string;
  plan?: "free" | "lite" | "pro" | "max";
  isShared?: boolean;
  createdAt: Date;
  updatedAt?: Date;
  agents: Agent[];
};

type ProgressEvent = {
  type: "discovering" | "crawling" | "embedding" | "saving" | "complete" | "error";
  currentUrl?: string;
  currentPage?: number;
  totalPages?: number;
  percent?: number;
  message?: string;
  companyId?: string;
  agentId?: string;
};

// プラン優先度（高いほど上位）
const planPriority: Record<string, number> = {
  max: 4,
  pro: 3,
  lite: 2,
  free: 1,
};

// 会社をソートする関数（有料プラン優先、直近編集順）
const sortCompanies = (companies: Company[]): Company[] => {
  return [...companies].sort((a, b) => {
    const planA = planPriority[a.plan || "free"] || 0;
    const planB = planPriority[b.plan || "free"] || 0;
    if (planA !== planB) return planB - planA;
    const dateA = new Date(a.updatedAt || a.createdAt).getTime();
    const dateB = new Date(b.updatedAt || b.createdAt).getTime();
    return dateB - dateA;
  });
};

// プランごとのエージェント作成上限
const AGENT_LIMITS: Record<string, number> = {
  free: 1,
  lite: 1,
  pro: 1,
  max: 5,
};

function DashboardContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [sharedCompanies, setSharedCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [maxPlanCount, setMaxPlanCount] = useState(0);

  // 新規作成フォーム
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [rootUrl, setRootUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [progress, setProgress] = useState<ProgressEvent | null>(null);

  // 削除
  const [deletingAgent, setDeletingAgent] = useState<string | null>(null);

  // プラン変更
  const [changingPlanCompany, setChangingPlanCompany] = useState<string | null>(null);

  const [hasFetched, setHasFetched] = useState(false);

  const fetchCompanies = useCallback(async (force = false) => {
    if (hasFetched && !force) return;

    try {
      const res = await fetch("/api/user/companies");
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies || []);
        setSharedCompanies(data.sharedCompanies || []);
        setMaxPlanCount(data.maxPlanCount || 0);
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
      const res = await fetch("/api/stripe/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, plan }),
      });

      if (res.ok) {
        await fetchCompanies(true);
        router.replace("/dashboard");
      }
    } catch (error) {
      console.error("Payment verification error:", error);
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

  // エージェント作成
  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rootUrl.trim()) return;

    setCreating(true);
    setCreateError("");
    setProgress(null);

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootUrl: rootUrl.trim() }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        setCreateError(errorData.error || "作成に失敗しました");
        setCreating(false);
        return;
      }

      // SSEストリーミングを読み取る
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        setCreateError("ストリーミングに失敗しました");
        setCreating(false);
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
              const data: ProgressEvent = JSON.parse(line.slice(6));

              if (data.type === "complete") {
                if (data.companyId && data.agentId) {
                  await fetchCompanies(true);
                  setShowCreateForm(false);
                  setRootUrl("");
                  setProgress(null);
                  // Navigate to the new agent
                  router.push(`/dashboard/agent/${data.agentId}`);
                }
              } else if (data.type === "error") {
                setCreateError(data.message || "作成中にエラーが発生しました");
              } else {
                setProgress(data);
              }
            } catch (e) {
              console.error("Failed to parse SSE data:", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Create agent error:", error);
      setCreateError("エラーが発生しました");
    } finally {
      setCreating(false);
    }
  };

  // エージェント削除
  const handleDeleteAgent = async (agentId: string, companyName: string) => {
    if (!confirm(`「${companyName}」のエージェントを削除しますか？\n\nこの操作は取り消せません。`)) {
      return;
    }

    setDeletingAgent(agentId);
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
      if (res.ok) {
        await fetchCompanies(true);
      } else {
        const data = await res.json();
        alert(data.error || "削除に失敗しました");
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("削除に失敗しました");
    } finally {
      setDeletingAgent(null);
    }
  };

  // Maxプランへの変更
  const handleChangePlan = async (companyId: string, newPlan: string) => {
    setChangingPlanCompany(companyId);
    try {
      const res = await fetch("/api/company/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, plan: newPlan }),
      });

      if (res.ok) {
        await fetchCompanies(true);
      } else {
        const data = await res.json();
        alert(data.error || "プラン変更に失敗しました");
      }
    } catch (error) {
      console.error("Plan change error:", error);
    } finally {
      setChangingPlanCompany(null);
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

  // エージェント上限計算
  const planCounts: Record<string, number> = { free: 0, lite: 0, pro: 0, max: 0 };
  for (const company of companies) {
    const companyPlan = company.plan || "free";
    planCounts[companyPlan] = (planCounts[companyPlan] || 0) + 1;
  }

  const paidAgentLimit = planCounts.lite + planCounts.pro;
  const maxAgentLimit = Math.max(maxPlanCount, planCounts.max > 0 ? 1 : 0) * 5;
  const agentLimit = paidAgentLimit + maxAgentLimit;
  const currentAgentCount = companies.reduce((sum, c) => sum + c.agents.length, 0);
  const canCreateMore = agentLimit === 0 || currentAgentCount < agentLimit;

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

      {/* エージェント数と新規作成 */}
      <div className="mb-4 sm:mb-6">
        <div className="flex flex-wrap items-center gap-4 mb-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span className="font-medium">エージェント:</span>
            <span className={`font-bold ${!canCreateMore ? "text-red-500" : "text-slate-800"}`}>
              {currentAgentCount} / {agentLimit === 0 ? "無制限" : agentLimit}
            </span>
          </div>
          {!canCreateMore && maxPlanCount === 0 && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
              Maxプランで+5枠追加可能
            </span>
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
              <input
                type="text"
                value={rootUrl}
                onChange={(e) => setRootUrl(e.target.value)}
                placeholder="example.com または https://example.com"
                className="w-full border border-rose-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                required
                disabled={creating}
              />

              {progress && (
                <div className="bg-rose-50 rounded-xl p-4 border border-rose-100">
                  <div className="flex items-center gap-3 mb-3">
                    <Loader2 className="w-6 h-6 text-rose-500 animate-spin" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{progress.message || "処理中..."}</p>
                      {progress.currentUrl && (
                        <p className="text-xs text-slate-500 truncate">{progress.currentUrl}</p>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-rose-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-rose-500 h-full rounded-full transition-all"
                      style={{ width: `${progress.percent || 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-slate-500">
                    <span>{progress.currentPage || 0} / {progress.totalPages || 30} ページ</span>
                    <span>{progress.percent || 0}%</span>
                  </div>
                </div>
              )}

              {createError && <p className="text-red-600 text-sm">{createError}</p>}

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

      {/* エージェント一覧 */}
      {companies.filter(c => !c.isShared).length === 0 && !showCreateForm ? (
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
        <div className="space-y-3">
          {sortCompanies(companies.filter(c => !c.isShared)).map((company) => {
            const agent = company.agents[0];
            if (!agent) return null;

            return (
              <Link
                key={company.companyId}
                href={`/dashboard/agent/${agent.agentId}`}
                className="block bg-white rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 hover:border-rose-200 hover:shadow-md transition-all"
              >
                <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    {/* Avatar/Icon */}
                    <div
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                      style={{ backgroundColor: agent.themeColor + "20" }}
                    >
                      {agent.avatarUrl ? (
                        <img src={agent.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Globe className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: agent.themeColor }} />
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-800 truncate">{agent.name}</h3>
                      <p className="text-xs sm:text-sm text-slate-500 truncate">{company.rootUrl}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    {/* Plan badge with change option for Max users */}
                    <div className="flex items-center gap-1">
                      <PlanBadge plan={company.plan || "free"} />
                      {maxPlanCount > 0 && (!company.plan || company.plan === "free") && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleChangePlan(company.companyId, "max");
                          }}
                          disabled={changingPlanCompany === company.companyId}
                          className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200 transition-colors"
                        >
                          {changingPlanCompany === company.companyId ? "..." : "→Max"}
                        </button>
                      )}
                      {company.plan === "max" && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (confirm("このエージェントをFreeプランに戻しますか？")) {
                              handleChangePlan(company.companyId, "free");
                            }
                          }}
                          disabled={changingPlanCompany === company.companyId}
                          className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                        >
                          {changingPlanCompany === company.companyId ? "..." : "→Free"}
                        </button>
                      )}
                    </div>

                    {/* Analytics link */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.push(`/dashboard/agent/${agent.agentId}/analytics`);
                      }}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all"
                      title="分析"
                    >
                      <BarChart3 className="w-4 h-4" />
                    </button>

                    {/* Delete */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteAgent(agent.agentId, company.name);
                      }}
                      disabled={deletingAgent === agent.agentId}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-50"
                      title="削除"
                    >
                      {deletingAgent === agent.agentId ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>

                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* 共有されたエージェント */}
      {sharedCompanies.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            共有されたエージェント
          </h3>
          <div className="space-y-3">
            {sharedCompanies.map((company) => {
              const agent = company.agents[0];
              if (!agent) return null;

              return (
                <Link
                  key={company.companyId}
                  href={`/dashboard/agent/${agent.agentId}`}
                  className="block bg-white rounded-xl sm:rounded-2xl shadow-sm border border-blue-100 hover:border-blue-200 hover:shadow-md transition-all"
                >
                  <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                      <div
                        className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
                        style={{ backgroundColor: agent.themeColor + "20" }}
                      >
                        {agent.avatarUrl ? (
                          <img src={agent.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Globe className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: agent.themeColor }} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-slate-800 truncate">{agent.name}</h3>
                        <p className="text-xs sm:text-sm text-slate-500 truncate">{company.rootUrl}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        共有
                      </span>
                      <PlanBadge plan={company.plan || "free"} />
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
