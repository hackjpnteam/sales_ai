"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX, Sparkles, Building2, Users, Briefcase } from "lucide-react";
import ReactMarkdown from "react-markdown";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

export default function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string; agentName?: string }>;
}) {
  const [companyId, setCompanyId] = useState("");
  const [agentName, setAgentName] = useState("AI コンシェルジュ");
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Next.js 15では searchParams は Promise - useEffect内で処理
  useEffect(() => {
    searchParams.then((params) => {
      setCompanyId(params.companyId || "");
      setAgentName(params.agentName || "AI コンシェルジュ");
    });
  }, [searchParams]);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "こんにちは！何についてお聞きになりたいですか？",
      timestamp: new Date(),
    },
  ]);
  const [showQuickButtons, setShowQuickButtons] = useState(true);

  // クイック質問の選択肢
  const quickQuestions = [
    { icon: Building2, label: "会社について", query: "会社について教えてください" },
    { icon: Users, label: "採用について", query: "採用情報について教えてください" },
    { icon: Briefcase, label: "サービスについて", query: "提供しているサービスについて教えてください" },
  ];
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  // 音声入力関連
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);


  // 自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // メッセージID生成
  const generateId = () => Math.random().toString(36).substring(2, 9);

  // クイックボタンのクリック処理
  const handleQuickQuestion = (query: string) => {
    setShowQuickButtons(false);
    sendMessage(query);
  };

  // チャット送信
  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || !companyId) return;

    setShowQuickButtons(false);
    setInput("");
    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      // POST /api/chat
      // Request: { companyId: string, agentId?: string, message: string, sessionId?: string }
      // Response: { reply: string, sessionId: string }
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          message: messageText,
          sessionId,
        }),
      });

      const data = await res.json();
      const reply = data.reply || "申し訳ございません。応答を取得できませんでした。";

      if (data.sessionId) {
        setSessionId(data.sessionId);
      }

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: reply,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // TTS再生
      if (voiceEnabled) {
        await playTTS(reply);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: "assistant",
          content: "エラーが発生しました。もう一度お試しください。",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // TTS再生
  const playTTS = async (text: string) => {
    try {
      // POST /api/tts
      // Request: { text: string }
      // Response: audio/mpeg blob
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        setIsPlaying(true);
        audio.play();
        audio.onended = () => {
          setIsPlaying(false);
          audioRef.current = null;
          URL.revokeObjectURL(url);
        };
      }
    } catch (error) {
      console.error("TTS error:", error);
    }
  };

  // TTS停止
  const stopTTS = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
      setIsPlaying(false);
    }
  };

  // 録音開始
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });

        setIsTranscribing(true);
        try {
          // POST /api/stt
          // Request: FormData with audio file
          // Response: { text: string }
          const formData = new FormData();
          formData.append("audio", audioBlob, "recording.webm");

          const res = await fetch("/api/stt", {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            const data = await res.json();
            if (data.text) {
              // 音声認識結果を直接送信
              await sendMessage(data.text);
            }
          }
        } catch (error) {
          console.error("STT error:", error);
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
      alert("マイクへのアクセスが許可されていません。");
    }
  };

  // 録音停止
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // キーボードイベント（Shift+Enterで送信、Enterのみは改行）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // 時刻フォーマット
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #fff7fb 0%, #ffe9f4 50%, #ffd6eb 100%)",
      }}
    >
      {/* ヘッダー - ピンクグラデーション */}
      <div
        className="flex-shrink-0 px-5 py-4"
        style={{
          background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 50%, #FF7C8F 100%)",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white font-semibold text-lg tracking-tight">{agentName}</h1>
            <p className="text-white/80 text-xs">24時間対応のAIアシスタント</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isPlaying ? (
              <button
                onClick={stopTTS}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/20 text-white text-xs font-medium hover:bg-white/30 transition-all"
                title="クリックで停止"
              >
                <VolumeX className="w-4 h-4" />
                <span className="animate-pulse">停止</span>
              </button>
            ) : (
              <button
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                className={`p-2 rounded-full transition-all ${
                  voiceEnabled
                    ? "bg-white/20 text-white"
                    : "bg-white/10 text-white/60"
                }`}
                title={voiceEnabled ? "音声ON" : "音声OFF"}
              >
                {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

      </div>

      {/* メッセージエリア */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, index) => (
          <div key={msg.id}>
          {/* メッセージ表示 */}
          <div
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] ${
                msg.role === "user"
                  ? "order-1"
                  : "order-1"
              }`}
            >
              {/* アバター + バブル */}
              <div className={`flex items-end gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                {/* アバター */}
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-pink-400 to-pink-600"
                      : "bg-white border border-pink-200 shadow-sm"
                  }`}
                >
                  {msg.role === "user" ? (
                    <span className="text-white text-xs font-medium">U</span>
                  ) : (
                    <Sparkles className="w-4 h-4 text-pink-500" />
                  )}
                </div>

                {/* メッセージバブル */}
                <div
                  className={`px-4 py-3 rounded-2xl ${
                    msg.role === "user"
                      ? "rounded-br-md text-white shadow-lg"
                      : "rounded-bl-md bg-white text-slate-700 border border-pink-100 shadow-sm"
                  }`}
                  style={
                    msg.role === "user"
                      ? {
                          background: "linear-gradient(135deg, #FF6FB1 0%, #FF5E9F 100%)",
                        }
                      : {}
                  }
                >
                  <div className="text-sm leading-relaxed prose prose-sm prose-slate max-w-none prose-a:text-pink-500 prose-a:underline hover:prose-a:text-pink-600 prose-headings:text-slate-800 prose-headings:font-semibold prose-headings:mt-2 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                    <ReactMarkdown
                      components={{
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-pink-500 underline hover:text-pink-600">
                            {children}
                          </a>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                  <p
                    className={`text-[10px] mt-1.5 ${
                      msg.role === "user" ? "text-white/70" : "text-slate-400"
                    }`}
                  >
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            </div>
          </div>
          {/* ウェルカムメッセージの後にクイックボタンを表示 */}
          {msg.id === "welcome" && showQuickButtons && (
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {quickQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickQuestion(q.query)}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl border border-pink-200 text-sm text-slate-700 hover:border-pink-400 hover:bg-pink-50 transition-all shadow-sm disabled:opacity-50"
                >
                  <q.icon className="w-4 h-4 text-pink-500" />
                  {q.label}
                </button>
              ))}
            </div>
          )}
          </div>
        ))}

        {/* ローディング */}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-end gap-2">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border border-pink-200 shadow-sm flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-pink-500" />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white border border-pink-100 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 音声変換中 */}
        {isTranscribing && (
          <div className="flex justify-center">
            <div className="px-4 py-2 rounded-full bg-white/80 backdrop-blur-sm border border-pink-200 shadow-sm">
              <p className="text-xs text-pink-600 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
                音声を認識中...
              </p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 入力エリア */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2">
        <div className="bg-white rounded-2xl shadow-lg border border-pink-100 p-3">
          {/* 録音中のインジケーター */}
          {isRecording && (
            <div className="flex items-center justify-center gap-2 mb-3 py-2 bg-pink-50 rounded-xl">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <div className="w-3 h-3 rounded-full bg-red-400 animate-pulse" style={{ animationDelay: "100ms" }} />
                <div className="w-4 h-4 rounded-full bg-red-300 animate-pulse" style={{ animationDelay: "200ms" }} />
                <div className="w-3 h-3 rounded-full bg-red-400 animate-pulse" style={{ animationDelay: "300ms" }} />
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" style={{ animationDelay: "400ms" }} />
              </div>
              <span className="text-sm text-red-600 font-medium ml-2">録音中... タップで停止</span>
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* マイクボタン */}
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              disabled={loading || isTranscribing}
              className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                isRecording
                  ? "bg-red-500 text-white shadow-lg scale-110"
                  : isTranscribing
                  ? "bg-yellow-100 text-yellow-600"
                  : "bg-pink-50 text-pink-500 hover:bg-pink-100 hover:scale-105"
              } ${(loading || isTranscribing) && !isRecording ? "opacity-50 cursor-not-allowed" : ""}`}
              title="長押しで音声入力"
            >
              {isTranscribing ? (
                <div className="w-5 h-5 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin" />
              ) : isRecording ? (
                <MicOff className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>

            {/* テキスト入力 */}
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="メッセージを入力..."
                rows={1}
                disabled={isRecording || isTranscribing || loading}
                className="w-full px-4 py-3 pr-12 rounded-xl bg-slate-50 text-slate-700 placeholder-slate-400 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-pink-300 focus:bg-white transition-all disabled:opacity-50"
                style={{ minHeight: "48px", maxHeight: "120px" }}
              />
              {/* 送信ボタン */}
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim() || isRecording || isTranscribing}
                className={`absolute right-2 bottom-2 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  input.trim() && !loading
                    ? "bg-gradient-to-r from-pink-500 to-pink-600 text-white shadow-md hover:shadow-lg hover:scale-105"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* フッター */}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[10px] text-slate-400">
              Powered by AI • 24時間対応
            </p>
            <p className="text-[10px] text-slate-400">
              {voiceEnabled ? "🎧 音声応答ON" : "🔇 音声応答OFF"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
