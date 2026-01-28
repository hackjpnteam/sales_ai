"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Settings,
  MessageCircle,
  MousePointerClick,
  Database,
  Edit3,
  Palette,
  Code,
  Share2,
  Lock,
  Users,
} from "lucide-react";

export type TabId = "settings" | "test" | "quickbuttons" | "knowledge" | "prompt" | "design" | "embed" | "share" | "users";

type TabConfig = {
  id: TabId;
  label: string;
  shortLabel?: string;
  icon: typeof Settings;
  proOnly?: boolean;
};

const tabs: TabConfig[] = [
  { id: "settings", label: "基本設定", icon: Settings },
  { id: "test", label: "テスト", shortLabel: "テスト", icon: MessageCircle },
  { id: "quickbuttons", label: "クイックボタン", shortLabel: "ボタン", icon: MousePointerClick },
  { id: "knowledge", label: "ナレッジ", icon: Database, proOnly: true },
  { id: "prompt", label: "プロンプト", icon: Edit3, proOnly: true },
  { id: "design", label: "デザイン", icon: Palette },
  { id: "embed", label: "埋め込み", icon: Code },
  { id: "share", label: "共有", icon: Share2 },
  { id: "users", label: "ユーザー", shortLabel: "ユーザー", icon: Users },
];

type TabNavigationProps = {
  agentId: string;
  currentTab: TabId;
  isProOrHigher: boolean;
  onTabChange?: (tab: TabId) => void;
};

export function TabNavigation({
  agentId,
  currentTab,
  isProOrHigher,
  onTabChange,
}: TabNavigationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleTabClick = (tabId: TabId) => {
    const tab = tabs.find(t => t.id === tabId);

    // If Pro-only tab and not on Pro plan, redirect to pricing page
    if (tab?.proOnly && !isProOrHigher) {
      router.push(`/pricing?feature=${encodeURIComponent(tab.label)}&return=/dashboard/agent/${agentId}`);
      return;
    }

    if (onTabChange) {
      onTabChange(tabId);
    } else {
      // Update URL
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tabId);
      router.push(`/dashboard/agent/${agentId}?${params.toString()}`);
    }
  };

  return (
    <div className="border-b border-slate-200 bg-white rounded-t-2xl">
      <nav className="-mb-px flex overflow-x-auto scrollbar-hide" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const isLocked = tab.proOnly && !isProOrHigher;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`
                group relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap
                border-b-2 transition-all min-w-fit
                ${isActive
                  ? "border-rose-500 text-rose-600"
                  : isLocked
                    ? "border-transparent text-slate-400 hover:text-rose-500 hover:border-rose-300 cursor-pointer"
                    : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                }
              `}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel || tab.label}</span>
              {isLocked && (
                <Lock className="w-3 h-3 text-slate-400 group-hover:text-rose-500" />
              )}
              {tab.proOnly && !isLocked && (
                <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-600">
                  Pro
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
