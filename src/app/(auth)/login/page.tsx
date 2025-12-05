"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, LogIn, Loader2 } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("メールアドレスまたはパスワードが正しくありません");
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError("ログインに失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-rose-100 p-5 sm:p-8">
      <h2 className="text-lg sm:text-xl font-bold text-slate-800 text-center mb-4 sm:mb-6">
        ログイン
      </h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 sm:mb-6">
          <p className="text-red-700 text-xs sm:text-sm text-center">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
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
            className="w-full border border-rose-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-300 transition-all"
            required
            disabled={loading}
          />
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
            placeholder="••••••••"
            className="w-full border border-rose-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-300 transition-all"
            required
            disabled={loading}
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
              ログイン中...
            </>
          ) : (
            <>
              <LogIn className="w-5 h-5" />
              ログイン
            </>
          )}
        </button>
      </form>

      <div className="mt-4 sm:mt-6 text-center">
        <p className="text-xs sm:text-sm text-slate-600">
          アカウントをお持ちでない方は{" "}
          <Link
            href="/signup"
            className="text-rose-600 hover:text-rose-700 font-semibold"
          >
            新規登録
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-rose-100 p-5 sm:p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-rose-500" />
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
