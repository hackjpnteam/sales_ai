"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles, Users, Bot, MessageSquare, Plus, ArrowRight, ChevronRight } from "lucide-react";

type Agent = {
  _id: string;
  agentId: string;
  companyId: string;
  name: string;
  welcomeMessage: string;
  voiceEnabled: boolean;
  themeColor: string;
  createdAt: string;
};

type Company = {
  _id: string;
  companyId: string;
  name: string;
  rootUrl: string;
  language: string;
  createdAt: string;
};

export default function AdminPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [agentsRes, companiesRes] = await Promise.all([
        fetch("/api/admin/agents"),
        fetch("/api/admin/companies"),
      ]);

      if (agentsRes.ok) {
        const data = await agentsRes.json();
        setAgents(data.agents || []);
      }

      if (companiesRes.ok) {
        const data = await companiesRes.json();
        setCompanies(data.companies || []);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getCompanyName = (companyId: string) => {
    const company = companies.find(c => c.companyId === companyId);
    return company?.name || companyId;
  };

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background: "linear-gradient(180deg, #fff7fb 0%, #ffe9f4 50%, #ffd6eb 100%)",
        }}
      >
        <div className="flex items-center gap-3 text-pink-500">
          <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
          <span className="font-medium">読み込み中...</span>
        </div>
      </div>
    );
  }

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
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-white font-bold text-xl tracking-tight">Saleschat AI</h1>
                <p className="text-white/70 text-xs">管理画面</p>
              </div>
            </Link>
          </div>
          <Link
            href="/admin/agents/new"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/20 backdrop-blur-sm text-white text-sm font-medium hover:bg-white/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            新規エージェント
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* 統計カード */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg border border-pink-100 p-6">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)" }}
              >
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-3xl font-bold text-slate-800">{companies.length}</div>
                <div className="text-sm text-slate-500">登録企業数</div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-pink-100 p-6">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)" }}
              >
                <Bot className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-3xl font-bold text-slate-800">{agents.length}</div>
                <div className="text-sm text-slate-500">AIエージェント数</div>
              </div>
            </div>
          </div>

          <Link
            href="/admin/logs"
            className="bg-white rounded-2xl shadow-lg border border-pink-100 p-6 hover:border-pink-300 hover:shadow-xl transition-all group"
          >
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)" }}
              >
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="text-xl font-bold text-slate-800">会話ログ</div>
                <div className="text-sm text-slate-500">すべてのログを確認</div>
              </div>
              <ArrowRight className="w-5 h-5 text-pink-400 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>

        {/* エージェント一覧 */}
        <div className="bg-white rounded-2xl shadow-lg border border-pink-100 overflow-hidden">
          <div className="p-6 border-b border-pink-100">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Bot className="w-5 h-5 text-pink-500" />
              エージェント一覧
            </h2>
          </div>

          {agents.length === 0 ? (
            <div className="p-12 text-center">
              <div
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)" }}
              >
                <Bot className="w-8 h-8 text-white" />
              </div>
              <p className="text-slate-500 mb-4">まだエージェントが登録されていません</p>
              <Link
                href="/admin/agents/new"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all hover:shadow-lg"
                style={{ background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)" }}
              >
                <Plus className="w-4 h-4" />
                最初のエージェントを作成
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-pink-50">
              {agents.map((agent) => (
                <Link
                  key={agent._id}
                  href={`/admin/agents/${agent.agentId}`}
                  className="p-6 flex items-center justify-between hover:bg-pink-50/50 transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md"
                      style={{
                        background: `linear-gradient(135deg, ${agent.themeColor || "#FF6FB1"} 0%, ${agent.themeColor || "#FF5E9F"} 100%)`,
                      }}
                    >
                      {agent.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800">{agent.name}</div>
                      <div className="text-sm text-slate-500">
                        {getCompanyName(agent.companyId)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-xs text-slate-400">
                      {new Date(agent.createdAt).toLocaleDateString("ja-JP")}
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        agent.voiceEnabled
                          ? "bg-pink-100 text-pink-600"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {agent.voiceEnabled ? "音声ON" : "音声OFF"}
                    </span>
                    <ChevronRight className="w-5 h-5 text-pink-300 group-hover:text-pink-500 group-hover:translate-x-1 transition-all" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
