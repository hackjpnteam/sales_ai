"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Users,
  Building2,
  Bot,
  ArrowLeft,
  Loader2,
  ChevronDown,
  ChevronUp,
  Trash2,
  Save,
  Crown,
  Globe,
  MapPin,
  Monitor,
} from "lucide-react";

type Company = {
  companyId: string;
  name: string;
  plan: "free" | "lite" | "pro";
  planStartedAt?: string;
};

type Agent = {
  agentId: string;
  name: string;
  companyId: string;
};

type User = {
  userId: string;
  email: string;
  name?: string;
  createdAt: string;
  companies: Company[];
  agents: Agent[];
};

type GuestCompany = {
  companyId: string;
  name: string;
  rootUrl: string;
  plan: string;
  createdAt: string;
  creatorIp?: string;
  creatorUserAgent?: string;
  creatorLocation?: string;
  agents: { agentId: string; name: string }[];
};

const SUPER_ADMIN_EMAILS = ["tomura@hackjpn.com"];

export default function SuperAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [guestCompanies, setGuestCompanies] = useState<GuestCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [expandedGuest, setExpandedGuest] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<{
    companyId: string;
    plan: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const isSuperAdmin =
    session?.user?.email &&
    SUPER_ADMIN_EMAILS.includes(session.user.email.toLowerCase());

  useEffect(() => {
    if (status === "loading") return;

    if (!session?.user?.email) {
      router.push("/login");
      return;
    }

    if (!isSuperAdmin) {
      router.push("/dashboard");
      return;
    }

    fetchUsers();
  }, [session, status, router, isSuperAdmin]);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/superadmin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setGuestCompanies(data.guestCompanies || []);
      }
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlanChange = async (companyId: string, newPlan: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: newPlan }),
      });

      if (res.ok) {
        // ユーザーリストを更新
        setUsers((prev) =>
          prev.map((user) => ({
            ...user,
            companies: user.companies.map((c) =>
              c.companyId === companyId
                ? { ...c, plan: newPlan as "free" | "lite" | "pro" }
                : c
            ),
          }))
        );
        setEditingPlan(null);
      } else {
        alert("プランの更新に失敗しました");
      }
    } catch (error) {
      console.error("Failed to update plan:", error);
      alert("プランの更新に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCompany = async (companyId: string, companyName: string, isGuest = false) => {
    if (
      !confirm(
        `「${companyName}」を削除しますか？\n\nこの操作は取り消せません。関連するすべてのデータが削除されます。`
      )
    ) {
      return;
    }

    setDeleting(companyId);
    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        if (isGuest) {
          // ゲストリストを更新
          setGuestCompanies((prev) =>
            prev.filter((c) => c.companyId !== companyId)
          );
        } else {
          // ユーザーリストを更新
          setUsers((prev) =>
            prev.map((user) => ({
              ...user,
              companies: user.companies.filter((c) => c.companyId !== companyId),
              agents: user.agents.filter((a) => a.companyId !== companyId),
            }))
          );
        }
      } else {
        alert("削除に失敗しました");
      }
    } catch (error) {
      console.error("Failed to delete company:", error);
      alert("削除に失敗しました");
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPlanBadge = (plan: string) => {
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
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background:
            "linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        }}
      >
        <div className="flex items-center gap-3 text-amber-400">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="font-medium">読み込み中...</span>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "linear-gradient(180deg, #F1E8F0 0%, #E8DDE7 50%, #DFD4DE 100%)",
      }}
    >
      {/* ヘッダー */}
      <header className="px-4 sm:px-6 py-3 sm:py-4" style={{ background: "linear-gradient(135deg, #D86672 0%, #D86672 100%)" }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-white/20 backdrop-blur-sm text-white text-xs sm:text-sm font-medium hover:bg-white/30 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">戻る</span>
            </button>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <h1 className="text-white font-bold text-base sm:text-xl tracking-tight flex items-center gap-1.5 sm:gap-2">
                  <Crown className="w-4 h-4 sm:w-5 sm:h-5 text-amber-300" />
                  Super Admin
                </h1>
                <p className="text-white/70 text-[10px] sm:text-xs hidden sm:block">システム管理者専用</p>
              </div>
            </div>
          </div>
          <div className="text-white/70 text-xs sm:text-sm truncate max-w-[120px] sm:max-w-none">{session?.user?.email}</div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* 統計 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-8">
          <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-6 border border-rose-100 shadow-sm">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-rose-100 flex items-center justify-center">
                <Users className="w-4 h-4 sm:w-6 sm:h-6 text-rose-500" />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] sm:text-sm">登録ユーザー</p>
                <p className="text-slate-800 text-lg sm:text-2xl font-bold">{users.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-6 border border-rose-100 shadow-sm">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-slate-100 flex items-center justify-center">
                <Globe className="w-4 h-4 sm:w-6 sm:h-6 text-slate-500" />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] sm:text-sm">ゲスト作成</p>
                <p className="text-slate-800 text-lg sm:text-2xl font-bold">{guestCompanies.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-6 border border-rose-100 shadow-sm">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-blue-100 flex items-center justify-center">
                <Building2 className="w-4 h-4 sm:w-6 sm:h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] sm:text-sm">総会社数</p>
                <p className="text-slate-800 text-lg sm:text-2xl font-bold">
                  {users.reduce((sum, u) => sum + u.companies.length, 0) + guestCompanies.length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-6 border border-rose-100 shadow-sm">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-purple-100 flex items-center justify-center">
                <Bot className="w-4 h-4 sm:w-6 sm:h-6 text-purple-500" />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] sm:text-sm">エージェント数</p>
                <p className="text-slate-800 text-lg sm:text-2xl font-bold">
                  {users.reduce((sum, u) => sum + u.agents.length, 0) + guestCompanies.reduce((sum, g) => sum + g.agents.length, 0)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ユーザー一覧 */}
        <div className="bg-white rounded-xl sm:rounded-2xl border border-rose-100 shadow-sm overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-rose-100">
            <h2 className="text-slate-800 font-semibold flex items-center gap-2 text-sm sm:text-base">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" />
              登録ユーザー一覧
            </h2>
          </div>

          <div className="divide-y divide-rose-100">
            {users.length === 0 ? (
              <div className="p-6 sm:p-8 text-center text-slate-400">
                ユーザーがいません
              </div>
            ) : (
              users.map((user) => (
                <div key={user.userId} className="bg-white">
                  <button
                    onClick={() =>
                      setExpandedUser(
                        expandedUser === user.userId ? null : user.userId
                      )
                    }
                    className="w-full p-3 sm:p-4 flex items-center justify-between hover:bg-rose-50 transition-all"
                  >
                    <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-rose-400 to-rose-600 flex items-center justify-center text-white font-bold text-sm sm:text-base flex-shrink-0">
                        {user.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-left min-w-0">
                        <p className="text-slate-800 font-medium text-sm sm:text-base truncate">{user.email}</p>
                        <p className="text-slate-500 text-xs sm:text-sm truncate">
                          {user.name || "名前未設定"} • 登録:{" "}
                          {formatDate(user.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
                      <div className="text-right text-slate-500 text-xs sm:text-sm hidden sm:block">
                        <span className="mr-3">
                          会社: {user.companies.length}
                        </span>
                        <span>エージェント: {user.agents.length}</span>
                      </div>
                      {expandedUser === user.userId ? (
                        <ChevronUp className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {expandedUser === user.userId && (
                    <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2 sm:space-y-3">
                      {user.companies.length === 0 ? (
                        <p className="text-slate-400 text-xs sm:text-sm pl-10 sm:pl-14">
                          会社がありません
                        </p>
                      ) : (
                        user.companies.map((company) => (
                          <div
                            key={company.companyId}
                            className="ml-10 sm:ml-14 p-3 sm:p-4 bg-rose-50 rounded-lg sm:rounded-xl"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <p className="text-slate-800 font-medium flex items-center gap-2 text-sm sm:text-base">
                                  <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" />
                                  {company.name}
                                </p>
                                <p className="text-slate-500 text-[10px] sm:text-xs mt-1 truncate">
                                  ID: {company.companyId}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                {editingPlan?.companyId === company.companyId ? (
                                  <div className="flex items-center gap-2">
                                    <select
                                      value={editingPlan.plan}
                                      onChange={(e) =>
                                        setEditingPlan({
                                          ...editingPlan,
                                          plan: e.target.value,
                                        })
                                      }
                                      className="px-3 py-1 rounded-lg bg-white/20 text-white text-sm border border-white/30"
                                    >
                                      <option value="free" className="text-black">
                                        FREE
                                      </option>
                                      <option value="lite" className="text-black">
                                        LITE
                                      </option>
                                      <option value="pro" className="text-black">
                                        PRO
                                      </option>
                                    </select>
                                    <button
                                      onClick={() =>
                                        handlePlanChange(
                                          company.companyId,
                                          editingPlan.plan
                                        )
                                      }
                                      disabled={saving}
                                      className="p-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-all disabled:opacity-50"
                                    >
                                      {saving ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Save className="w-4 h-4" />
                                      )}
                                    </button>
                                    <button
                                      onClick={() => setEditingPlan(null)}
                                      className="p-2 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 transition-all"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      onClick={() =>
                                        setEditingPlan({
                                          companyId: company.companyId,
                                          plan: company.plan,
                                        })
                                      }
                                      className="hover:opacity-80 transition-opacity"
                                    >
                                      {getPlanBadge(company.plan)}
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleDeleteCompany(
                                          company.companyId,
                                          company.name
                                        )
                                      }
                                      disabled={deleting === company.companyId}
                                      className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-50"
                                    >
                                      {deleting === company.companyId ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="w-4 h-4" />
                                      )}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* エージェント一覧 */}
                            <div className="mt-3 space-y-2">
                              {user.agents
                                .filter((a) => a.companyId === company.companyId)
                                .map((agent) => (
                                  <div
                                    key={agent.agentId}
                                    className="flex items-center gap-2 text-white/60 text-sm"
                                  >
                                    <Bot className="w-3 h-3 text-purple-400" />
                                    {agent.name}
                                  </div>
                                ))}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ゲストユーザー（未登録）一覧 */}
        <div className="bg-white/10 backdrop-blur-sm rounded-2xl border border-white/20 overflow-hidden mt-8">
          <div className="p-4 border-b border-white/10">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Globe className="w-5 h-5 text-slate-400" />
              未登録ユーザー作成エージェント
              <span className="text-white/50 text-sm font-normal ml-2">
                （アカウント未作成でエージェントを作成したユーザー）
              </span>
            </h2>
          </div>

          <div className="divide-y divide-white/10">
            {guestCompanies.length === 0 ? (
              <div className="p-8 text-center text-white/50">
                未登録ユーザーの作成したエージェントはありません
              </div>
            ) : (
              guestCompanies.map((guest) => (
                <div key={guest.companyId} className="bg-white/5">
                  <button
                    onClick={() =>
                      setExpandedGuest(
                        expandedGuest === guest.companyId ? null : guest.companyId
                      )
                    }
                    className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center text-white font-bold">
                        ?
                      </div>
                      <div className="text-left">
                        <p className="text-white font-medium">{guest.name}</p>
                        <p className="text-white/50 text-sm">
                          作成: {formatDate(guest.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-white/60 text-sm flex flex-col items-end gap-1">
                        {guest.creatorLocation && (
                          <span className="flex items-center gap-1 text-amber-400">
                            <MapPin className="w-3 h-3" />
                            {guest.creatorLocation}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs">
                          IP: {guest.creatorIp || "不明"}
                        </span>
                      </div>
                      {expandedGuest === guest.companyId ? (
                        <ChevronUp className="w-5 h-5 text-white/50" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-white/50" />
                      )}
                    </div>
                  </button>

                  {expandedGuest === guest.companyId && (
                    <div className="px-4 pb-4">
                      <div className="ml-14 p-4 bg-white/10 rounded-xl">
                        <div className="flex items-center justify-between">
                          <div className="space-y-2">
                            <p className="text-white font-medium flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-blue-400" />
                              {guest.name}
                            </p>
                            <p className="text-white/50 text-xs">
                              URL: {guest.rootUrl}
                            </p>
                            <p className="text-white/50 text-xs">
                              ID: {guest.companyId}
                            </p>
                            <div className="flex flex-col gap-2 text-white/50 text-xs mt-2">
                              <div className="flex items-center gap-4">
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  IP: {guest.creatorIp || "不明"}
                                </span>
                                {guest.creatorLocation && (
                                  <span className="flex items-center gap-1 text-amber-400">
                                    📍 {guest.creatorLocation}
                                  </span>
                                )}
                              </div>
                              {guest.creatorUserAgent && (
                                <span className="flex items-center gap-1 truncate max-w-[400px]" title={guest.creatorUserAgent}>
                                  <Monitor className="w-3 h-3" />
                                  {guest.creatorUserAgent.length > 60
                                    ? guest.creatorUserAgent.substring(0, 60) + "..."
                                    : guest.creatorUserAgent}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {getPlanBadge(guest.plan)}
                            <button
                              onClick={() =>
                                handleDeleteCompany(
                                  guest.companyId,
                                  guest.name,
                                  true
                                )
                              }
                              disabled={deleting === guest.companyId}
                              className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all disabled:opacity-50"
                            >
                              {deleting === guest.companyId ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* エージェント一覧 */}
                        <div className="mt-3 space-y-2">
                          {guest.agents.map((agent) => (
                            <div
                              key={agent.agentId}
                              className="flex items-center gap-2 text-white/60 text-sm"
                            >
                              <Bot className="w-3 h-3 text-purple-400" />
                              {agent.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
