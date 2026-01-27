"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import type { CompanyInfo } from "@/lib/types";
export type { CompanyInfo };

// ========================================
// Types
// ========================================

export type SupportedLanguage = "ja" | "zh" | "en";

export type QuickButton = {
  id?: string;
  label: string;
  query: string;
  responseType?: "text" | "prompt";
  response?: string;
  responsePrompt?: string;
  followUpButtons?: QuickButton[];
};

export type SharedUser = {
  email: string;
  userId?: string;
  role: "editor" | "viewer";
  addedAt: Date;
};

export type Agent = {
  agentId: string;
  companyId: string;
  name: string;
  welcomeMessage: string;
  voiceEnabled: boolean;
  themeColor: string;
  avatarUrl?: string;
  widgetPosition?: "bottom-right" | "bottom-left" | "bottom-center" | "middle-right" | "middle-left";
  widgetStyle?: "bubble" | "icon";
  iconVideoUrl?: string;
  iconSize?: "medium" | "large" | "xlarge";
  tooltipText?: string;
  tooltipDuration?: number;
  languages?: SupportedLanguage[];
  quickButtons?: QuickButton[];
  systemPrompt?: string;
  knowledge?: string;
  style?: string;
  ngResponses?: string;
  sharedWith?: SharedUser[];
  isShared?: boolean;
  companyInfo?: CompanyInfo;
  createdAt: Date;
};

export type Company = {
  companyId: string;
  name: string;
  rootUrl: string;
  language: string;
  plan?: "free" | "lite" | "pro" | "max";
  isShared?: boolean;
  createdAt: Date;
  updatedAt?: Date;
  agents: Agent[];
};

export type PromptSettings = {
  systemPrompt: string;
  knowledge: string;
  style: string;
  ngResponses: string;
  guardrails: string;
};

export type CustomKnowledge = {
  knowledgeId: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

// ========================================
// Context Types
// ========================================

type AgentContextType = {
  // Current agent and company
  agent: Agent | null;
  company: Company | null;
  setAgent: (agent: Agent | null) => void;
  setCompany: (company: Company | null) => void;

  // Loading states
  loading: boolean;
  saving: boolean;
  setLoading: (loading: boolean) => void;
  setSaving: (saving: boolean) => void;

  // Error handling
  error: string | null;
  setError: (error: string | null) => void;

  // Fetch agent data
  fetchAgent: (agentId: string) => Promise<void>;
  refreshAgent: () => Promise<void>;

  // Update agent
  updateAgent: (updates: Partial<Agent>) => Promise<boolean>;

  // Custom knowledge
  customKnowledges: CustomKnowledge[];
  setCustomKnowledges: (knowledges: CustomKnowledge[]) => void;
  fetchCustomKnowledge: (companyId: string) => Promise<void>;

  // Prompt settings
  promptSettings: PromptSettings;
  setPromptSettings: (settings: PromptSettings) => void;
  fetchPromptSettings: (agentId: string) => Promise<void>;
  savePromptSettings: (agentId: string) => Promise<boolean>;

  // Plan check helpers
  isPro: boolean;
  isMax: boolean;
  isProOrHigher: boolean;
};

const AgentContext = createContext<AgentContextType | undefined>(undefined);

// ========================================
// Provider
// ========================================

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customKnowledges, setCustomKnowledges] = useState<CustomKnowledge[]>([]);
  const [promptSettings, setPromptSettings] = useState<PromptSettings>({
    systemPrompt: "",
    knowledge: "",
    style: "",
    ngResponses: "",
    guardrails: "",
  });

  // Fetch agent with company info
  const fetchAgent = useCallback(async (agentId: string) => {
    setLoading(true);
    setError(null);
    try {
      // Fetch agent directly from API
      const res = await fetch(`/api/agents/${agentId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("Agent not found");
        } else {
          throw new Error("Failed to fetch agent");
        }
        return;
      }

      const data = await res.json();

      if (data.agent) {
        setAgent(data.agent as Agent);
      }
      if (data.company) {
        setCompany(data.company as Company);
      }
    } catch (err) {
      console.error("Failed to fetch agent:", err);
      setError("Failed to load agent");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAgent = useCallback(async () => {
    if (agent?.agentId) {
      await fetchAgent(agent.agentId);
    }
  }, [agent?.agentId, fetchAgent]);

  // Update agent
  const updateAgent = useCallback(async (updates: Partial<Agent>): Promise<boolean> => {
    if (!agent?.agentId) return false;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agent.agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update agent");
      }

      // Update local state
      setAgent(prev => prev ? { ...prev, ...updates } : null);
      return true;
    } catch (err) {
      console.error("Failed to update agent:", err);
      setError(err instanceof Error ? err.message : "Failed to update agent");
      return false;
    } finally {
      setSaving(false);
    }
  }, [agent?.agentId]);

  // Fetch custom knowledge
  const fetchCustomKnowledge = useCallback(async (companyId: string) => {
    try {
      const res = await fetch(`/api/knowledge?companyId=${companyId}`);
      if (res.ok) {
        const data = await res.json();
        setCustomKnowledges(data.knowledges || []);
      }
    } catch (err) {
      console.error("Failed to fetch knowledge:", err);
    }
  }, []);

  // Fetch prompt settings
  const fetchPromptSettings = useCallback(async (agentId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/prompt`);
      if (res.ok) {
        const data = await res.json();
        setPromptSettings({
          systemPrompt: data.systemPrompt || "",
          knowledge: data.knowledge || "",
          style: data.style || "",
          ngResponses: data.ngResponses || "",
          guardrails: data.guardrails || "",
        });
      }
    } catch (err) {
      console.error("Failed to fetch prompt settings:", err);
    }
  }, []);

  // Save prompt settings
  const savePromptSettings = useCallback(async (agentId: string): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/prompt`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: promptSettings.systemPrompt,
          knowledge: promptSettings.knowledge,
          style: promptSettings.style,
          ngResponses: promptSettings.ngResponses,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save prompt settings");
      }

      return true;
    } catch (err) {
      console.error("Failed to save prompt settings:", err);
      setError(err instanceof Error ? err.message : "Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  }, [promptSettings]);

  // Plan check helpers
  const isPro = company?.plan === "pro";
  const isMax = company?.plan === "max";
  const isProOrHigher = isPro || isMax;

  return (
    <AgentContext.Provider
      value={{
        agent,
        company,
        setAgent,
        setCompany,
        loading,
        saving,
        setLoading,
        setSaving,
        error,
        setError,
        fetchAgent,
        refreshAgent,
        updateAgent,
        customKnowledges,
        setCustomKnowledges,
        fetchCustomKnowledge,
        promptSettings,
        setPromptSettings,
        fetchPromptSettings,
        savePromptSettings,
        isPro,
        isMax,
        isProOrHigher,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}

// ========================================
// Hook
// ========================================

export function useAgent() {
  const context = useContext(AgentContext);
  if (context === undefined) {
    throw new Error("useAgent must be used within an AgentProvider");
  }
  return context;
}
