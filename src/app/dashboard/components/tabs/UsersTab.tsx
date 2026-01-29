"use client";

import { useState, useEffect } from "react";
import { useAgent } from "../AgentContext";
import { SectionCard } from "../shared/SectionCard";
import {
  Users,
  Mail,
  Phone,
  Calendar,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  User,
  Clock,
  Monitor,
  Smartphone,
  Tablet,
  RefreshCw,
  Download,
} from "lucide-react";

type ConversationLog = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type Lead = {
  leadId: string;
  name?: string;
  email?: string;
  phone?: string;
  inquiry?: string;
  pageUrl?: string;
  deviceType?: "pc" | "mobile" | "tablet";
  status: "new" | "contacted" | "converted" | "closed";
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  conversationLogs: ConversationLog[];
};

const statusLabels: Record<Lead["status"], string> = {
  new: "新規",
  contacted: "対応中",
  converted: "成約",
  closed: "クローズ",
};

const statusColors: Record<Lead["status"], string> = {
  new: "bg-blue-100 text-blue-700",
  contacted: "bg-yellow-100 text-yellow-700",
  converted: "bg-green-100 text-green-700",
  closed: "bg-slate-100 text-slate-700",
};

const DeviceIcon = ({ type }: { type?: "pc" | "mobile" | "tablet" }) => {
  switch (type) {
    case "mobile":
      return <Smartphone className="w-4 h-4" />;
    case "tablet":
      return <Tablet className="w-4 h-4" />;
    default:
      return <Monitor className="w-4 h-4" />;
  }
};

export function UsersTab() {
  const { agent } = useAgent();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const fetchLeads = async () => {
    if (!agent?.agentId) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/leads?agentId=${agent.agentId}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
      }
    } catch (error) {
      console.error("Failed to fetch leads:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [agent?.agentId]);

  const handleStatusChange = async (leadId: string, newStatus: Lead["status"]) => {
    setUpdatingStatus(leadId);
    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, status: newStatus }),
      });

      if (res.ok) {
        setLeads((prev) =>
          prev.map((lead) =>
            lead.leadId === leadId ? { ...lead, status: newStatus } : lead
          )
        );
      }
    } catch (error) {
      console.error("Failed to update status:", error);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // CSVエクスポート関数
  const exportLeadsToCSV = () => {
    if (leads.length === 0) return;

    // BOM（Byte Order Mark）を追加してExcelで文字化けを防ぐ
    const BOM = "\uFEFF";

    // CSVヘッダー
    const headers = ["名前", "メールアドレス", "電話番号", "問い合わせ内容", "ステータス", "デバイス", "取得日時"];

    // CSVデータ行を生成
    const rows = leads.map((lead) => {
      const name = `"${(lead.name || lead.email?.split("@")[0] || "未取得").replace(/"/g, '""')}"`;
      const email = `"${(lead.email || "").replace(/"/g, '""')}"`;
      const phone = `"${(lead.phone || "").replace(/"/g, '""')}"`;
      const inquiry = `"${(lead.inquiry || "").replace(/"/g, '""').replace(/\n/g, " ")}"`;
      const status = statusLabels[lead.status];
      const device = lead.deviceType === "mobile" ? "モバイル" : lead.deviceType === "tablet" ? "タブレット" : "PC";
      const date = formatDate(lead.createdAt);
      return [name, email, phone, inquiry, status, device, date].join(",");
    });

    // CSVコンテンツを生成
    const csvContent = BOM + headers.join(",") + "\n" + rows.join("\n");

    // Blobを作成してダウンロード
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ユーザー情報_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <SectionCard
        icon={<Users className="w-5 h-5" />}
        title="ユーザー情報"
        description="連絡先を取得したユーザー一覧"
      >
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={<Users className="w-5 h-5" />}
      title="ユーザー情報"
      description="チャットで連絡先を取得したユーザー一覧"
      headerAction={
        <div className="flex items-center gap-2">
          <button
            onClick={exportLeadsToCSV}
            disabled={leads.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="CSVダウンロード"
          >
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={fetchLeads}
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            title="更新"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      }
    >
      {leads.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 mb-2">まだユーザー情報がありません</p>
          <p className="text-sm text-slate-400">
            チャットでお客様が連絡先を入力すると、ここに表示されます
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {leads.map((lead) => {
            const isExpanded = expandedLeadId === lead.leadId;

            return (
              <div
                key={lead.leadId}
                className="border border-slate-200 rounded-xl overflow-hidden"
              >
                {/* ヘッダー部分 */}
                <div
                  className="p-4 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() =>
                    setExpandedLeadId(isExpanded ? null : lead.leadId)
                  }
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                        <User className="w-5 h-5 text-rose-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">
                            {lead.name || lead.email?.split("@")[0] || "名前未取得"}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full ${
                              statusColors[lead.status]
                            }`}
                          >
                            {statusLabels[lead.status]}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                          {lead.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3.5 h-3.5" />
                              {lead.email}
                            </span>
                          )}
                          {lead.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5" />
                              {lead.phone}
                            </span>
                          )}
                        </div>
                        {/* 問い合わせ内容 */}
                        {lead.inquiry && (
                          <div className="mt-2 text-sm text-slate-600 bg-slate-100 rounded-lg p-2">
                            <span className="font-medium text-slate-700">問い合わせ: </span>
                            {lead.inquiry.length > 100
                              ? lead.inquiry.slice(0, 100) + "..."
                              : lead.inquiry}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right text-sm text-slate-500">
                        <div className="flex items-center gap-1 justify-end">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(lead.createdAt)}
                        </div>
                        <div className="flex items-center gap-1 justify-end mt-0.5">
                          <DeviceIcon type={lead.deviceType} />
                          <span className="text-xs">
                            {lead.deviceType === "mobile"
                              ? "モバイル"
                              : lead.deviceType === "tablet"
                              ? "タブレット"
                              : "PC"}
                          </span>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                  </div>
                </div>

                {/* 展開部分 */}
                {isExpanded && (
                  <div className="p-4 border-t border-slate-200">
                    {/* ステータス変更 */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        ステータス
                      </label>
                      <div className="flex gap-2">
                        {(
                          ["new", "contacted", "converted", "closed"] as const
                        ).map((status) => (
                          <button
                            key={status}
                            onClick={() =>
                              handleStatusChange(lead.leadId, status)
                            }
                            disabled={updatingStatus === lead.leadId}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                              lead.status === status
                                ? statusColors[status] + " font-medium"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            {statusLabels[status]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 会話ログ */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        <MessageSquare className="w-4 h-4 inline mr-1" />
                        会話ログ
                      </label>
                      <div className="bg-slate-50 rounded-lg p-4 max-h-80 overflow-y-auto space-y-3">
                        {lead.conversationLogs.length === 0 ? (
                          <p className="text-sm text-slate-500 text-center">
                            会話ログがありません
                          </p>
                        ) : (
                          lead.conversationLogs.map((log, index) => (
                            <div
                              key={index}
                              className={`flex ${
                                log.role === "user"
                                  ? "justify-end"
                                  : "justify-start"
                              }`}
                            >
                              <div
                                className={`max-w-[80%] p-3 rounded-xl ${
                                  log.role === "user"
                                    ? "bg-rose-500 text-white"
                                    : "bg-white border border-slate-200 text-slate-700"
                                }`}
                              >
                                <p className="text-sm whitespace-pre-wrap">
                                  {log.content}
                                </p>
                                <p
                                  className={`text-xs mt-1 ${
                                    log.role === "user"
                                      ? "text-rose-200"
                                      : "text-slate-400"
                                  }`}
                                >
                                  <Clock className="w-3 h-3 inline mr-1" />
                                  {formatDate(log.createdAt)}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* ページURL */}
                    {lead.pageUrl && (
                      <div className="mt-4 text-sm text-slate-500">
                        <span className="font-medium">取得ページ:</span>{" "}
                        <a
                          href={lead.pageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-rose-600 hover:underline"
                        >
                          {lead.pageUrl}
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
