"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Send, Volume2, VolumeX, Sparkles, Building2, Users, Briefcase, ExternalLink, Play, Square } from "lucide-react";
import ReactMarkdown from "react-markdown";

type RelatedLink = {
  url: string;
  title: string;
  description: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  type?: "text" | "links";
  links?: RelatedLink[];
};

type Language = "ja" | "en";

// Translations
const translations = {
  ja: {
    defaultAgentName: "AI コンシェルジュ",
    welcomeMessage: "こんにちは！何についてお聞きになりたいですか？",
    subtitle: "24時間対応のAIアシスタント",
    stop: "停止",
    play: "再生",
    voiceOn: "音声ON",
    voiceOff: "音声OFF",
    recognizingVoice: "音声を認識中...",
    recording: "録音中... タップで停止",
    inputPlaceholder: "メッセージを入力...",
    poweredBy: "Powered by AI • 24時間対応",
    voiceResponseOn: "🎧 音声応答ON",
    voiceResponseOff: "🔇 音声応答OFF",
    errorResponse: "申し訳ございません。応答を取得できませんでした。",
    errorGeneral: "エラーが発生しました。もう一度お試しください。",
    micPermissionError: "マイクへのアクセスが許可されていません。",
    holdToSpeak: "長押しで音声入力",
    relatedLinks: "関連リンク",
    quickQuestions: [
      { label: "会社について", query: "会社について教えてください" },
      { label: "採用について", query: "採用情報について教えてください" },
      { label: "サービスについて", query: "提供しているサービスについて教えてください" },
    ],
  },
  en: {
    defaultAgentName: "AI Concierge",
    welcomeMessage: "Hello! What would you like to know about?",
    subtitle: "24/7 AI Assistant",
    stop: "Stop",
    play: "Play",
    voiceOn: "Voice ON",
    voiceOff: "Voice OFF",
    recognizingVoice: "Recognizing voice...",
    recording: "Recording... Tap to stop",
    inputPlaceholder: "Type a message...",
    poweredBy: "Powered by AI • Available 24/7",
    voiceResponseOn: "🎧 Voice Response ON",
    voiceResponseOff: "🔇 Voice Response OFF",
    errorResponse: "Sorry, we could not get a response.",
    errorGeneral: "An error occurred. Please try again.",
    micPermissionError: "Microphone access is not allowed.",
    holdToSpeak: "Hold to speak",
    relatedLinks: "Related Links",
    quickQuestions: [
      { label: "About Company", query: "Tell me about the company" },
      { label: "Careers", query: "Tell me about job opportunities" },
      { label: "Services", query: "Tell me about your services" },
    ],
  },
};

export default function WidgetPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string; agentName?: string }>;
}) {
  const [companyId, setCompanyId] = useState("");
  const [language, setLanguage] = useState<Language>("ja");
  const [agentName, setAgentName] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [themeColor, setThemeColor] = useState("#FF6FB1"); // デフォルトのピンク

  const t = translations[language];

  // 色からグラデーションを生成
  const generateGradient = (baseColor: string) => {
    // hex to rgb
    const r = parseInt(baseColor.slice(1, 3), 16);
    const g = parseInt(baseColor.slice(3, 5), 16);
    const b = parseInt(baseColor.slice(5, 7), 16);

    // より明るいバージョン
    const lighterR = Math.min(255, r + 30);
    const lighterG = Math.min(255, g + 30);
    const lighterB = Math.min(255, b + 30);
    const lighter = `rgb(${lighterR}, ${lighterG}, ${lighterB})`;

    // より暗いバージョン
    const darkerR = Math.max(0, r - 20);
    const darkerG = Math.max(0, g - 20);
    const darkerB = Math.max(0, b - 20);
    const darker = `rgb(${darkerR}, ${darkerG}, ${darkerB})`;

    return `linear-gradient(135deg, ${baseColor} 0%, ${darker} 50%, ${lighter} 100%)`;
  };

  // Next.js 15では searchParams は Promise - useEffect内で処理
  useEffect(() => {
    searchParams.then(async (params) => {
      const cid = params.companyId || "";
      setCompanyId(cid);

      if (cid) {
        // Fetch company and agent info to get language setting
        try {
          const res = await fetch(`/api/company/${cid}`);
          if (res.ok) {
            const data = await res.json();
            if (data.company?.language) {
              setLanguage(data.company.language);
            }
            if (data.agent?.name) {
              setAgentName(data.agent.name);
            }
            if (data.agent?.themeColor) {
              setThemeColor(data.agent.themeColor);
            }
            if (data.agent?.welcomeMessage) {
              setMessages([{
                id: "welcome",
                role: "assistant",
                content: data.agent.welcomeMessage,
                timestamp: new Date(),
              }]);
            }
          }
        } catch (error) {
          console.error("Failed to fetch company info:", error);
        }
      }

      if (params.agentName) {
        setAgentName(params.agentName);
      }

      setIsInitialized(true);
    });
  }, [searchParams]);

  // Set default agent name based on language after initialization
  useEffect(() => {
    if (isInitialized && !agentName) {
      setAgentName(t.defaultAgentName);
    }
  }, [isInitialized, language, agentName, t.defaultAgentName]);

  // Update welcome message when language changes and no custom message
  useEffect(() => {
    if (isInitialized && messages.length === 1 && messages[0].id === "welcome") {
      // Only update if it's the default welcome message
      const isDefaultJa = messages[0].content === translations.ja.welcomeMessage;
      const isDefaultEn = messages[0].content === translations.en.welcomeMessage;
      if (isDefaultJa || isDefaultEn) {
        setMessages([{
          id: "welcome",
          role: "assistant",
          content: t.welcomeMessage,
          timestamp: new Date(),
        }]);
      }
    }
  }, [language, isInitialized]);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: translations.ja.welcomeMessage,
      timestamp: new Date(),
    },
  ]);
  const [showQuickButtons, setShowQuickButtons] = useState(true);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastReply, setLastReply] = useState<string | null>(null);

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
      const reply = data.reply || t.errorResponse;
      const relatedLinks: RelatedLink[] = data.relatedLinks || [];

      if (data.sessionId) {
        setSessionId(data.sessionId);
      }

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: reply,
        timestamp: new Date(),
        type: "text",
      };

      // メッセージを追加（本文のみ）
      setMessages((prev) => [...prev, assistantMessage]);

      // 最後の回答を保存（再生用）
      setLastReply(reply);

      // 関連リンクがあれば、別のメッセージとして追加
      if (relatedLinks.length > 0) {
        const linksMessage: Message = {
          id: generateId(),
          role: "assistant",
          content: t.relatedLinks,
          timestamp: new Date(),
          type: "links",
          links: relatedLinks,
        };
        setMessages((prev) => [...prev, linksMessage]);
      }

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
          content: t.errorGeneral,
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

  // 録音開始時刻を保持
  const recordingStartTimeRef = useRef<number>(0);

  // 録音開始
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        }
      });

      // サポートされているMIMEタイプを確認
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      recordingStartTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());

        const recordingDuration = Date.now() - recordingStartTimeRef.current;
        console.log("[Recording] Duration:", recordingDuration, "ms");

        // 録音が短すぎる場合（500ms未満）はスキップ
        if (recordingDuration < 500) {
          console.log("[Recording] Too short, skipping transcription");
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        console.log("[Recording] Blob size:", audioBlob.size, "bytes");

        // 音声データが小さすぎる場合はスキップ
        if (audioBlob.size < 1000) {
          console.log("[Recording] Blob too small, skipping transcription");
          return;
        }

        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("audio", audioBlob, "recording.webm");
          formData.append("language", language); // 言語設定を送信

          const res = await fetch("/api/stt", {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            const data = await res.json();
            if (data.text && data.text.trim()) {
              console.log("[STT] Transcribed:", data.text);
              await sendMessage(data.text);
            } else {
              console.log("[STT] Empty transcription result");
            }
          } else {
            console.error("[STT] API error:", res.status);
          }
        } catch (error) {
          console.error("STT error:", error);
        } finally {
          setIsTranscribing(false);
        }
      };

      // 100msごとにデータを取得（より細かくデータを収集）
      mediaRecorder.start(100);
      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
      alert(t.micPermissionError);
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
    return date.toLocaleTimeString(language === "ja" ? "ja-JP" : "en-US", {
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
      {/* Header */}
      <div
        className="flex-shrink-0 px-5 py-4"
        style={{
          background: generateGradient(themeColor),
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white font-semibold text-lg tracking-tight">{agentName || t.defaultAgentName}</h1>
            <p className="text-white/80 text-xs">{t.subtitle}</p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {/* 再生/停止ボタン */}
            {isPlaying ? (
              <button
                onClick={stopTTS}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-red-500/80 text-white text-xs font-medium hover:bg-red-500 transition-all"
                title={t.stop}
              >
                <Square className="w-3.5 h-3.5" />
                <span>{t.stop}</span>
              </button>
            ) : lastReply ? (
              <button
                onClick={() => playTTS(lastReply)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/20 text-white text-xs font-medium hover:bg-white/30 transition-all"
                title={t.play}
              >
                <Play className="w-3.5 h-3.5" />
                <span>{t.play}</span>
              </button>
            ) : null}
            {/* 音声ON/OFFボタン */}
            <button
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className={`p-2 rounded-full transition-all ${
                voiceEnabled
                  ? "bg-white/20 text-white"
                  : "bg-white/10 text-white/60"
              }`}
              title={voiceEnabled ? t.voiceOn : t.voiceOff}
            >
              {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </div>

      </div>

      {/* Message area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id}>
          {/* Link cards message */}
          {msg.type === "links" && msg.links && msg.links.length > 0 ? (
            <div className="flex justify-start">
              <div className="max-w-[85%]">
                <div className="flex items-end gap-2">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border border-pink-200 shadow-sm flex items-center justify-center">
                    <ExternalLink className="w-4 h-4 text-pink-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-500 mb-2 ml-1">{msg.content}</p>
                    <div className="space-y-2">
                      {msg.links.map((link, idx) => {
                        const hostname = new URL(link.url).hostname;
                        const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
                        return (
                          <a
                            key={idx}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block bg-white rounded-xl border border-pink-100 shadow-sm hover:shadow-md hover:border-pink-300 transition-all overflow-hidden"
                          >
                            <div className="flex gap-3 p-3">
                              <div className="flex-shrink-0 w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden">
                                <img
                                  src={faviconUrl}
                                  alt=""
                                  className="w-8 h-8 object-contain"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                  }}
                                />
                                <ExternalLink className="w-5 h-5 text-pink-500 hidden" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 line-clamp-1">{link.title}</p>
                                <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">{link.description}</p>
                                <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                  <ExternalLink className="w-3 h-3" />
                                  {hostname}
                                </p>
                              </div>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
          /* Regular message display */
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
              {/* Avatar + Bubble */}
              <div className={`flex items-end gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                {/* Avatar */}
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    msg.role === "user"
                      ? ""
                      : "bg-white shadow-sm"
                  }`}
                  style={
                    msg.role === "user"
                      ? { background: generateGradient(themeColor) }
                      : { border: `1px solid ${themeColor}30` }
                  }
                >
                  {msg.role === "user" ? (
                    <span className="text-white text-xs font-medium">U</span>
                  ) : (
                    <Sparkles className="w-4 h-4" style={{ color: themeColor }} />
                  )}
                </div>

                {/* Message bubble */}
                <div
                  className={`px-4 py-3 rounded-2xl ${
                    msg.role === "user"
                      ? "rounded-br-md text-white shadow-lg"
                      : "rounded-bl-md bg-white text-slate-700 border border-pink-100 shadow-sm"
                  }`}
                  style={
                    msg.role === "user"
                      ? {
                          background: generateGradient(themeColor),
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
          )}
          {/* Quick buttons after welcome message */}
          {msg.id === "welcome" && showQuickButtons && (
            <div className="flex flex-wrap gap-2 justify-center mt-4">
              {t.quickQuestions.map((q, i) => {
                const icons = [Building2, Users, Briefcase];
                const Icon = icons[i];
                return (
                  <button
                    key={i}
                    onClick={() => handleQuickQuestion(q.query)}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl border text-sm text-slate-700 transition-all shadow-sm disabled:opacity-50"
                    style={{ borderColor: `${themeColor}40` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: themeColor }} />
                    {q.label}
                  </button>
                );
              })}
            </div>
          )}
          </div>
        ))}

        {/* Loading */}
        {loading && (
          <div className="flex justify-start">
            <div className="flex items-end gap-2">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center" style={{ border: `1px solid ${themeColor}30` }}>
                <Sparkles className="w-4 h-4" style={{ color: themeColor }} />
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-white shadow-sm" style={{ border: `1px solid ${themeColor}20` }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: themeColor, animationDelay: "0ms" }} />
                  <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: themeColor, animationDelay: "150ms" }} />
                  <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: themeColor, animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Voice transcribing */}
        {isTranscribing && (
          <div className="flex justify-center">
            <div className="px-4 py-2 rounded-full bg-white/80 backdrop-blur-sm shadow-sm" style={{ border: `1px solid ${themeColor}30` }}>
              <p className="text-xs flex items-center gap-2" style={{ color: themeColor }}>
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: themeColor }} />
                {t.recognizingVoice}
              </p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2">
        <div className="bg-white rounded-2xl shadow-lg border border-pink-100 p-3">
          {/* Recording indicator */}
          {isRecording && (
            <div className="flex items-center justify-center gap-2 mb-3 py-2 bg-pink-50 rounded-xl">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <div className="w-3 h-3 rounded-full bg-red-400 animate-pulse" style={{ animationDelay: "100ms" }} />
                <div className="w-4 h-4 rounded-full bg-red-300 animate-pulse" style={{ animationDelay: "200ms" }} />
                <div className="w-3 h-3 rounded-full bg-red-400 animate-pulse" style={{ animationDelay: "300ms" }} />
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" style={{ animationDelay: "400ms" }} />
              </div>
              <span className="text-sm text-red-600 font-medium ml-2">{t.recording}</span>
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* Mic button */}
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
                  : "hover:scale-105"
              } ${(loading || isTranscribing) && !isRecording ? "opacity-50 cursor-not-allowed" : ""}`}
              style={
                !isRecording && !isTranscribing
                  ? { backgroundColor: `${themeColor}15`, color: themeColor }
                  : {}
              }
              title={t.holdToSpeak}
            >
              {isTranscribing ? (
                <div className="w-5 h-5 border-2 border-yellow-600 border-t-transparent rounded-full animate-spin" />
              ) : isRecording ? (
                <MicOff className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>

            {/* Text input */}
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.inputPlaceholder}
                rows={1}
                disabled={isRecording || isTranscribing || loading}
                className="w-full px-4 py-3 pr-12 rounded-xl bg-slate-50 text-slate-700 placeholder-slate-400 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-pink-300 focus:bg-white transition-all disabled:opacity-50"
                style={{ minHeight: "48px", maxHeight: "120px" }}
              />
              {/* Send button */}
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim() || isRecording || isTranscribing}
                className={`absolute right-2 bottom-2 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  input.trim() && !loading
                    ? "text-white shadow-md hover:shadow-lg hover:scale-105"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
                style={
                  input.trim() && !loading
                    ? { background: generateGradient(themeColor) }
                    : {}
                }
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[10px] text-slate-400">
              {t.poweredBy}
            </p>
            <p className="text-[10px] text-slate-400">
              {voiceEnabled ? t.voiceResponseOn : t.voiceResponseOff}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
