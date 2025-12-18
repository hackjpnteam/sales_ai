"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Mic, MicOff, Send, Volume2, VolumeX, Sparkles, Building2, Users, Briefcase, MessageCircle, HelpCircle, ExternalLink, Play, Square, ChevronDown } from "lucide-react";
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

type Language = "ja" | "en" | "zh";

// Color scheme
const colors = {
  primary: "#D86672",      // メインレッド
  background: "#F1E8F0",   // ライトピンクグレー
  text: "#2B2B2B",         // テキスト黒
};

// Loading component for Suspense fallback
function WidgetLoading() {
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center"
      style={{
        background: `linear-gradient(180deg, ${colors.background} 0%, #E8DDE7 50%, #DFD4DE 100%)`,
      }}
    >
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full animate-bounce" style={{ backgroundColor: colors.primary, animationDelay: "0ms" }} />
        <div className="w-3 h-3 rounded-full animate-bounce" style={{ backgroundColor: colors.primary, animationDelay: "150ms" }} />
        <div className="w-3 h-3 rounded-full animate-bounce" style={{ backgroundColor: colors.primary, animationDelay: "300ms" }} />
      </div>
      <p className="mt-4 text-sm" style={{ color: colors.primary }}>読み込み中...</p>
    </div>
  );
}

// Translations
const translations = {
  ja: {
    defaultAgentName: "AI コンシェルジュ",
    welcomeMessage: "いらっしゃいませ。ご質問があれば何でもお聞きください。",
    subtitle: "24時間対応のAIアシスタント",
    stop: "停止",
    play: "再生",
    voiceOn: "音声ON",
    voiceOff: "音声OFF",
    recognizingVoice: "音声を認識中...",
    recording: "録音中... タップで停止",
    inputPlaceholder: "メッセージを入力... (Shift+Enterで送信)",
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
    welcomeMessage: "Welcome! Please feel free to ask me anything.",
    subtitle: "24/7 AI Assistant",
    stop: "Stop",
    play: "Play",
    voiceOn: "Voice ON",
    voiceOff: "Voice OFF",
    recognizingVoice: "Recognizing voice...",
    recording: "Recording... Tap to stop",
    inputPlaceholder: "Type a message... (Shift+Enter to send)",
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
  zh: {
    defaultAgentName: "AI 礼宾服务",
    welcomeMessage: "欢迎光临！如有任何问题，请随时提问。",
    subtitle: "24小时AI助手",
    stop: "停止",
    play: "播放",
    voiceOn: "语音开",
    voiceOff: "语音关",
    recognizingVoice: "正在识别语音...",
    recording: "录音中... 点击停止",
    inputPlaceholder: "输入消息... (Shift+Enter发送)",
    poweredBy: "由AI驱动 • 24小时服务",
    voiceResponseOn: "🎧 语音回复开",
    voiceResponseOff: "🔇 语音回复关",
    errorResponse: "抱歉，无法获取回复。",
    errorGeneral: "发生错误，请重试。",
    micPermissionError: "未允许访问麦克风。",
    holdToSpeak: "长按说话",
    relatedLinks: "相关链接",
    quickQuestions: [
      { label: "关于公司", query: "请告诉我关于公司的信息" },
      { label: "招聘信息", query: "请告诉我关于招聘的信息" },
      { label: "服务内容", query: "请告诉我关于服务的信息" },
    ],
  },
};

function WidgetContent() {
  const searchParams = useSearchParams();
  const [companyId, setCompanyId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [language, setLanguage] = useState<Language>("ja");
  const [agentName, setAgentName] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [themeColor, setThemeColor] = useState(colors.primary);
  const [avatarUrl, setAvatarUrl] = useState("/agent-avatar.png");
  const [messages, setMessages] = useState<Message[]>([]);
  const [showQuickButtons, setShowQuickButtons] = useState(true);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [trackingSessionId] = useState(() => Math.random().toString(36).substring(2, 15));
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [customQuickButtons, setCustomQuickButtons] = useState<{ label: string; query: string }[] | null>(null);
  const [isPro, setIsPro] = useState(false);

  const t = translations[language];

  // Language options
  const languageOptions = [
    { code: "ja" as Language, flag: "🇯🇵", label: "日本語" },
    { code: "en" as Language, flag: "🇺🇸", label: "English" },
    { code: "zh" as Language, flag: "🇨🇳", label: "中文" },
  ];

  const currentLanguage = languageOptions.find(l => l.code === language) || languageOptions[0];

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

  // Next.js useSearchParams を使用
  useEffect(() => {
    const initializeWidget = async () => {
      console.log("[Widget] useEffect triggered - reading searchParams");
      const cid = searchParams.get("companyId") || "";
      const paramAgentName = searchParams.get("agentName") || "";
      const paramThemeColor = searchParams.get("themeColor") || "";
      console.log("[Widget] Company ID from params:", cid, "Agent Name:", paramAgentName, "Theme Color:", paramThemeColor);

      if (!cid) {
        console.error("[Widget] ERROR: No companyId provided in URL params!");
      }

      setCompanyId(cid);

      // URLパラメータでカラーが指定されている場合は優先して使用
      if (paramThemeColor) {
        console.log("[Widget] Setting theme color from URL param:", paramThemeColor);
        setThemeColor(paramThemeColor);
      }

      if (cid) {
        // Fetch company and agent info to get language setting
        try {
          console.log("[Widget] Fetching company info for:", cid);
          const res = await fetch(`/api/company/${cid}`);
          console.log("[Widget] API response status:", res.status);
          if (res.ok) {
            const data = await res.json();
            console.log("[Widget] Company data:", data);
            if (data.company?.language) {
              setLanguage(data.company.language);
            }
            if (data.agent?.name) {
              setAgentName(data.agent.name);
            }
            if (data.agent?.agentId) {
              setAgentId(data.agent.agentId);
              console.log("[Widget] Set agentId:", data.agent.agentId);
            }
            // カスタムクイックボタンが設定されている場合のみセット
            // 空配列や未設定の場合はnullのままにして、言語別デフォルトを使用
            if (data.agent?.quickButtons && Array.isArray(data.agent.quickButtons) && data.agent.quickButtons.length > 0) {
              setCustomQuickButtons(data.agent.quickButtons);
              console.log("[Widget] Set custom quick buttons:", data.agent.quickButtons);
            } else {
              setCustomQuickButtons(null);
              console.log("[Widget] No custom quick buttons, using language defaults");
            }
            // URLパラメータでカラーが指定されていない場合のみ、DBの値を使用
            if (!paramThemeColor && data.agent?.themeColor) {
              console.log("[Widget] Setting theme color from DB:", data.agent.themeColor);
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
            // Proプラン以上（pro, max）かどうかを設定
            const isProPlan = data.company?.plan === "pro" || data.company?.plan === "max";
            setIsPro(isProPlan);

            // エージェント設定から音声有効/無効を読み込む（Pro以上限定）
            if (isProPlan && typeof data.agent?.voiceEnabled === "boolean") {
              setVoiceEnabled(data.agent.voiceEnabled);
            } else {
              // Proプラン未満は音声機能を無効化
              setVoiceEnabled(false);
            }
            // アバターURLを設定
            if (data.agent?.avatarUrl) {
              setAvatarUrl(data.agent.avatarUrl);
            }
            // Pro以上の場合はトラッキングを有効化
            if (isProPlan) {
              setTrackingEnabled(true);
            }
          } else {
            console.error("[Widget] API error:", await res.text());
          }
        } catch (error) {
          console.error("[Widget] Failed to fetch company info:", error);
        }
      }

      if (paramAgentName) {
        setAgentName(paramAgentName);
      }

      setIsInitialized(true);
    };

    initializeWidget();
  }, [searchParams]);

  // Set default agent name based on language after initialization
  useEffect(() => {
    if (isInitialized && !agentName) {
      setAgentName(t.defaultAgentName);
    }
  }, [isInitialized, language, agentName, t.defaultAgentName]);

  // Set initial welcome message on client side only
  useEffect(() => {
    if (isInitialized && messages.length === 0) {
      setMessages([{
        id: "welcome",
        role: "assistant",
        content: t.welcomeMessage,
        timestamp: new Date(),
      }]);
    }
  }, [isInitialized, t.welcomeMessage, messages.length]);

  // Update welcome message when language changes
  useEffect(() => {
    if (isInitialized && messages.length > 0) {
      setMessages(prevMessages =>
        prevMessages.map(msg =>
          msg.id === "welcome"
            ? { ...msg, content: t.welcomeMessage }
            : msg
        )
      );
    }
  }, [language, t.welcomeMessage]);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackingInitialized = useRef(false);

  // トラッキング関数
  const sendTrackingData = async (type: string, data: Record<string, unknown>) => {
    if (!trackingEnabled || !companyId) return;
    try {
      await fetch("/api/tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          sessionId: trackingSessionId,
          type,
          ...data,
        }),
      });
    } catch (error) {
      console.error("[Widget] Tracking error:", error);
    }
  };

  // デバイス情報を取得
  const getDeviceInfo = () => {
    const ua = navigator.userAgent;
    let deviceType: "mobile" | "tablet" | "desktop" = "desktop";
    if (/Mobi|Android/i.test(ua)) {
      deviceType = /Tablet|iPad/i.test(ua) ? "tablet" : "mobile";
    }
    let os = "Unknown";
    if (/Windows/i.test(ua)) os = "Windows";
    else if (/Mac/i.test(ua)) os = "macOS";
    else if (/Linux/i.test(ua)) os = "Linux";
    else if (/Android/i.test(ua)) os = "Android";
    else if (/iOS|iPhone|iPad/i.test(ua)) os = "iOS";
    let browser = "Unknown";
    if (/Chrome/i.test(ua)) browser = "Chrome";
    else if (/Firefox/i.test(ua)) browser = "Firefox";
    else if (/Safari/i.test(ua)) browser = "Safari";
    else if (/Edge/i.test(ua)) browser = "Edge";
    return { type: deviceType, os, browser };
  };

  // トラッキング初期化
  useEffect(() => {
    if (!trackingEnabled || !companyId || trackingInitialized.current) return;
    trackingInitialized.current = true;

    const initTracking = async () => {
      const device = getDeviceInfo();
      await sendTrackingData("init", {
        userAgent: navigator.userAgent,
        device,
        language,
        referrer: document.referrer,
        pageUrl: window.location.href,
      });
    };
    initTracking();
  }, [trackingEnabled, companyId]);

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
    if (!messageText) return;

    // 初期化が完了していない場合は送信しない
    if (!isInitialized) {
      console.log("[Widget] sendMessage blocked - not initialized yet");
      return;
    }

    // companyIdを必ず使用（空の場合はエラー）
    if (!companyId) {
      console.error("[Widget] sendMessage blocked - companyId is empty");
      return;
    }

    console.log("[Widget] sendMessage - companyId:", companyId);

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

    // ユーザーメッセージをトラッキング
    sendTrackingData("conversation", { message: messageText, role: "user" });

    try {
      console.log("[Widget] Sending chat with agentId:", agentId);
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: companyId,
          agentId: agentId,
          message: messageText,
          sessionId,
          language,
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

      // アシスタントの返答をトラッキング
      sendTrackingData("conversation", { message: reply, role: "assistant" });

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

      // 自動再生は行わない - 再生ボタンを押したときのみ再生
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
    // 既に再生中の場合は停止してから新しい音声を再生
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    // 既に再生中フラグがある場合は何もしない（連打防止）
    if (isPlaying) {
      return;
    }

    setIsPlaying(true);

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
        audio.play();
        audio.onended = () => {
          setIsPlaying(false);
          audioRef.current = null;
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setIsPlaying(false);
          audioRef.current = null;
          URL.revokeObjectURL(url);
        };
      } else {
        setIsPlaying(false);
      }
    } catch (error) {
      console.error("TTS error:", error);
      setIsPlaying(false);
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
        console.log("[Recording] Blob size:", audioBlob.size, "bytes, mimeType:", mimeType);

        // 音声データが小さすぎる場合はスキップ
        if (audioBlob.size < 1000) {
          console.log("[Recording] Blob too small, skipping transcription");
          return;
        }

        // MIMEタイプに応じた拡張子を決定
        const fileExtension = mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "mp4" : "wav";
        const fileName = `recording.${fileExtension}`;

        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("audio", audioBlob, fileName);
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

  // キーボードイベント（Shift+Enterで送信、Enterは改行）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    // Enterのみの場合は改行（デフォルト動作）
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
        background: `linear-gradient(180deg, ${colors.background} 0%, #E8DDE7 50%, #DFD4DE 100%)`,
      }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 px-4 py-3"
        style={{
          background: generateGradient(themeColor),
        }}
      >
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-white/30 flex-shrink-0">
            <img
              src={avatarUrl}
              alt="AI Agent"
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.src = "/agent-avatar.png";
              }}
            />
          </div>
          <h1 className="text-white font-semibold text-base tracking-tight flex-1 truncate">
            {agentName ? `${agentName} コンシェルジュ` : t.defaultAgentName}
          </h1>
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* 言語選択ドロップダウン */}
            <div className="relative">
              <button
                onClick={() => setLanguageMenuOpen(!languageMenuOpen)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/20 text-white text-sm hover:bg-white/30 transition-all"
              >
                <span className="text-base">{currentLanguage.flag}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${languageMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {languageMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLanguageMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg overflow-hidden min-w-[100px]">
                    {languageOptions.map((option) => (
                      <button
                        key={option.code}
                        onClick={() => {
                          setLanguage(option.code);
                          setLanguageMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100 transition-all ${
                          language === option.code ? 'bg-slate-50 font-medium' : ''
                        }`}
                        style={{ color: colors.text }}
                      >
                        <span className="text-base">{option.flag}</span>
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {/* 再生/停止ボタン */}
            {isPlaying ? (
              <button
                onClick={stopTTS}
                className="p-2 rounded-lg bg-red-500/80 text-white hover:bg-red-500 transition-all"
                title={t.stop}
              >
                <Square className="w-4 h-4" />
              </button>
            ) : lastReply ? (
              <button
                onClick={() => playTTS(lastReply)}
                className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-all"
                title={t.play}
              >
                <Play className="w-4 h-4" />
              </button>
            ) : null}
            {/* 音声ON/OFFボタン（Proプラン限定） */}
            {isPro && (
              <button
                onClick={() => {
                  const newValue = !voiceEnabled;
                  setVoiceEnabled(newValue);
                  if (!newValue) {
                    stopTTS();
                  }
                }}
                className={`p-2 rounded-lg transition-all ${
                  voiceEnabled
                    ? "bg-white/20 text-white"
                    : "bg-white/10 text-white/60"
                }`}
                title={voiceEnabled ? t.voiceOn : t.voiceOff}
              >
                {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Message area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id}>
          {/* Link cards message */}
          {msg.type === "links" && msg.links && msg.links.length > 0 ? (
            <div className="flex justify-start">
              <div className="max-w-[85%]">
                <div className="flex items-end gap-2">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center" style={{ border: `1px solid ${colors.primary}30` }}>
                    <ExternalLink className="w-4 h-4" style={{ color: colors.primary }} />
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
                            className="block bg-white rounded-xl shadow-sm hover:shadow-md transition-all overflow-hidden"
                            style={{ border: `1px solid ${colors.primary}20` }}
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
                                <ExternalLink className="w-5 h-5 hidden" style={{ color: colors.primary }} />
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
                  className={`px-4 py-3 rounded-2xl min-w-0 overflow-hidden ${
                    msg.role === "user"
                      ? "rounded-br-md text-white shadow-lg"
                      : "rounded-bl-md bg-white shadow-sm"
                  }`}
                  style={
                    msg.role === "user"
                      ? {
                          background: generateGradient(themeColor),
                        }
                      : {
                          border: `1px solid ${colors.primary}20`,
                          color: colors.text,
                        }
                  }
                >
                  <div
                    className={`text-sm leading-relaxed break-words overflow-hidden ${
                      msg.role === "user"
                        ? ""
                        : "prose prose-sm max-w-none prose-a:underline prose-headings:font-semibold prose-headings:mt-2 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-li:my-0"
                    }`}
                    style={{ color: msg.role === "user" ? "#FFFFFF" : colors.text }}
                  >
                    <ReactMarkdown
                      components={{
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: msg.role === "user" ? "#FFFFFF" : colors.primary }}>
                            {children}
                          </a>
                        ),
                        p: ({ children }) => (
                          <p style={{ color: msg.role === "user" ? "#FFFFFF" : colors.text }}>{children}</p>
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
            <div className="flex flex-wrap gap-2 justify-center mt-4" key={`quickbuttons-${language}`}>
              {(customQuickButtons && customQuickButtons.length > 0 ? customQuickButtons : t.quickQuestions).slice(0, 5).map((q, i) => {
                const icons = [Building2, Users, Briefcase, MessageCircle, HelpCircle];
                const Icon = icons[i % 5];
                return (
                  <button
                    key={`${language}-${i}`}
                    onClick={() => handleQuickQuestion(q.query)}
                    disabled={loading || !isInitialized || !companyId}
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

        {/* Quick buttons at the end of conversation (always visible when not loading) */}
        {!loading && !isTranscribing && messages.length > 1 && (
          <div className="flex flex-wrap gap-2 justify-center mt-4 mb-2" key={`quickbuttons-end-${language}`}>
            {(customQuickButtons && customQuickButtons.length > 0 ? customQuickButtons : t.quickQuestions).slice(0, 5).map((q, i) => {
              const icons = [Building2, Users, Briefcase, MessageCircle, HelpCircle];
              const Icon = icons[i % 5];
              return (
                <button
                  key={`end-${language}-${i}`}
                  onClick={() => handleQuickQuestion(q.query)}
                  disabled={loading || !isInitialized || !companyId}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl border text-sm text-slate-700 transition-all shadow-sm disabled:opacity-50 hover:shadow-md"
                  style={{ borderColor: `${themeColor}40` }}
                >
                  <Icon className="w-4 h-4" style={{ color: themeColor }} />
                  {q.label}
                </button>
              );
            })}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 px-4 pb-4 pt-2">
        <div className="bg-white rounded-2xl shadow-lg p-3" style={{ border: `1px solid ${colors.primary}20` }}>
          {/* Recording indicator */}
          {isRecording && (
            <div className="flex items-center justify-center gap-2 mb-3 py-2 rounded-xl" style={{ backgroundColor: `${colors.primary}10` }}>
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
            {/* Mic button（Proプラン限定） */}
            {isPro && (
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
            )}

            {/* Text input */}
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={!isInitialized ? "読み込み中..." : !companyId ? "エラー: 設定が見つかりません" : t.inputPlaceholder}
                rows={1}
                disabled={isRecording || isTranscribing || loading || !isInitialized || !companyId}
                className="w-full px-4 py-3 pr-12 rounded-xl bg-slate-50 placeholder-slate-400 text-sm resize-none focus:outline-none focus:ring-2 focus:bg-white transition-all disabled:opacity-50"
                style={{ color: colors.text, minHeight: "48px", maxHeight: "120px" }}
              />
              {/* Send button */}
              <button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim() || isRecording || isTranscribing || !isInitialized || !companyId}
                className={`absolute right-2 bottom-2 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  input.trim() && !loading && isInitialized && companyId
                    ? "text-white shadow-md hover:shadow-lg hover:scale-105"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed"
                }`}
                style={
                  input.trim() && !loading && isInitialized && companyId
                    ? { background: generateGradient(themeColor) }
                    : {}
                }
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-3 flex items-center justify-center">
            <a
              href="https://hackjpn.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
            >
              Powered by hackjpn
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// Default export with Suspense wrapper for useSearchParams
export default function WidgetPage() {
  return (
    <Suspense fallback={<WidgetLoading />}>
      <WidgetContent />
    </Suspense>
  );
}
