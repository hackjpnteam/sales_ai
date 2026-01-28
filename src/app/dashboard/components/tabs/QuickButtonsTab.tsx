"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageSquare,
  Save,
  Loader2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  GripVertical,
} from "lucide-react";
import { useAgent, type QuickButton } from "../AgentContext";
import { SectionCard } from "../shared";

// 自動拡張textarea
function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const minHeight = 60; // 2行分程度
      const maxHeight = 200; // 最大高さ
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.min(Math.max(scrollHeight, minHeight), maxHeight)}px`;
    }
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(e) => {
        onChange(e);
        adjustHeight();
      }}
      placeholder={placeholder}
      className={className}
      style={{ overflow: value && value.length > 100 ? "auto" : "hidden" }}
    />
  );
}

// ツリーノードコンポーネント
function ButtonNode({
  button,
  path,
  depth,
  isExpanded,
  onToggle,
  onUpdate,
  onDelete,
  onAddChild,
}: {
  button: QuickButton;
  path: number[];
  depth: number;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (field: keyof QuickButton, value: string) => void;
  onDelete: () => void;
  onAddChild: () => void;
}) {
  const hasChildren = button.followUpButtons && button.followUpButtons.length > 0;
  const maxDepth = 3; // 最大3階層まで

  return (
    <div className="relative">
      {/* 接続線 */}
      {depth > 0 && (
        <div
          className="absolute top-0 bottom-0 border-l-2 border-slate-200"
          style={{ left: `${(depth - 1) * 24 + 12}px` }}
        />
      )}

      <div
        className="relative flex items-start gap-2 py-2"
        style={{ paddingLeft: `${depth * 24}px` }}
      >
        {/* 展開/折りたたみボタン */}
        <button
          onClick={onToggle}
          className="mt-2.5 w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600 flex-shrink-0"
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )
          ) : (
            <div className="w-2 h-2 rounded-full bg-slate-300" />
          )}
        </button>

        {/* ボタン内容 */}
        <div className="flex-1 bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                depth === 0 ? "bg-rose-100 text-rose-600" :
                depth === 1 ? "bg-blue-100 text-blue-600" :
                "bg-green-100 text-green-600"
              }`}>
                {depth === 0 ? "メイン" : `L${depth}`}
              </span>
              {button.label && (
                <span className="text-sm font-medium text-slate-700">{button.label}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {depth < maxDepth && (
                <button
                  onClick={onAddChild}
                  className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                  title="フォローアップを追加"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={onDelete}
                className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                title="削除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={button.label}
                onChange={(e) => onUpdate("label", e.target.value)}
                placeholder="ラベル"
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
              <input
                type="text"
                value={button.query}
                onChange={(e) => onUpdate("query", e.target.value)}
                placeholder="送信メッセージ"
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>
            {/* 返答タイプ選択 */}
            <div className="flex items-center gap-4 py-1">
              <span className="text-xs text-slate-500">返答タイプ:</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`responseType-${path.join("-")}`}
                  checked={!button.responseType || button.responseType === "text"}
                  onChange={() => onUpdate("responseType", "text")}
                  className="w-3.5 h-3.5 text-rose-500 focus:ring-rose-500"
                />
                <span className="text-xs text-slate-600">固定テキスト</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  name={`responseType-${path.join("-")}`}
                  checked={button.responseType === "prompt"}
                  onChange={() => onUpdate("responseType", "prompt")}
                  className="w-3.5 h-3.5 text-rose-500 focus:ring-rose-500"
                />
                <span className="text-xs text-slate-600">AIプロンプト</span>
              </label>
            </div>
            {/* 返答タイプに応じたテキストエリア */}
            {(!button.responseType || button.responseType === "text") ? (
              <AutoResizeTextarea
                value={button.response || ""}
                onChange={(e) => onUpdate("response", e.target.value)}
                placeholder="カスタム返答（任意）- そのまま表示されます"
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 resize-y"
              />
            ) : (
              <AutoResizeTextarea
                value={button.responsePrompt || ""}
                onChange={(e) => onUpdate("responsePrompt", e.target.value)}
                placeholder="AIへの指示（例: 浮気調査の専門家として、まず相談者の状況を確認する質問をしてから...）"
                className="w-full px-3 py-1.5 border border-blue-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y bg-blue-50/50"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 再帰的にツリーをレンダリング
function ButtonTree({
  buttons,
  path,
  depth,
  expandedPaths,
  onToggle,
  onUpdate,
  onDelete,
  onAddChild,
}: {
  buttons: QuickButton[];
  path: number[];
  depth: number;
  expandedPaths: Set<string>;
  onToggle: (path: number[]) => void;
  onUpdate: (path: number[], field: keyof QuickButton, value: string) => void;
  onDelete: (path: number[]) => void;
  onAddChild: (path: number[]) => void;
}) {
  return (
    <div className="space-y-1">
      {buttons.map((button, index) => {
        const currentPath = [...path, index];
        const pathKey = currentPath.join("-");
        const isExpanded = expandedPaths.has(pathKey);
        const hasChildren = button.followUpButtons && button.followUpButtons.length > 0;

        return (
          <div key={pathKey}>
            <ButtonNode
              button={button}
              path={currentPath}
              depth={depth}
              isExpanded={isExpanded}
              onToggle={() => onToggle(currentPath)}
              onUpdate={(field, value) => onUpdate(currentPath, field, value)}
              onDelete={() => onDelete(currentPath)}
              onAddChild={() => onAddChild(currentPath)}
            />
            {hasChildren && isExpanded && (
              <ButtonTree
                buttons={button.followUpButtons!}
                path={currentPath}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAddChild={onAddChild}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function QuickButtonsTab() {
  const { agent, company, updateAgent } = useAgent();

  const [saving, setSaving] = useState(false);
  const [quickButtons, setQuickButtons] = useState<QuickButton[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(["0", "1", "2"]));

  // Initialize quick buttons from agent (only on initial load or agent change)
  const [loadedAgentId, setLoadedAgentId] = useState<string | null>(null);

  useEffect(() => {
    if (agent && agent.agentId !== loadedAgentId) {
      const defaultButtons: QuickButton[] = [
        { label: "会社について", query: "会社について教えてください", responseType: "text", response: "", followUpButtons: [] },
        { label: "採用について", query: "採用情報について教えてください", responseType: "text", response: "", followUpButtons: [] },
        { label: "サービスについて", query: "提供しているサービスについて教えてください", responseType: "text", response: "", followUpButtons: [] },
      ];
      const buttons = agent.quickButtons && agent.quickButtons.length > 0
        ? agent.quickButtons.map(b => ({
            ...b,
            responseType: b.responseType || "text",
            response: b.response || "",
            responsePrompt: b.responsePrompt || "",
            followUpButtons: b.followUpButtons || []
          }))
        : defaultButtons;
      setQuickButtons(buttons);
      setLoadedAgentId(agent.agentId);
    }
  }, [agent, loadedAgentId]);

  const handleSave = async () => {
    if (!agent?.agentId) return;

    // 空のフィールドがあるボタンをチェック
    const emptyQueryButtons = quickButtons.filter(b => b.label.trim() && !b.query.trim());
    const emptyLabelButtons = quickButtons.filter(b => !b.label.trim() && b.query.trim());
    const emptyBothButtons = quickButtons.filter(b => !b.label.trim() && !b.query.trim());

    if (emptyQueryButtons.length > 0) {
      alert(`「${emptyQueryButtons[0].label}」の送信メッセージが空です。送信メッセージを入力してください。`);
      return;
    }

    if (emptyLabelButtons.length > 0) {
      alert("ラベルが空のボタンがあります。ラベルを入力してください。");
      return;
    }

    setSaving(true);
    try {
      const validButtons = quickButtons.filter(b => b.label.trim() && b.query.trim());

      if (validButtons.length === 0 && emptyBothButtons.length > 0) {
        alert("ラベルと送信メッセージを入力してください。");
        setSaving(false);
        return;
      }

      const success = await updateAgent({ quickButtons: validButtons });

      if (success) {
        alert(`${validButtons.length}件のクイックボタンを保存しました`);
      } else {
        alert("保存に失敗しました");
      }
    } finally {
      setSaving(false);
    }
  };

  const togglePath = (path: number[]) => {
    const pathKey = path.join("-");
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(pathKey)) {
        next.delete(pathKey);
      } else {
        next.add(pathKey);
      }
      return next;
    });
  };

  // パスを使ってボタンを更新
  const updateButtonAtPath = (path: number[], field: keyof QuickButton, value: string) => {
    setQuickButtons(prev => {
      const newButtons = JSON.parse(JSON.stringify(prev));
      let target = newButtons;
      for (let i = 0; i < path.length - 1; i++) {
        target = target[path[i]].followUpButtons;
      }
      target[path[path.length - 1]][field] = value;
      return newButtons;
    });
  };

  // パスを使ってボタンを削除
  const deleteButtonAtPath = (path: number[]) => {
    if (path.length === 1) {
      setQuickButtons(prev => prev.filter((_, i) => i !== path[0]));
    } else {
      setQuickButtons(prev => {
        const newButtons = JSON.parse(JSON.stringify(prev));
        let target = newButtons;
        for (let i = 0; i < path.length - 2; i++) {
          target = target[path[i]].followUpButtons;
        }
        target[path[path.length - 2]].followUpButtons.splice(path[path.length - 1], 1);
        return newButtons;
      });
    }
  };

  // 子ボタンを追加
  const addChildAtPath = (path: number[]) => {
    setQuickButtons(prev => {
      const newButtons = JSON.parse(JSON.stringify(prev));
      let target = newButtons;
      for (let i = 0; i < path.length - 1; i++) {
        target = target[path[i]].followUpButtons;
      }
      if (!target[path[path.length - 1]].followUpButtons) {
        target[path[path.length - 1]].followUpButtons = [];
      }
      target[path[path.length - 1]].followUpButtons.push({
        label: "",
        query: "",
        responseType: "text",
        response: "",
        responsePrompt: "",
        followUpButtons: [],
      });
      return newButtons;
    });

    // 親を展開
    setExpandedPaths(prev => {
      const next = new Set(prev);
      next.add(path.join("-"));
      return next;
    });
  };

  // ルートにボタンを追加
  const addRootButton = () => {
    setQuickButtons(prev => [...prev, {
      label: "",
      query: "",
      responseType: "text",
      response: "",
      responsePrompt: "",
      followUpButtons: [],
    }]);
  };

  if (!agent || !company) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="クイックボタン"
        description="よくある質問のショートカットを設定。フォローアップボタンで会話をガイドできます（最大3階層）"
        icon={<MessageSquare className="w-5 h-5" />}
      >
        <div className="space-y-4">
          {/* 凡例 */}
          <div className="flex items-center gap-4 text-xs text-slate-500 pb-2 border-b border-slate-100">
            <span className="flex items-center gap-1">
              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-600">メイン</span>
              初期表示
            </span>
            <span className="flex items-center gap-1">
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">L1</span>
              フォローアップ
            </span>
            <span className="flex items-center gap-1">
              <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-600">L2</span>
              ネスト
            </span>
          </div>

          {/* ツリービュー */}
          {quickButtons.length > 0 ? (
            <div className="bg-slate-50 rounded-xl p-4">
              <ButtonTree
                buttons={quickButtons}
                path={[]}
                depth={0}
                expandedPaths={expandedPaths}
                onToggle={togglePath}
                onUpdate={updateButtonAtPath}
                onDelete={deleteButtonAtPath}
                onAddChild={addChildAtPath}
              />
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              クイックボタンがありません
            </div>
          )}

          {/* 追加ボタン */}
          <button
            onClick={addRootButton}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 hover:border-rose-300 hover:text-rose-600 transition-all"
          >
            <Plus className="w-4 h-4" />
            メインボタンを追加
          </button>

          {/* 保存ボタン */}
          <div className="pt-4 border-t border-slate-100">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 text-white rounded-xl hover:from-rose-600 hover:to-rose-700 transition-all shadow-lg shadow-rose-500/20 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              保存
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
