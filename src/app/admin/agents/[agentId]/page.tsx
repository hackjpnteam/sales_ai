"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { use } from "react";
import { Sparkles, ArrowLeft, Bot, MessageSquare, Users, BarChart3, Volume2, HelpCircle, User } from "lucide-react";
import Footer from "@/components/Footer";

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

type ChatLog = {
  _id: string;
  companyId: string;
  agentId: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type Session = {
  sessionId: string;
  companyId: string;
  agentId: string;
  messages: ChatLog[];
  startedAt: string;
};

type Analytics = {
  totalSessions: number;
  totalMessages: number;
  avgMessagesPerSession: number;
  topQuestions: { question: string; count: number }[];
};

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [agentId]);

  const fetchData = async () => {
    try {
      const agentsRes = await fetch("/api/admin/agents");
      if (agentsRes.ok) {
        const data = await agentsRes.json();
        const foundAgent = data.agents?.find((a: Agent) => a.agentId === agentId);
        setAgent(foundAgent || null);

        if (foundAgent) {
          const logsRes = await fetch(`/api/admin/logs?companyId=${foundAgent.companyId}`);
          if (logsRes.ok) {
            const logsData = await logsRes.json();
            setSessions(logsData.sessions || []);

            const allSessions = logsData.sessions || [];
            const totalMessages = allSessions.reduce(
              (sum: number, s: Session) => sum + s.messages.length,
              0
            );

            const userMessages = allSessions.flatMap((s: Session) =>
              s.messages.filter((m) => m.role === "user").map((m) => m.content)
            );
            const questionCounts = new Map<string, number>();
            userMessages.forEach((q: string) => {
              const normalized = q.slice(0, 50);
              questionCounts.set(normalized, (questionCounts.get(normalized) || 0) + 1);
            });
            const topQuestions = Array.from(questionCounts.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([question, count]) => ({ question, count }));

            setAnalytics({
              totalSessions: allSessions.length,
              totalMessages,
              avgMessagesPerSession:
                allSessions.length > 0
                  ? Math.round(totalMessages / allSessions.length)
                  : 0,
              topQuestions,
            });
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("ja-JP", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const selectedMessages = selectedSession
    ? sessions.find((s) => s.sessionId === selectedSession)?.messages || []
    : [];

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

  if (!agent) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background: "linear-gradient(180deg, #fff7fb 0%, #ffe9f4 50%, #ffd6eb 100%)",
        }}
      >
        <div className="text-center">
          <Bot className="w-16 h-16 text-pink-300 mx-auto mb-4" />
          <p className="text-slate-500">エージェントが見つかりません</p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex items-center gap-2 text-pink-500 hover:text-pink-600"
          >
            <ArrowLeft className="w-4 h-4" />
            管理画面に戻る
          </Link>
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
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/20 backdrop-blur-sm text-white text-sm font-medium hover:bg-white/30 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Link>
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg"
              style={{
                background: `linear-gradient(135deg, ${agent.themeColor || "#FF6FB1"} 0%, ${agent.themeColor || "#FF5E9F"} 100%)`,
              }}
            >
              {agent.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-tight">{agent.name}</h1>
              <p className="text-white/70 text-xs">Powered by hackjpn</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* 分析サマリー */}
        {analytics && (
          <div className="grid md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-2xl shadow-lg border border-pink-100 p-5">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)" }}
                >
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-800">
                    {analytics.totalSessions}
                  </div>
                  <div className="text-xs text-slate-500">総セッション</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-pink-100 p-5">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)" }}
                >
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-800">
                    {analytics.totalMessages}
                  </div>
                  <div className="text-xs text-slate-500">総メッセージ</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-pink-100 p-5">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)" }}
                >
                  <BarChart3 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-800">
                    {analytics.avgMessagesPerSession}
                  </div>
                  <div className="text-xs text-slate-500">平均メッセージ数</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-pink-100 p-5">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)" }}
                >
                  <Volume2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div
                    className={`text-2xl font-bold ${
                      agent.voiceEnabled ? "text-pink-500" : "text-slate-400"
                    }`}
                  >
                    {agent.voiceEnabled ? "ON" : "OFF"}
                  </div>
                  <div className="text-xs text-slate-500">音声機能</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* よくある質問 */}
        {analytics && analytics.topQuestions.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg border border-pink-100 p-6 mb-8">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-pink-500" />
              よくある質問 TOP5
            </h2>
            <div className="space-y-3">
              {analytics.topQuestions.map((q, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-pink-50/50 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                      style={{ background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)" }}
                    >
                      {idx + 1}
                    </span>
                    <span className="text-sm text-slate-700">{q.question}</span>
                  </div>
                  <span className="text-sm font-semibold text-pink-500">
                    {q.count}回
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 会話ログ */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl shadow-lg border border-pink-100 overflow-hidden">
            <div className="p-4 border-b border-pink-100 bg-pink-50/50">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-pink-500" />
                会話セッション
              </h2>
              <p className="text-xs text-slate-500 mt-1">{sessions.length}件</p>
            </div>
            <div className="divide-y divide-pink-50 max-h-[500px] overflow-y-auto">
              {sessions.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  まだ会話がありません
                </div>
              ) : (
                sessions.map((session) => (
                  <button
                    key={session.sessionId}
                    onClick={() => setSelectedSession(session.sessionId)}
                    className={`w-full p-4 text-left hover:bg-pink-50/50 transition-all ${
                      selectedSession === session.sessionId
                        ? "bg-pink-50 border-l-4 border-pink-500"
                        : ""
                    }`}
                  >
                    <div className="text-sm font-medium text-slate-800 truncate">
                      {session.messages[0]?.content || "（空のセッション）"}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-400">
                        {formatDate(session.startedAt)}
                      </span>
                      <span className="text-xs bg-pink-100 text-pink-600 px-2 py-0.5 rounded-full">
                        {session.messages.length}件
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="md:col-span-2 bg-white rounded-2xl shadow-lg border border-pink-100 overflow-hidden">
            <div className="p-4 border-b border-pink-100 bg-pink-50/50">
              <h2 className="font-semibold text-slate-800">会話詳細</h2>
            </div>
            <div className="p-4 max-h-[500px] overflow-y-auto">
              {!selectedSession ? (
                <div className="text-center py-16">
                  <div
                    className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)" }}
                  >
                    <MessageSquare className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-slate-400">セッションを選択してください</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedMessages.map((msg) => (
                    <div
                      key={msg._id}
                      className={`flex ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div className={`flex items-end gap-2 max-w-[80%] ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            msg.role === "user"
                              ? ""
                              : "bg-white border border-pink-200"
                          }`}
                          style={
                            msg.role === "user"
                              ? { background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)" }
                              : {}
                          }
                        >
                          {msg.role === "user" ? (
                            <User className="w-4 h-4 text-white" />
                          ) : (
                            <Bot className="w-4 h-4 text-pink-500" />
                          )}
                        </div>
                        <div
                          className={`p-3 rounded-2xl ${
                            msg.role === "user"
                              ? "text-white rounded-br-md"
                              : "bg-white text-slate-800 border border-pink-100 rounded-bl-md"
                          }`}
                          style={
                            msg.role === "user"
                              ? { background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)" }
                              : {}
                          }
                        >
                          <div className="text-sm whitespace-pre-wrap">
                            {msg.content}
                          </div>
                          <div
                            className={`text-xs mt-1 ${
                              msg.role === "user"
                                ? "text-white/70"
                                : "text-slate-400"
                            }`}
                          >
                            {formatDate(msg.createdAt)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
