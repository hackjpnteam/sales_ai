"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Share2,
  UserPlus,
  Trash2,
  Mail,
  Send,
  Loader2,
  Check,
  AlertTriangle,
  Copy,
  LogOut,
  Link,
  RefreshCw,
  X,
} from "lucide-react";
import { useAgent, type SharedUser } from "../AgentContext";
import { SectionCard } from "../shared";

type PendingInvitation = {
  invitationId: string;
  email: string;
  role: string;
  status: string;
};

export function ShareTab() {
  const { agent, company, refreshAgent } = useAgent();

  const [email, setEmail] = useState("");
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // 共有リンク関連
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [shareLinkLoading, setShareLinkLoading] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);

  // Check if current user is the owner
  const isOwner = !company?.isShared;

  // Fetch shared users
  const fetchSharedUsers = useCallback(async () => {
    if (!agent?.agentId) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${agent.agentId}/share`);
      if (res.ok) {
        const data = await res.json();
        setSharedUsers(data.sharedWith || []);
        setPendingInvitations(data.pendingInvitations || []);
      }
    } catch (error) {
      console.error("Failed to fetch shared users:", error);
    } finally {
      setLoading(false);
    }
  }, [agent?.agentId]);

  useEffect(() => {
    if (agent?.agentId && isOwner) {
      fetchSharedUsers();
    }
  }, [agent?.agentId, isOwner, fetchSharedUsers]);

  const handleShare = async () => {
    if (!email || !agent?.agentId) return;

    setSharing(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/agents/${agent.agentId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: "editor" }),
      });

      const data = await res.json();

      if (res.ok) {
        if (data.shared) {
          setSuccess(`${email} に共有しました`);
        } else if (data.needsInvitation) {
          setSuccess(`${email} に招待を送信しました。ユーザー登録後に共有されます。`);
        }
        setEmail("");
        fetchSharedUsers();
        refreshAgent();
      } else {
        setError(data.error || "共有に失敗しました");
      }
    } catch (error) {
      console.error("Failed to share agent:", error);
      setError("共有に失敗しました");
    } finally {
      setSharing(false);
    }
  };

  const handleRemoveShare = async (emailToRemove: string) => {
    if (!agent?.agentId) return;

    try {
      const res = await fetch(`/api/agents/${agent.agentId}/share`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToRemove }),
      });

      if (res.ok) {
        fetchSharedUsers();
        refreshAgent();
      }
    } catch (error) {
      console.error("Failed to remove share:", error);
    }
  };

  const handleLeaveShare = async () => {
    if (!agent?.agentId || !confirm("この共有エージェントへのアクセスを解除しますか？")) return;

    try {
      const res = await fetch(`/api/agents/${agent.agentId}/share/leave`, {
        method: "POST",
      });

      if (res.ok) {
        window.location.href = "/dashboard";
      } else {
        const data = await res.json();
        alert(data.error || "解除に失敗しました");
      }
    } catch (error) {
      console.error("Failed to leave share:", error);
      alert("解除に失敗しました");
    }
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/dashboard/agent/${agent?.agentId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 共有リンクを取得
  const fetchShareLink = useCallback(async () => {
    if (!agent?.agentId) return;

    try {
      const res = await fetch(`/api/agents/${agent.agentId}/share/link`);
      if (res.ok) {
        const data = await res.json();
        if (data.hasLink && data.token) {
          setShareLink(`${window.location.origin}/invite/${data.token}`);
        } else {
          setShareLink(null);
        }
      }
    } catch (error) {
      console.error("Failed to fetch share link:", error);
    }
  }, [agent?.agentId]);

  // 共有リンクを生成
  const handleGenerateShareLink = async () => {
    if (!agent?.agentId) return;

    setShareLinkLoading(true);
    try {
      const res = await fetch(`/api/agents/${agent.agentId}/share/link`, {
        method: "POST",
      });

      if (res.ok) {
        const data = await res.json();
        setShareLink(`${window.location.origin}/invite/${data.token}`);
      }
    } catch (error) {
      console.error("Failed to generate share link:", error);
    } finally {
      setShareLinkLoading(false);
    }
  };

  // 共有リンクを無効化
  const handleDisableShareLink = async () => {
    if (!agent?.agentId || !confirm("共有リンクを無効化しますか？")) return;

    setShareLinkLoading(true);
    try {
      const res = await fetch(`/api/agents/${agent.agentId}/share/link`, {
        method: "DELETE",
      });

      if (res.ok) {
        setShareLink(null);
      }
    } catch (error) {
      console.error("Failed to disable share link:", error);
    } finally {
      setShareLinkLoading(false);
    }
  };

  // 共有リンクをコピー
  const handleCopyShareLink = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
    setShareLinkCopied(true);
    setTimeout(() => setShareLinkCopied(false), 2000);
  };

  // 共有リンクを再生成
  const handleRegenerateShareLink = async () => {
    if (!confirm("新しいリンクを生成すると、以前のリンクは無効になります。続けますか？")) return;
    await handleGenerateShareLink();
  };

  useEffect(() => {
    if (agent?.agentId && isOwner) {
      fetchShareLink();
    }
  }, [agent?.agentId, isOwner, fetchShareLink]);

  if (!agent || !company) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  // If user is viewing a shared agent (not owner)
  if (!isOwner) {
    return (
      <SectionCard
        title="共有設定"
        description="このエージェントはあなたに共有されています"
        icon={<Share2 className="w-5 h-5" />}
      >
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 rounded-xl">
            <p className="text-sm text-slate-600">
              このエージェントはオーナーによってあなたに共有されています。
              エージェントの設定を編集できますが、共有設定の変更はできません。
            </p>
          </div>

          <button
            onClick={handleLeaveShare}
            className="flex items-center gap-2 px-4 py-2 text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-all"
          >
            <LogOut className="w-4 h-4" />
            共有から抜ける
          </button>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Share with email */}
      <SectionCard
        title="メンバーを招待"
        description="メールアドレスでチームメンバーを招待"
        icon={<UserPlus className="w-5 h-5" />}
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleShare()}
                placeholder="メールアドレスを入力"
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>
            <button
              onClick={handleShare}
              disabled={sharing || !email}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 text-white rounded-xl hover:from-rose-600 hover:to-rose-700 transition-all disabled:opacity-50"
            >
              {sharing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              招待
            </button>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-600 rounded-xl text-sm">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-50 text-green-600 rounded-xl text-sm">
              <Check className="w-4 h-4" />
              {success}
            </div>
          )}
        </div>
      </SectionCard>

      {/* URL Share Link */}
      <SectionCard
        title="URLで共有"
        description="リンクを知っている人なら誰でも共有できます"
        icon={<Link className="w-5 h-5" />}
      >
        {shareLink ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={shareLink}
                readOnly
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 truncate"
              />
              <button
                onClick={handleCopyShareLink}
                className={`flex items-center gap-2 px-4 py-2.5 border rounded-xl transition-all ${
                  shareLinkCopied
                    ? "bg-green-50 border-green-200 text-green-600"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {shareLinkCopied ? (
                  <>
                    <Check className="w-4 h-4" />
                    コピー済み
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    コピー
                  </>
                )}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRegenerateShareLink}
                disabled={shareLinkLoading}
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${shareLinkLoading ? "animate-spin" : ""}`} />
                リンクを再生成
              </button>
              <button
                onClick={handleDisableShareLink}
                disabled={shareLinkLoading}
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-all disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                無効化
              </button>
            </div>
            <p className="text-xs text-slate-500">
              このリンクにアクセスした人は、ログインまたは新規登録後にエージェントが共有されます。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              共有リンクを生成すると、リンクを知っている人なら誰でも登録後にエージェントにアクセスできます。
            </p>
            <button
              onClick={handleGenerateShareLink}
              disabled={shareLinkLoading}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 text-white rounded-xl hover:from-rose-600 hover:to-rose-700 transition-all disabled:opacity-50"
            >
              {shareLinkLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Link className="w-4 h-4" />
              )}
              共有リンクを生成
            </button>
          </div>
        )}
      </SectionCard>

      {/* Shared users */}
      <SectionCard
        title="共有中のメンバー"
        description={`${sharedUsers.length + pendingInvitations.length}人のメンバー`}
        icon={<Share2 className="w-5 h-5" />}
      >
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : sharedUsers.length === 0 && pendingInvitations.length === 0 ? (
          <div className="text-center py-8">
            <Share2 className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500">まだメンバーがいません</p>
            <p className="text-sm text-slate-400 mt-1">
              メールアドレスでメンバーを招待しましょう
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Active shared users */}
            {sharedUsers.map((user) => (
              <div
                key={user.email}
                className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-rose-400 to-rose-500 flex items-center justify-center text-white font-medium">
                    {user.email[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-slate-700">{user.email}</p>
                    <p className="text-xs text-slate-500">
                      {user.role === "editor" ? "編集者" : "閲覧者"} •{" "}
                      {new Date(user.addedAt).toLocaleDateString("ja-JP")}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveShare(user.email)}
                  className="p-2 text-red-500 hover:text-red-700 hover:bg-white rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {/* Pending invitations */}
            {pendingInvitations.filter(inv => inv.email).map((invitation) => (
              <div
                key={invitation.invitationId}
                className="flex items-center justify-between p-3 bg-amber-50 rounded-xl border border-amber-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-medium">
                    {invitation.email[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-slate-700">{invitation.email}</p>
                    <p className="text-xs text-amber-600">招待中（未登録ユーザー）</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
