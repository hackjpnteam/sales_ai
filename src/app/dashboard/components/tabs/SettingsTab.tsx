"use client";

import { useState, useEffect } from "react";
import {
  Save,
  Volume2,
  VolumeX,
  Globe,
  Upload,
  RefreshCw,
  Building2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { useAgent, type SupportedLanguage, type CompanyInfo } from "../AgentContext";
import { SectionCard } from "../shared";

// 言語オプション
const languageOptions: { code: SupportedLanguage; name: string; flag: string }[] = [
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "zh", name: "中国語", flag: "🇨🇳" },
  { code: "en", name: "English", flag: "🇺🇸" },
];

// アバター選択肢（存在するデフォルトアバターのみ）
const defaultAvatars = [
  "/agent-avatar.png",
];

type SettingsTabProps = {
  onSave?: () => void;
};

export function SettingsTab({ onSave }: SettingsTabProps) {
  const { agent, company, updateAgent, saving, refreshAgent } = useAgent();

  // Form state
  const [name, setName] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState("/agent-avatar.png");
  const [tooltipText, setTooltipText] = useState("AIアシスタントが対応します");
  const [tooltipDuration, setTooltipDuration] = useState(5);
  const [languages, setLanguages] = useState<SupportedLanguage[]>(["ja"]);

  // Company info editing
  const [showCompanyInfo, setShowCompanyInfo] = useState(true);
  const [editingCompanyInfo, setEditingCompanyInfo] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({});
  const [savingCompanyInfo, setSavingCompanyInfo] = useState(false);

  // Recrawl state
  const [recrawling, setRecrawling] = useState(false);
  const [recrawlProgress, setRecrawlProgress] = useState<{ percent: number; currentUrl?: string } | null>(null);

  // Avatar upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadedAvatars, setUploadedAvatars] = useState<{ avatarId: string; name: string; dataUrl: string }[]>([]);

  // Initialize form from agent
  useEffect(() => {
    if (agent) {
      setName(agent.name || "");
      setWelcomeMessage(agent.welcomeMessage || "");
      setVoiceEnabled(agent.voiceEnabled ?? true);
      setAvatarUrl(agent.avatarUrl || "/agent-avatar.png");
      setTooltipText(agent.tooltipText || "AIアシスタントが対応します");
      setTooltipDuration(agent.tooltipDuration ?? 5);
      setLanguages(agent.languages || ["ja"]);
      setCompanyInfo(agent.companyInfo || {});
    }
  }, [agent]);

  // Load uploaded avatars
  useEffect(() => {
    if (agent?.agentId) {
      fetch(`/api/avatars?agentId=${agent.agentId}`)
        .then(res => res.ok ? res.json() : { avatars: [] })
        .then(data => setUploadedAvatars(data.avatars || []))
        .catch(() => setUploadedAvatars([]));
    }
  }, [agent?.agentId]);

  const handleSave = async () => {
    const success = await updateAgent({
      name,
      welcomeMessage,
      voiceEnabled,
      avatarUrl,
      tooltipText,
      tooltipDuration,
      languages,
    });

    if (success && onSave) {
      onSave();
    }
  };

  const handleSaveCompanyInfo = async () => {
    if (!agent) return;
    setSavingCompanyInfo(true);
    try {
      const res = await fetch(`/api/agents/${agent.agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyInfo }),
      });

      if (res.ok) {
        setEditingCompanyInfo(false);
        await refreshAgent();
        // Auto recrawl after saving
        handleRecrawl(true);
      } else {
        const data = await res.json();
        alert(data.error || "保存に失敗しました");
      }
    } catch (error) {
      console.error("Failed to save company info:", error);
      alert("エラーが発生しました");
    } finally {
      setSavingCompanyInfo(false);
    }
  };

  const handleRecrawl = async (skipConfirm = false) => {
    if (!agent || !company) return;

    if (!skipConfirm && !confirm("サイトを再クロールして基本情報を更新しますか？")) {
      return;
    }

    setRecrawling(true);
    setRecrawlProgress({ percent: 0 });

    try {
      const res = await fetch(`/api/agents/${agent.agentId}/recrawl`, {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = await res.json();
        alert(errorData.error || "再クロールに失敗しました");
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        alert("ストリーミングに失敗しました");
        return;
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
              const data = JSON.parse(line.slice(6));
              const progressTypes = ["discovering", "crawling", "embedding", "saving", "extracting"];
              if (progressTypes.includes(data.type)) {
                setRecrawlProgress({
                  percent: data.percent || 0,
                  currentUrl: data.currentUrl,
                });
              } else if (data.type === "complete") {
                if (data.success) {
                  alert(`基本情報を更新しました（${data.pagesCount || 0}ページをクロール）`);
                  await refreshAgent();
                } else {
                  alert(data.message || "基本情報を抽出できませんでした");
                }
              } else if (data.type === "error") {
                alert(data.error || "再クロールに失敗しました");
              }
            } catch (e) {
              console.error("Failed to parse SSE data:", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Recrawl error:", error);
      alert("エラーが発生しました");
    } finally {
      setRecrawling(false);
      setRecrawlProgress(null);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !agent?.agentId) return;

    if (file.size > 1 * 1024 * 1024) {
      alert("ファイルサイズは1MB以下にしてください");
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("agentId", agent.agentId);
      formData.append("name", file.name);

      const res = await fetch("/api/avatars", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setUploadedAvatars(prev => [...prev, data.avatar]);
        setAvatarUrl(data.avatar.dataUrl);
      } else {
        const errorData = await res.json();
        alert(errorData.error || "アップロードに失敗しました");
      }
    } catch (error) {
      console.error("Failed to upload avatar:", error);
      alert("アップロードに失敗しました");
    } finally {
      setUploadingAvatar(false);
    }
    e.target.value = "";
  };

  const toggleLanguage = (code: SupportedLanguage) => {
    setLanguages(prev => {
      if (prev.includes(code)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter(l => l !== code);
      }
      return [...prev, code];
    });
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
      {/* Basic Settings */}
      <SectionCard title="エージェント設定" icon={<Building2 className="w-5 h-5" />}>
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              エージェント名
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
            />
          </div>

          {/* Welcome Message */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              ウェルカムメッセージ
            </label>
            <textarea
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 resize-none"
            />
          </div>

          {/* Voice */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              音声読み上げ
            </label>
            <button
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${
                voiceEnabled
                  ? "border-rose-500 bg-rose-50 text-rose-600"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {voiceEnabled ? (
                <>
                  <Volume2 className="w-4 h-4" />
                  有効
                </>
              ) : (
                <>
                  <VolumeX className="w-4 h-4" />
                  無効
                </>
              )}
            </button>
          </div>

          {/* Avatar */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              アバター
            </label>
            <div className="flex flex-wrap gap-2">
              {defaultAvatars.map((url) => (
                <button
                  key={url}
                  onClick={() => setAvatarUrl(url)}
                  className={`w-12 h-12 rounded-full overflow-hidden border-2 transition-all ${
                    avatarUrl === url
                      ? "border-rose-500 ring-2 ring-rose-500/20"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
              {uploadedAvatars.map((avatar) => (
                <button
                  key={avatar.avatarId}
                  onClick={() => setAvatarUrl(avatar.dataUrl)}
                  className={`w-12 h-12 rounded-full overflow-hidden border-2 transition-all ${
                    avatarUrl === avatar.dataUrl
                      ? "border-rose-500 ring-2 ring-rose-500/20"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <img src={avatar.dataUrl} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
              <label className="w-12 h-12 rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center cursor-pointer hover:border-slate-300 transition-all">
                {uploadingAvatar ? (
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                ) : (
                  <Upload className="w-5 h-5 text-slate-400" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Tooltip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                ツールチップテキスト
              </label>
              <input
                type="text"
                value={tooltipText}
                onChange={(e) => setTooltipText(e.target.value)}
                placeholder="AIアシスタントが対応します"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                表示時間（秒）
              </label>
              <input
                type="number"
                value={tooltipDuration}
                onChange={(e) => setTooltipDuration(Number(e.target.value))}
                min={0}
                max={30}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
              />
              <p className="text-xs text-slate-400 mt-1">0で非表示</p>
            </div>
          </div>

          {/* Languages */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Globe className="w-4 h-4 inline mr-1" />
              対応言語
            </label>
            <div className="flex flex-wrap gap-2">
              {languageOptions.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => toggleLanguage(lang.code)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                    languages.includes(lang.code)
                      ? "border-rose-500 bg-rose-50 text-rose-600"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <span>{lang.flag}</span>
                  <span className="text-sm">{lang.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Save Button */}
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

      {/* Company Info */}
      <SectionCard
        title="クロール情報"
        icon={<Building2 className="w-5 h-5" />}
        headerAction={
          <button
            onClick={() => setShowCompanyInfo(!showCompanyInfo)}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
          >
            {showCompanyInfo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        }
      >
        {showCompanyInfo && (
          <div className="space-y-4">
            {/* Recrawl button */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleRecrawl()}
                disabled={recrawling}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-all disabled:opacity-50"
              >
                {recrawling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                再クロール
              </button>
              {recrawlProgress && (
                <div className="flex-1">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500 transition-all"
                      style={{ width: `${recrawlProgress.percent}%` }}
                    />
                  </div>
                  {recrawlProgress.currentUrl && (
                    <p className="text-xs text-slate-400 mt-1 truncate">{recrawlProgress.currentUrl}</p>
                  )}
                </div>
              )}
            </div>

            {/* Company info display/edit */}
            {editingCompanyInfo ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">会社名</label>
                  <input
                    type="text"
                    value={companyInfo.companyName || ""}
                    onChange={(e) => setCompanyInfo(prev => ({ ...prev, companyName: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">事業内容</label>
                  <textarea
                    value={companyInfo.businessDescription || ""}
                    onChange={(e) => setCompanyInfo(prev => ({ ...prev, businessDescription: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">所在地</label>
                    <input
                      type="text"
                      value={companyInfo.address || ""}
                      onChange={(e) => setCompanyInfo(prev => ({ ...prev, address: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">電話番号</label>
                    <input
                      type="text"
                      value={companyInfo.phone || ""}
                      onChange={(e) => setCompanyInfo(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSaveCompanyInfo}
                    disabled={savingCompanyInfo}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-lg text-sm hover:bg-rose-600 disabled:opacity-50"
                  >
                    {savingCompanyInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    保存
                  </button>
                  <button
                    onClick={() => {
                      setEditingCompanyInfo(false);
                      setCompanyInfo(agent?.companyInfo || {});
                    }}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm hover:bg-slate-50"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                {agent?.companyInfo ? (
                  <>
                    {agent.companyInfo.companyName && (
                      <div className="flex">
                        <span className="text-slate-500 w-24">会社名:</span>
                        <span className="text-slate-700">{agent.companyInfo.companyName}</span>
                      </div>
                    )}
                    {agent.companyInfo.businessDescription && (
                      <div className="flex">
                        <span className="text-slate-500 w-24">事業内容:</span>
                        <span className="text-slate-700 flex-1">{agent.companyInfo.businessDescription}</span>
                      </div>
                    )}
                    {agent.companyInfo.address && (
                      <div className="flex">
                        <span className="text-slate-500 w-24">所在地:</span>
                        <span className="text-slate-700">{agent.companyInfo.address}</span>
                      </div>
                    )}
                    {agent.companyInfo.crawledAt && (
                      <div className="flex">
                        <span className="text-slate-500 w-24">最終更新:</span>
                        <span className="text-slate-700">{new Date(agent.companyInfo.crawledAt).toLocaleString("ja-JP")}</span>
                      </div>
                    )}
                    <button
                      onClick={() => setEditingCompanyInfo(true)}
                      className="mt-2 text-rose-600 hover:text-rose-700 text-sm"
                    >
                      編集
                    </button>
                  </>
                ) : (
                  <p className="text-slate-400">クロール情報がありません</p>
                )}
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
