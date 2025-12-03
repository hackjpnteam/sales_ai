"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles, ArrowLeft, MessageSquare, User, Bot } from "lucide-react";

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

export default function LogsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/admin/logs?limit=500");
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("ja-JP", {
      year: "numeric",
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
            href="/admin"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/20 backdrop-blur-sm text-white text-sm font-medium hover:bg-white/30 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            戻る
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-tight">会話ログ</h1>
              <p className="text-white/70 text-xs">{sessions.length}件のセッション</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-3 gap-6">
          {/* セッション一覧 */}
          <div className="bg-white rounded-2xl shadow-lg border border-pink-100 overflow-hidden">
            <div className="p-4 border-b border-pink-100 bg-pink-50/50">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-pink-500" />
                セッション一覧
              </h2>
            </div>
            <div className="divide-y divide-pink-50 max-h-[600px] overflow-y-auto">
              {sessions.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  ログがありません
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

          {/* 会話詳細 */}
          <div className="md:col-span-2 bg-white rounded-2xl shadow-lg border border-pink-100 overflow-hidden">
            <div className="p-4 border-b border-pink-100 bg-pink-50/50">
              <h2 className="font-semibold text-slate-800">会話詳細</h2>
              {selectedSession && (
                <p className="text-xs text-slate-500 truncate mt-1">
                  Session: {selectedSession}
                </p>
              )}
            </div>
            <div className="p-4 max-h-[600px] overflow-y-auto">
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
              ) : selectedMessages.length === 0 ? (
                <div className="text-center text-slate-400 py-12">
                  メッセージがありません
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
    </div>
  );
}
