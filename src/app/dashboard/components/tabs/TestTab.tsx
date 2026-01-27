"use client";

import { useState, useEffect, useRef } from "react";
import { MessageCircle, Send, Loader2, RefreshCw, Sparkles, HelpCircle, FileText, Phone, Mail } from "lucide-react";
import { useAgent, type QuickButton } from "../AgentContext";
import { SectionCard } from "../shared";

type Message = {
  role: "user" | "assistant";
  content: string;
  followUpButtons?: QuickButton[];
};

// マークダウンリンクをHTMLに変換
function convertMarkdownToHtml(text: string): string {
  // マークダウンリンク [text](url) を <a> タグに変換
  return text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}

export function TestTab() {
  const { agent, company } = useAgent();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `test-${Date.now()}`);
  const [currentFollowUpButtons, setCurrentFollowUpButtons] = useState<QuickButton[] | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Add welcome message on mount
  useEffect(() => {
    if (agent?.welcomeMessage && messages.length === 0) {
      setMessages([{ role: "assistant", content: agent.welcomeMessage }]);
    }
  }, [agent?.welcomeMessage, messages.length]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || loading || !agent) return;

    const userMessage = messageText.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          companyId: agent.companyId,
          agentId: agent.agentId,
          sessionId,
          language: agent.languages?.[0] || "ja",
          pageUrl: window.location.href,
          deviceType: "pc",
        }),
      });

      if (!res.ok) {
        throw new Error("Chat request failed");
      }

      const data = await res.json();

      if (data.reply) {
        // L2がある場合のみフォローアップボタンを更新、なければ現在のL1を維持
        if (data.followUpButtons && data.followUpButtons.length > 0) {
          setCurrentFollowUpButtons(data.followUpButtons);
        }
        // currentFollowUpButtonsは維持される（L2がない場合はL1が残る）

        setMessages((prev) => [...prev, {
          role: "assistant",
          content: data.reply,
        }]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "エラーが発生しました。もう一度お試しください。" },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    sendMessage(input);
  };

  const handleQuickButtonClick = (button: QuickButton) => {
    // L2がある場合のみ更新、なければ現在のL1を維持
    if (button.followUpButtons && button.followUpButtons.length > 0) {
      setCurrentFollowUpButtons(button.followUpButtons);
    }
    sendMessage(button.query);
  };

  const handleReset = () => {
    setMessages(agent?.welcomeMessage ? [{ role: "assistant", content: agent.welcomeMessage }] : []);
    setCurrentFollowUpButtons(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
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
    <SectionCard
      title="チャットテスト"
      description="エージェントの動作をテストできます"
      icon={<MessageCircle className="w-5 h-5" />}
      headerAction={
        <button
          onClick={handleReset}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <RefreshCw className="w-4 h-4" />
          リセット
        </button>
      }
    >
      <div className="flex flex-col h-[500px]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} gap-2`}
            >
              {/* Avatar for assistant */}
              {message.role === "assistant" && (
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-slate-200">
                  {agent.avatarUrl ? (
                    <img src={agent.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: agent.themeColor + "20" }}>
                      <MessageCircle className="w-4 h-4" style={{ color: agent.themeColor }} />
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-2 max-w-[80%]">
                <div
                  className={`rounded-2xl px-4 py-2.5 ${
                    message.role === "user"
                      ? "bg-gradient-to-r from-rose-500 to-rose-600 text-white"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  <div
                    className="text-sm whitespace-pre-wrap [&_a]:text-rose-600 [&_a]:underline [&_a]:hover:text-rose-700"
                    dangerouslySetInnerHTML={{ __html: convertMarkdownToHtml(message.content) }}
                  />
                </div>
                {/* Follow-up buttons - 最後のメッセージにのみ表示 */}
                {message.role === "assistant" && index === messages.length - 1 && currentFollowUpButtons && currentFollowUpButtons.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {currentFollowUpButtons.map((btn, btnIndex) => {
                      const icons = [Sparkles, HelpCircle, FileText, Phone, Mail];
                      const Icon = icons[btnIndex % icons.length];
                      return (
                        <button
                          key={btnIndex}
                          onClick={() => handleQuickButtonClick(btn)}
                          disabled={loading}
                          className="group flex items-center gap-2 px-4 py-2 text-sm bg-white border-2 rounded-xl text-slate-700 hover:shadow-md transition-all disabled:opacity-50"
                          style={{
                            borderColor: `${agent.themeColor}30`,
                          }}
                        >
                          <Icon
                            className="w-4 h-4 transition-transform group-hover:scale-110"
                            style={{ color: agent.themeColor }}
                          />
                          <span className="font-medium">{btn.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex justify-start gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-slate-200">
                {agent.avatarUrl ? (
                  <img src={agent.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: agent.themeColor + "20" }}>
                    <MessageCircle className="w-4 h-4" style={{ color: agent.themeColor }} />
                  </div>
                )}
              </div>
              <div className="bg-slate-100 rounded-2xl px-4 py-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Initial quick buttons */}
        {agent.quickButtons && agent.quickButtons.length > 0 && messages.length <= 1 && !loading && (
          <div className="flex flex-wrap gap-2 mb-4 justify-center">
            {agent.quickButtons.map((button, index) => {
              const icons = [Sparkles, HelpCircle, FileText, Phone, Mail];
              const Icon = icons[index % icons.length];
              return (
                <button
                  key={index}
                  onClick={() => handleQuickButtonClick(button)}
                  className="group flex items-center gap-2 px-4 py-2.5 text-sm bg-white border-2 rounded-xl text-slate-700 hover:shadow-lg transition-all"
                  style={{
                    borderColor: `${agent.themeColor}30`,
                  }}
                >
                  <Icon
                    className="w-4 h-4 transition-transform group-hover:scale-110"
                    style={{ color: agent.themeColor }}
                  />
                  <span className="font-medium">{button.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力..."
            className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="px-4 py-3 bg-gradient-to-r from-rose-500 to-rose-600 text-white rounded-xl hover:from-rose-600 hover:to-rose-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </SectionCard>
  );
}
