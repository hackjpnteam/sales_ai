"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Share2, Loader2, CheckCircle, XCircle, LogIn, UserPlus } from "lucide-react";
import Link from "next/link";

type InviteInfo = {
  valid: boolean;
  agentName?: string;
  companyName?: string;
  inviterName?: string;
  expiresAt?: string;
  error?: string;
};

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  // 招待情報を取得
  useEffect(() => {
    const fetchInviteInfo = async () => {
      try {
        const res = await fetch(`/api/invite/${token}`);
        const data = await res.json();

        if (res.ok) {
          setInviteInfo(data);
        } else {
          setInviteInfo({ valid: false, error: data.error || "招待が見つかりません" });
        }
      } catch {
        setInviteInfo({ valid: false, error: "招待情報の取得に失敗しました" });
      } finally {
        setLoading(false);
      }
    };

    // ログイン状態を確認
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/session");
        const data = await res.json();
        setIsLoggedIn(!!data?.user);
      } catch {
        setIsLoggedIn(false);
      }
    };

    fetchInviteInfo();
    checkAuth();
  }, [token]);

  // 招待を承認
  const handleAccept = async () => {
    setAccepting(true);
    setError("");

    try {
      const res = await fetch(`/api/invite/${token}/accept`, {
        method: "POST",
      });

      const data = await res.json();

      if (res.ok) {
        setAccepted(true);
        // 3秒後にダッシュボードに移動
        setTimeout(() => {
          router.push(`/dashboard/agent/${data.agentId}`);
        }, 2000);
      } else {
        setError(data.error || "招待の承認に失敗しました");
      }
    } catch {
      setError("招待の承認に失敗しました");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-rose-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-rose-500 mx-auto" />
          <p className="mt-4 text-slate-600">招待を確認中...</p>
        </div>
      </div>
    );
  }

  if (!inviteInfo?.valid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-rose-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">招待が無効です</h1>
          <p className="text-slate-600 mb-6">
            {inviteInfo?.error || "この招待リンクは無効か、期限切れです。"}
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 bg-rose-500 text-white rounded-xl hover:bg-rose-600 transition-colors"
          >
            ログインページへ
          </Link>
        </div>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-rose-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">共有が完了しました</h1>
          <p className="text-slate-600 mb-6">
            {inviteInfo.agentName}へのアクセスが許可されました。
            <br />
            ダッシュボードに移動します...
          </p>
          <Loader2 className="w-6 h-6 animate-spin text-rose-500 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-rose-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Share2 className="w-8 h-8 text-rose-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">エージェントの共有招待</h1>
          <p className="text-slate-600">
            あなたはエージェントへの招待を受けています
          </p>
        </div>

        <div className="bg-slate-50 rounded-xl p-4 mb-6">
          <div className="space-y-3">
            <div>
              <p className="text-sm text-slate-500">エージェント名</p>
              <p className="font-semibold text-slate-800">{inviteInfo.agentName}</p>
            </div>
            {inviteInfo.companyName && (
              <div>
                <p className="text-sm text-slate-500">会社名</p>
                <p className="font-medium text-slate-700">{inviteInfo.companyName}</p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 rounded-xl p-4 mb-6 text-sm">
            {error}
          </div>
        )}

        {isLoggedIn ? (
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-rose-500 to-rose-600 text-white rounded-xl hover:from-rose-600 hover:to-rose-700 transition-all disabled:opacity-50"
          >
            {accepting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                処理中...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                招待を承認する
              </>
            )}
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 text-center mb-4">
              招待を承認するにはログインまたは新規登録が必要です
            </p>
            <Link
              href={`/login?invite=${token}`}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-rose-500 to-rose-600 text-white rounded-xl hover:from-rose-600 hover:to-rose-700 transition-all"
            >
              <LogIn className="w-5 h-5" />
              ログインして承認
            </Link>
            <Link
              href={`/signup?invite=${token}`}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-all"
            >
              <UserPlus className="w-5 h-5" />
              新規登録して承認
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
