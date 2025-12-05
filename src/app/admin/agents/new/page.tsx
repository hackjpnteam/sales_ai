"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowLeft, Globe, Zap, Bot, Palette, Volume2 } from "lucide-react";

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

export default function NewAgentPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    companyName: "",
    rootUrl: "",
    agentName: "",
    welcomeMessage: "こんにちは！何かお手伝いできることはありますか？",
    themeColor: "#FF6FB1",
    voiceEnabled: true,
  });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setProgress(null);

    let normalizedUrl = formData.rootUrl.trim();
    if (!normalizedUrl.match(/^https?:\/\//i)) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: formData.companyName || formData.agentName,
          rootUrl: normalizedUrl,
          language: "ja",
          agentName: formData.agentName,
          welcomeMessage: formData.welcomeMessage,
          themeColor: formData.themeColor,
          voiceEnabled: formData.voiceEnabled,
        }),
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
                setTimeout(() => {
                  router.push("/dashboard");
                }, 2000);
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

  return (
    <div
      className="min-h-screen"
      style={{
        background: "linear-gradient(180deg, #fff7fb 0%, #ffe9f4 50%, #ffd6eb 100%)",
      }}
    >
      {/* ヘッダー */}
      <header
        className="px-6 py-4"
        style={{
          background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 50%, #FF7C8F 100%)",
        }}
      >
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/20 backdrop-blur-sm text-white text-sm font-medium hover:bg-white/30 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-tight">新規エージェント作成</h1>
              <p className="text-white/70 text-xs">Powered by hackjpn ver 2.1</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-lg border border-pink-100 p-8 space-y-6"
        >
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Globe className="w-4 h-4 text-pink-500" />
              サイトURL <span className="text-pink-500">*</span>
            </label>
            <input
              type="text"
              value={formData.rootUrl}
              onChange={(e) =>
                setFormData({ ...formData, rootUrl: e.target.value })
              }
              placeholder="example.com または https://example.com"
              className="w-full border border-pink-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 transition-all"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Bot className="w-4 h-4 text-pink-500" />
              エージェント名 <span className="text-pink-500">*</span>
            </label>
            <input
              type="text"
              value={formData.agentName}
              onChange={(e) =>
                setFormData({ ...formData, agentName: e.target.value })
              }
              placeholder="例: サポートAI"
              className="w-full border border-pink-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 transition-all"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              <Sparkles className="w-4 h-4 text-pink-500" />
              会社名（省略可）
            </label>
            <input
              type="text"
              value={formData.companyName}
              onChange={(e) =>
                setFormData({ ...formData, companyName: e.target.value })
              }
              placeholder="例: 株式会社サンプル"
              className="w-full border border-pink-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 transition-all"
              disabled={loading}
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
              ウェルカムメッセージ
            </label>
            <textarea
              value={formData.welcomeMessage}
              onChange={(e) =>
                setFormData({ ...formData, welcomeMessage: e.target.value })
              }
              rows={2}
              className="w-full border border-pink-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 transition-all resize-none"
              disabled={loading}
            />
          </div>

          <div className="flex gap-6">
            <div className="flex-1">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Palette className="w-4 h-4 text-pink-500" />
                テーマカラー
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.themeColor}
                  onChange={(e) =>
                    setFormData({ ...formData, themeColor: e.target.value })
                  }
                  className="h-10 w-16 border border-pink-200 rounded-lg cursor-pointer"
                  disabled={loading}
                />
                <span className="text-sm text-slate-500">{formData.themeColor}</span>
              </div>
            </div>

            <div className="flex-1">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Volume2 className="w-4 h-4 text-pink-500" />
                音声機能
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-pink-50 rounded-xl">
                <input
                  type="checkbox"
                  checked={formData.voiceEnabled}
                  onChange={(e) =>
                    setFormData({ ...formData, voiceEnabled: e.target.checked })
                  }
                  className="w-5 h-5 rounded border-pink-300 text-pink-500 focus:ring-pink-300"
                  disabled={loading}
                />
                <span className="text-sm text-slate-600">有効にする</span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-xl font-semibold text-white shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            style={{
              background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)",
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

        {/* 進捗表示 */}
        {loading && progress && (
          <div className="mt-8 bg-white rounded-2xl shadow-lg border border-pink-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-pink-500" />
                サイト解析中...
              </h3>
              <span
                className="text-2xl font-bold bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)" }}
              >
                {progress.percent || 0}%
              </span>
            </div>

            <div className="w-full bg-pink-100 rounded-full h-3 overflow-hidden mb-4">
              <div
                className="h-3 rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${progress.percent || 0}%`,
                  background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)",
                }}
              />
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-600 mb-4 min-w-0">
              <div className="animate-pulse text-lg flex-shrink-0">
                {progress.type === "discovering" && "🔍"}
                {progress.type === "crawling" && "📄"}
                {progress.type === "embedding" && "🧠"}
                {progress.type === "saving" && "💾"}
              </div>
              <span className="truncate">{progress.message}</span>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-pink-100">
              <div className="text-center bg-pink-50 rounded-xl p-3">
                <div className="text-2xl font-bold text-pink-600">
                  {progress.currentPage || 0}
                </div>
                <div className="text-xs text-slate-500">解析済みページ</div>
              </div>
              <div className="text-center bg-pink-50 rounded-xl p-3">
                <div className="text-2xl font-bold text-pink-600">
                  {progress.chunksFound || 0}
                </div>
                <div className="text-xs text-slate-500">抽出データ数</div>
              </div>
            </div>
          </div>
        )}

        {/* 完了メッセージ */}
        {progress?.type === "complete" && (
          <div
            className="mt-8 rounded-2xl p-6 text-white"
            style={{
              background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)",
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">エージェント作成完了!</h3>
                <p className="text-white/80 text-sm">管理画面に戻ります...</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-8 bg-red-50 border border-red-200 rounded-2xl p-4">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}
      </main>
    </div>
  );
}
