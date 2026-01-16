"use client";

// [Dashboard] コンバージョン設定ページ（Pro機能）

import { useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Target,
  Plus,
  Trash2,
  Save,
  Loader2,
  Link2,
  MousePointer,
  FileInput,
  Lock,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  HelpCircle,
} from "lucide-react";

type ConversionTrigger = {
  id: string;
  name: string;
  type: "url" | "click" | "form";
  urlPattern?: string;
  urlMatchType?: "contains" | "exact" | "regex";
  clickSelector?: string;
  clickText?: string;           // ボタンのテキスト（簡単設定）
  formSelector?: string;
  formButtonText?: string;      // 送信ボタンのテキスト（簡単設定）
  value?: number;
  enabled: boolean;
};

type ConversionSettings = {
  enabled: boolean;
  triggers: ConversionTrigger[];
};

function ConversionsContent() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const companyId = searchParams.get("companyId");
  const companyName = searchParams.get("companyName");
  const agentId = searchParams.get("agentId");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [settings, setSettings] = useState<ConversionSettings>({
    enabled: false,
    triggers: [],
  });

  // 初期データ取得
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated" && agentId) {
      fetchConversionSettings();
    }
  }, [status, agentId, router]);

  const fetchConversionSettings = async () => {
    try {
      const res = await fetch(`/api/agents/conversions?agentId=${agentId}`);
      const data = await res.json();

      if (data.isPro === false) {
        setIsPro(false);
      } else {
        setIsPro(true);
        setSettings(data.conversionSettings || { enabled: false, triggers: [] });
      }
    } catch (error) {
      console.error("Failed to fetch conversion settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/agents/conversions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          conversionSettings: settings,
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert("コンバージョン設定を保存しました");
      } else {
        alert(data.error || "保存に失敗しました");
      }
    } catch (error) {
      console.error("Save error:", error);
      alert("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const addTrigger = () => {
    setSettings((prev) => ({
      ...prev,
      triggers: [
        ...prev.triggers,
        {
          id: crypto.randomUUID(),
          name: "",
          type: "url",
          urlPattern: "",
          urlMatchType: "contains",
          enabled: true,
        },
      ],
    }));
  };

  const updateTrigger = (id: string, updates: Partial<ConversionTrigger>) => {
    setSettings((prev) => ({
      ...prev,
      triggers: prev.triggers.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    }));
  };

  const removeTrigger = (id: string) => {
    setSettings((prev) => ({
      ...prev,
      triggers: prev.triggers.filter((t) => t.id !== id),
    }));
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
      </div>
    );
  }

  if (!agentId || !companyId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-6">
        <div className="max-w-4xl mx-auto text-center py-20">
          <p className="text-slate-600">パラメータが不足しています</p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex items-center gap-2 text-rose-600 hover:text-rose-700"
          >
            <ChevronLeft className="w-4 h-4" />
            ダッシュボードに戻る
          </Link>
        </div>
      </div>
    );
  }

  // Proプランではない場合
  if (!isPro) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-6">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-800 mb-6"
          >
            <ChevronLeft className="w-4 h-4" />
            ダッシュボードに戻る
          </Link>

          <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center">
            <Lock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              コンバージョン計測はPro機能です
            </h2>
            <p className="text-slate-600 mb-6">
              Proプランにアップグレードすると、コンバージョンの自動計測が可能になります
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-rose-500 to-pink-500 text-white rounded-xl hover:from-rose-600 hover:to-pink-600 transition-all"
            >
              <Sparkles className="w-5 h-5" />
              Proプランを見る
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-800 mb-2"
            >
              <ChevronLeft className="w-4 h-4" />
              ダッシュボードに戻る
            </Link>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Target className="w-6 h-6 text-rose-500" />
              コンバージョン設定
            </h1>
            {companyName && (
              <p className="text-slate-600 text-sm mt-1">{companyName}</p>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-xl hover:bg-rose-600 transition-all disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            保存
          </button>
        </div>

        {/* メイン設定 */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-800">コンバージョン計測</h2>
              <p className="text-sm text-slate-600 mt-1">
                設定したトリガー条件に基づいてコンバージョンを自動計測します
              </p>
            </div>
            <button
              onClick={() =>
                setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))
              }
              className={`p-2 rounded-lg transition-all ${
                settings.enabled
                  ? "bg-green-100 text-green-600"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              {settings.enabled ? (
                <ToggleRight className="w-8 h-8" />
              ) : (
                <ToggleLeft className="w-8 h-8" />
              )}
            </button>
          </div>
        </div>

        {/* トリガー一覧 */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-800">トリガー設定</h2>
            <button
              onClick={addTrigger}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-all"
            >
              <Plus className="w-4 h-4" />
              追加
            </button>
          </div>

          {settings.triggers.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Target className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p>トリガーが設定されていません</p>
              <p className="text-sm mt-1">
                「追加」ボタンでコンバージョン条件を設定してください
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {settings.triggers.map((trigger, index) => (
                <div
                  key={trigger.id}
                  className="border border-slate-200 rounded-xl p-4"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-slate-500">
                        #{index + 1}
                      </span>
                      <button
                        onClick={() =>
                          updateTrigger(trigger.id, { enabled: !trigger.enabled })
                        }
                        className={`px-2 py-1 text-xs rounded-lg ${
                          trigger.enabled
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {trigger.enabled ? "有効" : "無効"}
                      </button>
                    </div>
                    <button
                      onClick={() => removeTrigger(trigger.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid gap-4">
                    {/* コンバージョン名 */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        コンバージョン名
                      </label>
                      <input
                        type="text"
                        value={trigger.name}
                        onChange={(e) =>
                          updateTrigger(trigger.id, { name: e.target.value })
                        }
                        placeholder="例: お問い合わせ完了"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>

                    {/* トリガータイプ */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        トリガータイプ
                      </label>
                      <div className="flex gap-2">
                        {[
                          { type: "url", icon: Link2, label: "URL" },
                          { type: "click", icon: MousePointer, label: "クリック" },
                          { type: "form", icon: FileInput, label: "フォーム送信" },
                        ].map(({ type, icon: Icon, label }) => (
                          <button
                            key={type}
                            onClick={() =>
                              updateTrigger(trigger.id, {
                                type: type as "url" | "click" | "form",
                              })
                            }
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                              trigger.type === type
                                ? "bg-rose-100 text-rose-700 border border-rose-200"
                                : "bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* URL型の設定 */}
                    {trigger.type === "url" && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            URLパターン
                          </label>
                          <input
                            type="text"
                            value={trigger.urlPattern || ""}
                            onChange={(e) =>
                              updateTrigger(trigger.id, {
                                urlPattern: e.target.value,
                              })
                            }
                            placeholder="例: /thanks, /complete, /contact/success"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            マッチ方法
                          </label>
                          <select
                            value={trigger.urlMatchType || "contains"}
                            onChange={(e) =>
                              updateTrigger(trigger.id, {
                                urlMatchType: e.target.value as
                                  | "contains"
                                  | "exact"
                                  | "regex",
                              })
                            }
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                          >
                            <option value="contains">部分一致（URLに含まれる）</option>
                            <option value="exact">完全一致</option>
                            <option value="regex">正規表現</option>
                          </select>
                        </div>
                        <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg">
                          <HelpCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-blue-700">
                            ユーザーが指定したURLパターンを含むページにアクセスすると、コンバージョンとしてカウントされます。
                          </p>
                        </div>
                      </div>
                    )}

                    {/* クリック型の設定 */}
                    {trigger.type === "click" && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            ボタンのテキスト
                            <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">簡単</span>
                          </label>
                          <input
                            type="text"
                            value={trigger.clickText || ""}
                            onChange={(e) =>
                              updateTrigger(trigger.id, {
                                clickText: e.target.value,
                                clickSelector: e.target.value ? "" : trigger.clickSelector,
                              })
                            }
                            placeholder="例: 送信する、購入する、お問い合わせ"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            ボタンに表示されているテキストを入力してください
                          </p>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                          <label className="block text-sm font-medium text-slate-500 mb-1">
                            または CSSセレクタ
                            <span className="ml-2 px-2 py-0.5 text-xs bg-slate-100 text-slate-500 rounded">上級者向け</span>
                          </label>
                          <input
                            type="text"
                            value={trigger.clickSelector || ""}
                            onChange={(e) =>
                              updateTrigger(trigger.id, {
                                clickSelector: e.target.value,
                                clickText: e.target.value ? "" : trigger.clickText,
                              })
                            }
                            placeholder="例: #submit-btn, .contact-button"
                            disabled={!!trigger.clickText}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:bg-slate-50 disabled:text-slate-400"
                          />
                        </div>

                        <div className="flex items-start gap-2 p-3 bg-green-50 rounded-lg">
                          <HelpCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-green-700">
                            💡 ボタンのテキストを入力するだけでOK！例えば「送信する」と入力すると、
                            そのテキストを含むボタンがクリックされた時にコンバージョンがカウントされます。
                          </p>
                        </div>
                      </div>
                    )}

                    {/* フォーム型の設定 */}
                    {trigger.type === "form" && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            送信ボタンのテキスト
                            <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">簡単</span>
                          </label>
                          <input
                            type="text"
                            value={trigger.formButtonText || ""}
                            onChange={(e) =>
                              updateTrigger(trigger.id, {
                                formButtonText: e.target.value,
                                formSelector: e.target.value ? "" : trigger.formSelector,
                              })
                            }
                            placeholder="例: 送信する、この内容で送信、申し込む"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                          />
                          <p className="text-xs text-slate-500 mt-1">
                            送信ボタンに表示されているテキストを入力してください
                          </p>
                        </div>

                        <div className="border-t border-slate-100 pt-3">
                          <label className="block text-sm font-medium text-slate-500 mb-1">
                            または フォームのCSSセレクタ
                            <span className="ml-2 px-2 py-0.5 text-xs bg-slate-100 text-slate-500 rounded">上級者向け</span>
                          </label>
                          <input
                            type="text"
                            value={trigger.formSelector || ""}
                            onChange={(e) =>
                              updateTrigger(trigger.id, {
                                formSelector: e.target.value,
                                formButtonText: e.target.value ? "" : trigger.formButtonText,
                              })
                            }
                            placeholder="例: #contact-form, .inquiry-form"
                            disabled={!!trigger.formButtonText}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:bg-slate-50 disabled:text-slate-400"
                          />
                        </div>

                        <div className="flex items-start gap-2 p-3 bg-green-50 rounded-lg">
                          <HelpCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-green-700">
                            💡 送信ボタンのテキストを入力するだけでOK！例えば「この内容で送信」と入力すると、
                            そのボタンを含むフォームが送信された時にコンバージョンがカウントされます。
                            空欄の場合はすべてのフォーム送信がカウントされます。
                          </p>
                        </div>
                      </div>
                    )}

                    {/* コンバージョン価値（オプション） */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        コンバージョン価値（円）
                        <span className="text-slate-400 font-normal ml-1">
                          オプション
                        </span>
                      </label>
                      <input
                        type="number"
                        value={trigger.value || ""}
                        onChange={(e) =>
                          updateTrigger(trigger.id, {
                            value: e.target.value
                              ? parseInt(e.target.value)
                              : undefined,
                          })
                        }
                        placeholder="例: 10000"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 使い方ガイド */}
        <div className="mt-6 bg-slate-50 rounded-xl p-4 border border-slate-200">
          <h3 className="font-medium text-slate-800 mb-2">使い方</h3>
          <ol className="text-sm text-slate-600 space-y-2">
            <li>1. 「追加」ボタンでトリガーを作成</li>
            <li>2. トリガータイプを選択（URL / クリック / フォーム送信）</li>
            <li>3. 条件を設定（URLパターンやCSSセレクタ）</li>
            <li>4. 「保存」ボタンで設定を保存</li>
            <li>5. コンバージョン計測を「有効」に切り替え</li>
          </ol>
          <p className="text-xs text-slate-500 mt-3">
            ※設定したコンバージョンは解析ダッシュボードで確認できます
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ConversionsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-rose-500" />
        </div>
      }
    >
      <ConversionsContent />
    </Suspense>
  );
}
