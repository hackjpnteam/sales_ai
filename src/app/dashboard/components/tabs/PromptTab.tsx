"use client";

import { useState, useEffect } from "react";
import {
  Edit3,
  Save,
  Loader2,
  AlertTriangle,
  MessageSquare,
  Sparkles,
  Shield,
} from "lucide-react";
import { useAgent } from "../AgentContext";
import { SectionCard, ProFeatureLock } from "../shared";

export function PromptTab() {
  const {
    agent,
    company,
    isProOrHigher,
    promptSettings,
    setPromptSettings,
    fetchPromptSettings,
    savePromptSettings,
  } = useAgent();

  const [loading, setLoading] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);

  // Load prompt settings on mount
  useEffect(() => {
    if (agent?.agentId && isProOrHigher) {
      setLoading(true);
      fetchPromptSettings(agent.agentId).finally(() => setLoading(false));
    }
  }, [agent?.agentId, isProOrHigher, fetchPromptSettings]);

  const handleSavePrompt = async () => {
    if (!agent?.agentId) return;

    setSavingPrompt(true);
    const success = await savePromptSettings(agent.agentId);
    setSavingPrompt(false);

    if (success) {
      alert("プロンプト設定を保存しました");
    } else {
      alert("保存に失敗しました");
    }
  };

  if (!agent || !company) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <ProFeatureLock isLocked={!isProOrHigher}>
      <div className="space-y-6">
        {/* Prompt Settings */}
        <SectionCard
          title="プロンプト設定"
          description="AIの振る舞いをカスタマイズ"
          icon={<Edit3 className="w-5 h-5" />}
        >
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* System Prompt */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <Sparkles className="w-4 h-4 text-rose-500" />
                  役割定義
                </label>
                <textarea
                  value={promptSettings.systemPrompt}
                  onChange={(e) =>
                    setPromptSettings({ ...promptSettings, systemPrompt: e.target.value })
                  }
                  rows={4}
                  placeholder="例: あなたは〇〇会社のカスタマーサポート担当です。親切で丁寧な対応を心がけてください。"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 resize-none"
                />
              </div>

              {/* Knowledge */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <MessageSquare className="w-4 h-4 text-blue-500" />
                  追加ナレッジ（直接入力）
                </label>
                <textarea
                  value={promptSettings.knowledge}
                  onChange={(e) =>
                    setPromptSettings({ ...promptSettings, knowledge: e.target.value })
                  }
                  rows={4}
                  placeholder="AIに知っておいてほしい情報を入力..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 resize-none"
                />
              </div>

              {/* Style */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <Edit3 className="w-4 h-4 text-purple-500" />
                  会話スタイル
                </label>
                <textarea
                  value={promptSettings.style}
                  onChange={(e) =>
                    setPromptSettings({ ...promptSettings, style: e.target.value })
                  }
                  rows={3}
                  placeholder="例: 敬語を使い、簡潔に回答する。絵文字は使わない。"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 resize-none"
                />
              </div>

              {/* NG Responses */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  NG回答（絶対に回答してはいけない内容）
                </label>
                <textarea
                  value={promptSettings.ngResponses}
                  onChange={(e) =>
                    setPromptSettings({ ...promptSettings, ngResponses: e.target.value })
                  }
                  rows={3}
                  placeholder="例: 競合他社の製品について肯定的なコメントはしない。価格の値引きは約束しない。"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 resize-none"
                />
              </div>

              {/* Guardrails (read-only) */}
              {promptSettings.guardrails && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
                    <Shield className="w-4 h-4 text-slate-400" />
                    制約条件（システム設定・編集不可）
                  </label>
                  <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500">
                    {promptSettings.guardrails}
                  </div>
                </div>
              )}

              {/* Save Button */}
              <div className="pt-4 border-t border-slate-100">
                <button
                  onClick={handleSavePrompt}
                  disabled={savingPrompt}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 text-white rounded-xl hover:from-rose-600 hover:to-rose-700 transition-all shadow-lg shadow-rose-500/20 disabled:opacity-50"
                >
                  {savingPrompt ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  保存
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </ProFeatureLock>
  );
}
