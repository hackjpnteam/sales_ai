"use client";

import { useState } from "react";
import {
  Code,
  Copy,
  Check,
  ExternalLink,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { useAgent } from "../AgentContext";
import { SectionCard, ProFeatureLock } from "../shared";

export function EmbedTab() {
  const { agent, company } = useAgent();
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const getEmbedCode = () => {
    if (!company) return "";

    const widgetBaseUrl =
      typeof window !== "undefined"
        ? window.location.origin + "/widget"
        : "http://localhost:4000/widget";

    return `<script
  src="${typeof window !== "undefined" ? window.location.origin : "http://localhost:4000"}/widget.js"
  data-company-id="${company.companyId}"
  data-widget-base-url="${widgetBaseUrl}"
  defer
></script>`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getEmbedCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isFreePlan = !company?.plan || company.plan === "free";

  if (!agent || !company) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProFeatureLock isLocked={isFreePlan}>
        <SectionCard
          title="埋め込みコード"
          description="ウェブサイトに以下のコードを追加してください"
          icon={<Code className="w-5 h-5" />}
          headerAction={
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
            >
              <HelpCircle className="w-4 h-4" />
              設置方法
            </button>
          }
        >
          <div className="space-y-4">
            {/* Embed code */}
            <div className="relative">
              <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-sm overflow-x-auto">
                <code>{getEmbedCode()}</code>
              </pre>
              <button
                onClick={handleCopy}
                className={`absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  copied
                    ? "bg-green-500 text-white"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    コピー済み
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    コピー
                  </>
                )}
              </button>
            </div>

            {/* Preview link */}
            <div className="flex items-center gap-4">
              <a
                href={`/widget?companyId=${company.companyId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-rose-600 hover:text-rose-700"
              >
                <ExternalLink className="w-4 h-4" />
                プレビューを開く
              </a>
            </div>
          </div>
        </SectionCard>
      </ProFeatureLock>

      {/* Help section */}
      {showHelp && (
        <SectionCard title="設置方法" icon={<HelpCircle className="w-5 h-5" />}>
          <div className="space-y-4 text-sm text-slate-600">
            <div>
              <h4 className="font-medium text-slate-800 mb-2">1. コードをコピー</h4>
              <p>上記の埋め込みコードをコピーしてください。</p>
            </div>

            <div>
              <h4 className="font-medium text-slate-800 mb-2">2. HTMLに貼り付け</h4>
              <p>
                ウェブサイトのHTMLファイル（通常は index.html）の{" "}
                <code className="bg-slate-100 px-1 rounded">&lt;/body&gt;</code>{" "}
                タグの直前に貼り付けてください。
              </p>
              <pre className="bg-slate-50 p-3 rounded-lg mt-2 text-xs overflow-x-auto">
                {`<!-- 他のコンテンツ -->

${getEmbedCode()}
</body>
</html>`}
              </pre>
            </div>

            <div>
              <h4 className="font-medium text-slate-800 mb-2">3. 確認</h4>
              <p>ウェブサイトを再読み込みして、チャットウィジェットが表示されることを確認してください。</p>
            </div>

            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <h4 className="font-medium text-amber-800 mb-1">注意事項</h4>
              <ul className="text-amber-700 text-xs space-y-1">
                <li>• コードは1ページに1つだけ設置してください</li>
                <li>• WordPressの場合は「カスタムHTML」ブロックを使用してください</li>
                <li>• Shopifyの場合は「テーマ」→「コードを編集」からtheme.liquidを編集してください</li>
              </ul>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Platform-specific instructions */}
      <SectionCard title="プラットフォーム別設置方法">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            {
              name: "WordPress",
              icon: "🔧",
              description: "テーマのfooter.phpまたはカスタムHTMLウィジェットに追加",
            },
            {
              name: "Shopify",
              icon: "🛒",
              description: "テーマ > コードを編集 > theme.liquid",
            },
            {
              name: "Wix",
              icon: "🎨",
              description: "サイト設定 > カスタムコード > フッター",
            },
            {
              name: "その他",
              icon: "📝",
              description: "HTMLの</body>タグ直前に追加",
            },
          ].map((platform) => (
            <div
              key={platform.name}
              className="p-4 bg-slate-50 rounded-xl border border-slate-100"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{platform.icon}</span>
                <span className="font-medium text-slate-700">{platform.name}</span>
              </div>
              <p className="text-sm text-slate-500">{platform.description}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
