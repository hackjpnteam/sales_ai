"use client";

import { useState, useEffect } from "react";
import {
  Palette,
  MapPin,
  Video,
  Save,
  Loader2,
  Upload,
  Trash2,
} from "lucide-react";
import { useAgent } from "../AgentContext";
import { SectionCard } from "../shared";

// カラーオプション
const colorOptions = [
  { name: "ローズ", value: "#D86672" },
  { name: "ブルー", value: "#4F8CFF" },
  { name: "グリーン", value: "#10B981" },
  { name: "パープル", value: "#8B5CF6" },
  { name: "オレンジ", value: "#F59E0B" },
  { name: "ピンク", value: "#EC4899" },
  { name: "ホワイト", value: "#FFFFFF" },
  { name: "ブラック", value: "#1A1A1A" },
  { name: "ゴールド", value: "#D4AF37" },
  { name: "シルバー", value: "#A8A9AD" },
];

// 位置オプション
const positionOptions = [
  { name: "右下", value: "bottom-right", icon: "↘" },
  { name: "左下", value: "bottom-left", icon: "↙" },
  { name: "中央下", value: "bottom-center", icon: "↓" },
  { name: "右中央", value: "middle-right", icon: "→" },
  { name: "左中央", value: "middle-left", icon: "←" },
] as const;

// ウィジェットスタイルオプション
const widgetStyleOptions = [
  { name: "バブル", value: "bubble", icon: "●", description: "円形背景付き" },
  { name: "アイコン", value: "icon", icon: "💬", description: "アイコンのみ" },
] as const;

// アイコンサイズオプション
const iconSizeOptions = [
  { name: "M", value: "medium", size: "56px" },
  { name: "L", value: "large", size: "72px" },
  { name: "XL", value: "xlarge", size: "96px" },
] as const;

export function DesignTab() {
  const { agent, company, updateAgent, saving, refreshAgent } = useAgent();

  const [themeColor, setThemeColor] = useState("#D86672");
  const [customColor, setCustomColor] = useState("");
  const [widgetPosition, setWidgetPosition] = useState<string>("bottom-right");
  const [widgetStyle, setWidgetStyle] = useState<"bubble" | "icon">("bubble");
  const [iconSize, setIconSize] = useState<"medium" | "large" | "xlarge">("medium");
  const [iconVideoUrl, setIconVideoUrl] = useState<string>("");
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);

  // Initialize from agent
  useEffect(() => {
    if (agent) {
      setThemeColor(agent.themeColor || "#D86672");
      setWidgetPosition(agent.widgetPosition || "bottom-right");
      setWidgetStyle(agent.widgetStyle || "bubble");
      setIconSize(agent.iconSize || "medium");
      setIconVideoUrl(agent.iconVideoUrl || "");
      // Check if theme color is custom
      if (agent.themeColor && !colorOptions.find(c => c.value === agent.themeColor)) {
        setCustomColor(agent.themeColor);
      }
    }
  }, [agent]);

  const handleSave = async () => {
    setLocalSaving(true);
    const success = await updateAgent({
      themeColor: customColor || themeColor,
      widgetPosition: widgetPosition as "bottom-right" | "bottom-left" | "bottom-center" | "middle-right" | "middle-left",
      widgetStyle,
      iconSize,
      iconVideoUrl,
    });

    if (success) {
      alert("デザイン設定を保存しました");
    }
    setLocalSaving(false);
  };

  const handleColorChange = async (color: string) => {
    setThemeColor(color);
    setCustomColor("");

    // Save color immediately
    try {
      await fetch("/api/agents/color", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent?.agentId,
          themeColor: color,
        }),
      });
    } catch (error) {
      console.error("Failed to update color:", error);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !agent) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("動画は5MB以下にしてください");
      return;
    }

    setUploadingVideo(true);
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        setIconVideoUrl(dataUrl);
        setUploadingVideo(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Failed to upload video:", error);
      setUploadingVideo(false);
    }
    e.target.value = "";
  };

  const handleRemoveVideo = () => {
    setIconVideoUrl("");
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
      {/* Theme Color */}
      <SectionCard
        title="テーマカラー"
        description="ウィジェットの色をカスタマイズ"
        icon={<Palette className="w-5 h-5" />}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {colorOptions.map((color) => (
              <button
                key={color.value}
                onClick={() => handleColorChange(color.value)}
                className={`w-10 h-10 rounded-full border-2 transition-all ${
                  themeColor === color.value
                    ? "border-slate-800 ring-2 ring-slate-800/20 scale-110"
                    : "border-slate-200 hover:border-slate-300"
                }`}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
            {/* Custom color */}
            <div className="relative">
              <input
                type="color"
                value={customColor || themeColor}
                onChange={(e) => {
                  setCustomColor(e.target.value);
                  handleColorChange(e.target.value);
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div
                className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${
                  customColor ? "border-slate-800" : "border-dashed border-slate-300"
                }`}
                style={{ backgroundColor: customColor || "#f8f8f8" }}
              >
                {!customColor && <span className="text-slate-400 text-lg">+</span>}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
              style={{ backgroundColor: customColor || themeColor }}
            >
              <span className="text-white text-xl">💬</span>
            </div>
            <span className="text-sm text-slate-500">プレビュー</span>
          </div>
        </div>
      </SectionCard>

      {/* Widget Position */}
      <SectionCard
        title="表示位置"
        description="ウィジェットの表示位置を設定"
        icon={<MapPin className="w-5 h-5" />}
      >
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {positionOptions.map((pos) => (
            <button
              key={pos.value}
              onClick={() => setWidgetPosition(pos.value)}
              className={`p-3 rounded-xl border text-center transition-all ${
                widgetPosition === pos.value
                  ? "border-rose-500 bg-rose-50 text-rose-600"
                  : "border-slate-200 hover:border-slate-300 text-slate-600"
              }`}
            >
              <div className="text-xl mb-1">{pos.icon}</div>
              <div className="text-xs">{pos.name}</div>
            </button>
          ))}
        </div>
      </SectionCard>

      {/* Widget Style */}
      <SectionCard
        title="ウィジェットスタイル"
        description="表示スタイルを選択"
        icon={<Palette className="w-5 h-5" />}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {widgetStyleOptions.map((style) => (
              <button
                key={style.value}
                onClick={() => setWidgetStyle(style.value)}
                className={`p-4 rounded-xl border text-center transition-all ${
                  widgetStyle === style.value
                    ? "border-rose-500 bg-rose-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="text-2xl mb-2">{style.icon}</div>
                <div className="font-medium text-slate-700">{style.name}</div>
                <div className="text-xs text-slate-500">{style.description}</div>
              </button>
            ))}
          </div>

          {/* Icon Size (only for icon style) */}
          {widgetStyle === "icon" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                アイコンサイズ
              </label>
              <div className="flex gap-2">
                {iconSizeOptions.map((size) => (
                  <button
                    key={size.value}
                    onClick={() => setIconSize(size.value)}
                    className={`px-4 py-2 rounded-xl border transition-all ${
                      iconSize === size.value
                        ? "border-rose-500 bg-rose-50 text-rose-600"
                        : "border-slate-200 hover:border-slate-300 text-slate-600"
                    }`}
                  >
                    {size.name} ({size.size})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Icon Video */}
          {widgetStyle === "icon" && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-2">
                <Video className="w-4 h-4" />
                アイコン動画（5秒以内、ループ再生）
              </label>
              {iconVideoUrl ? (
                <div className="flex items-center gap-4">
                  <video
                    src={iconVideoUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-20 h-20 object-cover rounded-full"
                  />
                  <button
                    onClick={handleRemoveVideo}
                    className="flex items-center gap-1 text-sm text-red-500 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                    削除
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-slate-300 transition-all">
                  {uploadingVideo ? (
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  ) : (
                    <Upload className="w-5 h-5 text-slate-400" />
                  )}
                  <span className="text-sm text-slate-500">動画をアップロード（最大5MB）</span>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleVideoUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={localSaving || saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-rose-500 to-rose-600 text-white rounded-xl hover:from-rose-600 hover:to-rose-700 transition-all shadow-lg shadow-rose-500/20 disabled:opacity-50"
        >
          {localSaving || saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          保存
        </button>
      </div>
    </div>
  );
}
