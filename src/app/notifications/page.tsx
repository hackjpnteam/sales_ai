"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  ArrowLeft,
  RefreshCw,
  Info,
  AlertTriangle,
  Wrench,
  Check,
  ExternalLink,
  Share2,
  Sparkles,
} from "lucide-react";

type Notification = {
  notificationId: string;
  title: string;
  message: string;
  type: "info" | "update" | "warning" | "maintenance" | "share" | "welcome";
  link?: string;
  createdAt: string;
  isRead: boolean;
  isSystem?: boolean;
  fromUserName?: string;
  agentName?: string;
};

export default function NotificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchNotifications();
    } else if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, fetchNotifications, router]);

  const markAsRead = async (notificationId: string, isUserNotification: boolean) => {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId, isUserNotification }),
      });
      setNotifications((prev) =>
        prev.map((n) =>
          n.notificationId === notificationId ? { ...n, isRead: true } : n
        )
      );
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    // 未読なら既読にする
    if (!notification.isRead) {
      await markAsRead(notification.notificationId, !notification.isSystem);
    }
    // 内部リンクなら遷移
    if (notification.link && notification.link.startsWith("/")) {
      router.push(notification.link);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const getTypeIcon = (type: Notification["type"]) => {
    switch (type) {
      case "update":
        return <RefreshCw className="w-5 h-5 text-green-500" />;
      case "info":
        return <Info className="w-5 h-5 text-blue-500" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case "maintenance":
        return <Wrench className="w-5 h-5 text-slate-500" />;
      case "share":
        return <Share2 className="w-5 h-5 text-purple-500" />;
      case "welcome":
        return <Sparkles className="w-5 h-5 text-rose-500" />;
      default:
        return <Bell className="w-5 h-5 text-slate-500" />;
    }
  };

  const getTypeBadge = (type: Notification["type"]) => {
    const styles: Record<string, string> = {
      update: "bg-green-100 text-green-700",
      info: "bg-blue-100 text-blue-700",
      warning: "bg-amber-100 text-amber-700",
      maintenance: "bg-slate-100 text-slate-700",
      share: "bg-purple-100 text-purple-700",
      welcome: "bg-rose-100 text-rose-700",
    };
    const labels: Record<string, string> = {
      update: "アップデート",
      info: "お知らせ",
      warning: "重要",
      maintenance: "メンテナンス",
      share: "共有",
      welcome: "ようこそ",
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[type] || styles.info}`}>
        {labels[type] || "お知らせ"}
      </span>
    );
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-rose-50/30 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-rose-50/30">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-rose-100">
                <Bell className="w-6 h-6 text-rose-500" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800">お知らせ</h1>
                {unreadCount > 0 && (
                  <p className="text-sm text-slate-500">{unreadCount}件の未読</p>
                )}
              </div>
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-all"
            >
              <Check className="w-4 h-4" />
              全て既読にする
            </button>
          )}
        </div>

        {/* 通知一覧 */}
        <div className="space-y-4">
          {notifications.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <Bell className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">お知らせはありません</p>
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.notificationId}
                onClick={() => handleNotificationClick(notification)}
                className={`bg-white rounded-2xl border transition-all ${
                  notification.link?.startsWith("/") ? "cursor-pointer hover:shadow-md" : ""
                } ${
                  !notification.isRead
                    ? "border-rose-200 shadow-sm"
                    : "border-slate-200"
                }`}
              >
                <div className="p-5">
                  {/* ヘッダー部分 */}
                  <div className="flex items-start gap-4 mb-3">
                    <div className="flex-shrink-0 p-2 rounded-xl bg-slate-50">
                      {getTypeIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {getTypeBadge(notification.type)}
                        {!notification.isRead && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-600">
                            未読
                          </span>
                        )}
                      </div>
                      <h2 className="text-lg font-semibold text-slate-800">
                        {notification.title}
                      </h2>
                      <p className="text-xs text-slate-400 mt-1">
                        {new Date(notification.createdAt).toLocaleDateString("ja-JP", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>

                  {/* 本文 */}
                  <div className="pl-14">
                    <div className="text-base text-slate-800 leading-7 space-y-3">
                      {notification.message
                        .split(/\n\s*\n+/)
                        .map((paragraph, i) => {
                          const trimmed = paragraph.trim();
                          if (!trimmed) return null;
                          // 【】で始まる行は見出しとして扱う
                          if (trimmed.startsWith("【")) {
                            return (
                              <p key={i} className="font-semibold text-slate-900 mt-4 first:mt-0">
                                {trimmed}
                              </p>
                            );
                          }
                          return (
                            <p key={i} className="text-slate-700">
                              {trimmed}
                            </p>
                          );
                        })}
                    </div>
                    {notification.link && (
                      notification.link.startsWith("/") ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNotificationClick(notification);
                          }}
                          className="inline-flex items-center gap-1 mt-4 px-4 py-2 rounded-xl bg-rose-50 text-rose-600 text-sm font-medium hover:bg-rose-100 transition-all"
                        >
                          詳細を見る
                        </button>
                      ) : (
                        <a
                          href={notification.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 mt-4 px-4 py-2 rounded-xl bg-rose-50 text-rose-600 text-sm font-medium hover:bg-rose-100 transition-all"
                        >
                          詳細を見る
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
