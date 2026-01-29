"use client";

import { useState, useEffect, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, User, UserPlus, Loader2, Users } from "lucide-react";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // 招待情報
  const invitationId = searchParams.get("invitation");
  const inviteToken = searchParams.get("invite"); // URL共有リンクのトークン
  const [invitationInfo, setInvitationInfo] = useState<{
    agentName: string;
    email?: string;
    isLinkInvite?: boolean;
  } | null>(null);
  const [loadingInvitation, setLoadingInvitation] = useState(false);

  // 招待情報を取得
  useEffect(() => {
    if (invitationId) {
      // メール招待の場合
      setLoadingInvitation(true);
      fetch(`/api/invitations/${invitationId}`)
        .then((res) => res.json())
        .then((data) => {
          if (!data.error) {
            setInvitationInfo({
              agentName: data.agentName,
              email: data.email,
            });
            setEmail(data.email);
          }
        })
        .catch(console.error)
        .finally(() => setLoadingInvitation(false));
    } else if (inviteToken) {
      // URL共有リンクの場合
      setLoadingInvitation(true);
      fetch(`/api/invite/${inviteToken}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.valid) {
            setInvitationInfo({
              agentName: data.agentName,
              isLinkInvite: true,
            });
          }
        })
        .catch(console.error)
        .finally(() => setLoadingInvitation(false));
    }
  }, [invitationId, inviteToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }

    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください");
      return;
    }

    setLoading(true);

    try {
      // Register user
      const registerRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name,
          invitationId: invitationId || undefined,
          inviteToken: inviteToken || undefined,
        }),
      });

      const registerData = await registerRes.json();

      if (!registerRes.ok) {
        setError(registerData.error || "登録に失敗しました");
        setLoading(false);
        return;
      }

      // Auto login after registration
      const signInResult = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (signInResult?.error) {
        // Registration succeeded but login failed - redirect to login
        router.push("/login");
      } else {
        // セッションが確立されるまで少し待つ
        await new Promise(resolve => setTimeout(resolve, 500));

        // 招待がある場合は招待を受け入れる
        if (invitationId) {
          try {
            const acceptRes = await fetch(`/api/invitations/${invitationId}/accept`, {
              method: "POST",
            });
            const acceptData = await acceptRes.json();
            console.log("[Signup] Accept invitation result:", acceptRes.status, acceptData);
            if (acceptRes.ok && acceptData.agentId) {
              router.push(`/dashboard/agent/${acceptData.agentId}`);
              router.refresh();
              return;
            }
          } catch (e) {
            console.error("Failed to accept invitation:", e);
          }
        } else if (inviteToken) {
          // URL共有リンクの場合
          try {
            const acceptRes = await fetch(`/api/invite/${inviteToken}/accept`, {
              method: "POST",
            });
            const acceptData = await acceptRes.json();
            console.log("[Signup] Accept invite result:", acceptRes.status, acceptData);
            if (acceptRes.ok && acceptData.agentId) {
              router.push(`/dashboard/agent/${acceptData.agentId}`);
              router.refresh();
              return;
            }
          } catch (e) {
            console.error("Failed to accept invite:", e);
          }
        }
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("登録に失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  if (loadingInvitation) {
    return (
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-rose-100 p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-rose-100 overflow-hidden">
      {/* 招待バナー */}
      {invitationInfo && (
        <div className="bg-blue-50 px-5 py-4 border-b border-blue-100">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-800">
                エージェントへの招待が届いています
              </p>
              <p className="text-xs text-blue-600 mt-1">
                <strong>{invitationInfo.agentName}</strong> に招待されています。登録すると自動的に共有されます。
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="p-5 sm:p-8">
        <h2 className="text-lg sm:text-xl font-bold text-slate-800 text-center mb-4 sm:mb-6">
          新規登録
        </h2>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 sm:mb-6">
            <p className="text-red-700 text-xs sm:text-sm text-center">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <User className="w-4 h-4 text-rose-500" />
              お名前（任意）
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="山田 太郎"
              className="w-full border border-rose-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-300 transition-all"
              disabled={loading}
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Mail className="w-4 h-4 text-rose-500" />
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full border border-rose-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-300 transition-all disabled:bg-slate-100 disabled:text-slate-500"
              required
              disabled={loading || (!!invitationInfo && !invitationInfo.isLinkInvite)}
            />
            {invitationInfo && !invitationInfo.isLinkInvite && (
              <p className="text-xs text-slate-500 mt-1">
                招待されたメールアドレスで登録してください
              </p>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Lock className="w-4 h-4 text-rose-500" />
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8文字以上"
              className="w-full border border-rose-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-300 transition-all"
              required
              disabled={loading}
              minLength={8}
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Lock className="w-4 h-4 text-rose-500" />
              パスワード（確認）
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="もう一度入力"
              className="w-full border border-rose-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-300 transition-all"
              required
              disabled={loading}
              minLength={8}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-semibold text-white shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg, #D86672 0%, #D86672 100%)",
            }}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                登録中...
              </>
            ) : (
              <>
                <UserPlus className="w-5 h-5" />
                アカウント作成
              </>
            )}
          </button>
        </form>

        <div className="mt-4 sm:mt-6 text-center">
          <p className="text-xs sm:text-sm text-slate-600">
            既にアカウントをお持ちの方は{" "}
            <Link
              href={invitationId ? `/login?invitation=${invitationId}` : inviteToken ? `/login?invite=${inviteToken}` : "/login"}
              className="text-rose-600 hover:text-rose-700 font-semibold"
            >
              ログイン
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-rose-100 p-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
