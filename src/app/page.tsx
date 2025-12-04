"use client";

import { useState } from "react";
import { Sparkles, Globe, Zap, ArrowRight, Copy, ExternalLink, Languages, MessageCircle, X } from "lucide-react";

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

export default function Home() {
  const [rootUrl, setRootUrl] = useState("");
  const [language, setLanguage] = useState<"ja" | "en">("ja");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [result, setResult] = useState<{
    companyId: string;
    agentId: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [widgetOpen, setWidgetOpen] = useState(false);

  const getCompanyNameFromUrl = (url: string): string => {
    try {
      let normalizedUrl = url.trim();
      if (!normalizedUrl.match(/^https?:\/\//i)) {
        normalizedUrl = "https://" + normalizedUrl;
      }
      const hostname = new URL(normalizedUrl).hostname;
      return hostname.replace(/^www\./, "").split(".")[0];
    } catch {
      return "サイト";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setProgress(null);

    let normalizedUrl = rootUrl.trim();
    if (!normalizedUrl.match(/^https?:\/\//i)) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    const companyName = getCompanyNameFromUrl(normalizedUrl);

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, rootUrl: normalizedUrl, language }),
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
                setResult({
                  companyId: data.companyId!,
                  agentId: data.agentId!,
                });
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

  const widgetBaseUrl =
    typeof window !== "undefined"
      ? window.location.origin + "/widget"
      : "http://localhost:4000/widget";

  const companyName = getCompanyNameFromUrl(rootUrl);

  const embedCode = result
    ? `<script
  src="${typeof window !== "undefined" ? window.location.origin : "http://localhost:4000"}/widget.js"
  data-company-id="${result.companyId}"
  data-agent-name="${companyName} AI"
  data-widget-base-url="${widgetBaseUrl}"
  defer
></script>`
    : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-tight">ChatSales AI</h1>
              <p className="text-white/70 text-xs">接客AIエージェント管理</p>
            </div>
          </div>
          <a
            href="/admin"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 backdrop-blur-sm text-white text-sm font-medium hover:bg-white/30 transition-all"
          >
            管理画面
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-12">
        {/* イントロ */}
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-slate-800 mb-3">
            URLを入れるだけで<br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)" }}
            >
              AIチャットボット
            </span>
            が完成
          </h2>
          <p className="text-slate-600">
            サイトを自動クロールして、RAGチャットボットを生成します
          </p>
        </div>

        {/* メインフォーム */}
        <div className="bg-white rounded-3xl shadow-xl border border-pink-100 p-8 mb-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Globe className="w-4 h-4 text-pink-500" />
                サイトURL
              </label>
              <input
                type="text"
                value={rootUrl}
                onChange={(e) => setRootUrl(e.target.value)}
                placeholder="example.com または https://example.com"
                className="w-full border border-pink-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300 transition-all"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2">
                <Languages className="w-4 h-4 text-pink-500" />
                対応言語
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setLanguage("ja")}
                  disabled={loading}
                  className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all border ${
                    language === "ja"
                      ? "bg-pink-500 text-white border-pink-500 shadow-md"
                      : "bg-white text-slate-700 border-pink-200 hover:border-pink-400"
                  } disabled:opacity-50`}
                >
                  🇯🇵 日本語
                </button>
                <button
                  type="button"
                  onClick={() => setLanguage("en")}
                  disabled={loading}
                  className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all border ${
                    language === "en"
                      ? "bg-pink-500 text-white border-pink-500 shadow-md"
                      : "bg-white text-slate-700 border-pink-200 hover:border-pink-400"
                  } disabled:opacity-50`}
                >
                  🇺🇸 English
                </button>
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
        </div>

        {/* 進捗表示 */}
        {loading && progress && (
          <div className="bg-white rounded-3xl shadow-xl border border-pink-100 p-6 mb-8">
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

            {/* プログレスバー */}
            <div className="w-full bg-pink-100 rounded-full h-3 overflow-hidden mb-4">
              <div
                className="h-3 rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${progress.percent || 0}%`,
                  background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)",
                }}
              />
            </div>

            {/* ステータス */}
            <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
              <div className="animate-pulse text-lg">
                {progress.type === "discovering" && "🔍"}
                {progress.type === "crawling" && "📄"}
                {progress.type === "embedding" && "🧠"}
                {progress.type === "saving" && "💾"}
              </div>
              <span>{progress.message}</span>
            </div>

            {/* 統計 */}
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

            {progress.currentUrl && (
              <div className="text-xs text-slate-400 truncate pt-4 border-t border-pink-100 mt-4">
                {progress.currentUrl}
              </div>
            )}
          </div>
        )}

        {/* エラー */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-8">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* 結果 */}
        {result && (
          <div className="space-y-6">
            {/* 成功メッセージ */}
            <div
              className="rounded-2xl p-6 text-white"
              style={{
                background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)",
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">エージェント作成完了!</h3>
                  <p className="text-white/80 text-sm">AIチャットボットが利用可能になりました</p>
                </div>
              </div>
              <div className="bg-white/10 rounded-xl p-3 text-sm">
                <p>Company ID: <code className="bg-white/20 px-2 py-0.5 rounded">{result.companyId}</code></p>
                <p className="mt-1">Agent ID: <code className="bg-white/20 px-2 py-0.5 rounded">{result.agentId}</code></p>
              </div>
            </div>

            {/* 埋め込みコード */}
            <div className="bg-white rounded-2xl shadow-lg border border-pink-100 p-6">
              <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                <Copy className="w-4 h-4 text-pink-500" />
                埋め込みコード
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                以下のコードをサイトの &lt;/body&gt; 直前に貼り付けてください。
              </p>
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto whitespace-pre-wrap">
                {embedCode}
              </pre>
              <button
                onClick={handleCopy}
                className="mt-4 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all flex items-center gap-2"
                style={{
                  background: copied
                    ? "linear-gradient(135deg, #10B981 0%, #059669 100%)"
                    : "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)",
                }}
              >
                <Copy className="w-4 h-4" />
                {copied ? "コピーしました!" : "コードをコピー"}
              </button>
            </div>

            {/* プレビューリンク */}
            <div className="bg-white rounded-2xl shadow-lg border border-pink-100 p-6">
              <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-pink-500" />
                ウィジェットプレビュー
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                直接ウィジェットページを開いてテストできます。
              </p>
              <a
                href={`/widget?companyId=${result.companyId}&agentName=${encodeURIComponent(companyName + " AI")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:shadow-lg"
                style={{
                  background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)",
                }}
              >
                ウィジェットを開く
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}
      </main>

      {/* フッター */}
      <footer className="text-center py-8 text-sm text-slate-400">
        <p>Powered by ChatSales AI</p>
      </footer>

      {/* ウィジェットデモ（右下に表示） */}
      {result && (
        <>
          {/* デモバッジ */}
          <div className="fixed bottom-24 right-6 z-40 bg-pink-500 text-white text-xs px-3 py-1.5 rounded-full shadow-lg animate-bounce">
            埋め込むとこうなります
          </div>

          {/* ウィジェットポップアップ */}
          {widgetOpen && (
            <div className="fixed bottom-24 right-6 z-50 w-[380px] h-[600px] rounded-2xl shadow-2xl overflow-hidden border border-pink-200">
              <iframe
                src={`/widget?companyId=${result.companyId}&agentName=${encodeURIComponent(companyName + " AI")}`}
                className="w-full h-full"
                title="Chat Widget"
              />
            </div>
          )}

          {/* フローティングボタン */}
          <button
            onClick={() => setWidgetOpen(!widgetOpen)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110"
            style={{
              background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)",
            }}
          >
            {widgetOpen ? (
              <X className="w-6 h-6 text-white" />
            ) : (
              <MessageCircle className="w-6 h-6 text-white" />
            )}
          </button>
        </>
      )}
    </div>
  );
}
