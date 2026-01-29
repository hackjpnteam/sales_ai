"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  Download,
  RefreshCw,
  Trash2,
  ExternalLink,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Lock,
} from "lucide-react";
import { useAgent } from "../../components/AgentContext";
import { SecurityIssue, SecuritySeverity } from "@/lib/types";

// スーパーアドミンのメールアドレス（クライアント側での表示制御用）
const SUPER_ADMIN_EMAILS = ["tomura@hackjpn.com"];

type SecurityReport = {
  reportId: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  issuesSummary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };
  latestIssues: SecurityIssue[];
  scanCount: number;
  lastScanAt: string;
  scoreHistory: {
    date: string;
    score: number;
    grade: "A" | "B" | "C" | "D" | "F";
  }[];
  createdAt: string;
  updatedAt: string;
};

type RecentScan = {
  scanId: string;
  pageUrl: string;
  issueCount: number;
  createdAt: string;
};

const gradeColors: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-300" },
  B: { bg: "bg-green-100", text: "text-green-700", border: "border-green-300" },
  C: { bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-300" },
  D: { bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300" },
  F: { bg: "bg-red-100", text: "text-red-700", border: "border-red-300" },
};

const severityConfig: Record<SecuritySeverity, { icon: typeof AlertTriangle; color: string; label: string }> = {
  critical: { icon: ShieldX, color: "text-red-600 bg-red-50 border-red-200", label: "Critical" },
  high: { icon: ShieldAlert, color: "text-orange-600 bg-orange-50 border-orange-200", label: "High" },
  medium: { icon: AlertTriangle, color: "text-yellow-600 bg-yellow-50 border-yellow-200", label: "Medium" },
  low: { icon: AlertCircle, color: "text-blue-600 bg-blue-50 border-blue-200", label: "Low" },
  info: { icon: Info, color: "text-slate-600 bg-slate-50 border-slate-200", label: "Info" },
};

export function SecurityTab() {
  const { data: session } = useSession();
  const { agent, company } = useAgent();
  const [report, setReport] = useState<SecurityReport | null>(null);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // スーパーアドミンかどうかチェック
  const isSuperAdmin = session?.user?.email && SUPER_ADMIN_EMAILS.includes(session.user.email.toLowerCase());

  // レポートを取得
  const fetchReport = async () => {
    if (!agent) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/agents/${agent.agentId}/security`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch report");
      }

      const data = await res.json();
      setReport(data.report || null);
      setRecentScans(data.recentScans || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch report");
    } finally {
      setLoading(false);
    }
  };

  // PDFダウンロード
  const handleDownloadPDF = async () => {
    if (!agent) return;

    setDownloading(true);
    try {
      const res = await fetch(`/api/agents/${agent.agentId}/security/pdf`);
      if (!res.ok) {
        throw new Error("Failed to generate PDF");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `security-report-${agent.agentId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert("PDFの生成に失敗しました");
    } finally {
      setDownloading(false);
    }
  };

  // データリセット
  const handleReset = async () => {
    if (!agent) return;
    if (!confirm("セキュリティスキャンデータをすべて削除しますか？この操作は取り消せません。")) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/agents/${agent.agentId}/security`, {
        method: "DELETE",
      });

      if (res.ok) {
        setReport(null);
        setRecentScans([]);
      } else {
        const data = await res.json();
        alert(data.error || "削除に失敗しました");
      }
    } catch (err) {
      alert("削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [agent?.agentId]);

  // スーパーアドミンでない場合
  if (!isSuperAdmin) {
    return (
      <div className="text-center py-12">
        <Lock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-slate-700 mb-2">
          セキュリティ診断
        </h3>
        <p className="text-slate-500 mb-6 max-w-md mx-auto">
          この機能は現在開発中です。近日公開予定です。
        </p>
      </div>
    );
  }

  // ローディング
  if (loading) {
    return (
      <div className="text-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin text-rose-500 mx-auto mb-4" />
        <p className="text-slate-600">読み込み中...</p>
      </div>
    );
  }

  // エラー
  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-slate-600 mb-4">{error}</p>
        <button
          onClick={fetchReport}
          className="text-rose-600 hover:text-rose-700"
        >
          再読み込み
        </button>
      </div>
    );
  }

  // まだスキャンデータがない
  if (!report) {
    return (
      <div className="text-center py-12">
        <Shield className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-slate-700 mb-2">
          スキャンデータがありません
        </h3>
        <p className="text-slate-500 mb-4 max-w-md mx-auto">
          ウィジェットが設置されたサイトに訪問者がアクセスすると、自動的にセキュリティスキャンが実行されます。
        </p>
        <div className="bg-slate-50 rounded-xl p-4 max-w-md mx-auto text-left">
          <p className="text-sm text-slate-600 mb-2">
            <strong>設定手順:</strong>
          </p>
          <ol className="text-sm text-slate-500 list-decimal list-inside space-y-1">
            <li>「埋め込み」タブでウィジェットコードを取得</li>
            <li>対象サイトにコードを設置</li>
            <li>サイトに訪問者がアクセス</li>
            <li>このページでレポートを確認</li>
          </ol>
        </div>
      </div>
    );
  }

  // スコアの推移を計算
  const scoreTrend = report.scoreHistory.length >= 2
    ? report.scoreHistory[report.scoreHistory.length - 1].score - report.scoreHistory[report.scoreHistory.length - 2].score
    : 0;

  return (
    <div className="space-y-6">
      {/* ヘッダーアクション */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">セキュリティ診断</h3>
          <p className="text-sm text-slate-500">
            最終スキャン: {new Date(report.lastScanAt).toLocaleString("ja-JP")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchReport}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            更新
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            className="flex items-center gap-2 px-3 py-2 text-sm text-white bg-rose-500 rounded-xl hover:bg-rose-600 transition-all disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {downloading ? "生成中..." : "PDF"}
          </button>
          <button
            onClick={handleReset}
            disabled={deleting}
            className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition-all disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* スコアカード */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* グレード */}
        <div className={`rounded-2xl border-2 p-6 text-center ${gradeColors[report.grade].bg} ${gradeColors[report.grade].border}`}>
          <div className={`text-6xl font-bold ${gradeColors[report.grade].text}`}>
            {report.grade}
          </div>
          <div className="text-sm text-slate-600 mt-2">セキュリティグレード</div>
          <div className="flex items-center justify-center gap-1 mt-2">
            {scoreTrend > 0 ? (
              <>
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-sm text-emerald-600">+{scoreTrend}点</span>
              </>
            ) : scoreTrend < 0 ? (
              <>
                <TrendingDown className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-600">{scoreTrend}点</span>
              </>
            ) : (
              <>
                <Minus className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-500">変動なし</span>
              </>
            )}
          </div>
        </div>

        {/* スコア */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 text-slate-500 mb-2">
            <ShieldCheck className="w-5 h-5" />
            <span className="text-sm">スコア</span>
          </div>
          <div className="text-4xl font-bold text-slate-800">
            {report.score}
            <span className="text-lg text-slate-400">/100</span>
          </div>
          <div className="mt-2 w-full bg-slate-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                report.score >= 90 ? "bg-emerald-500" :
                report.score >= 75 ? "bg-green-500" :
                report.score >= 60 ? "bg-yellow-500" :
                report.score >= 40 ? "bg-orange-500" : "bg-red-500"
              }`}
              style={{ width: `${report.score}%` }}
            />
          </div>
        </div>

        {/* スキャン統計 */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center gap-2 text-slate-500 mb-2">
            <Clock className="w-5 h-5" />
            <span className="text-sm">スキャン統計</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">総スキャン回数</span>
              <span className="font-bold text-slate-800">{report.scanCount}回</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">検出問題数</span>
              <span className="font-bold text-slate-800">{report.issuesSummary.total}件</span>
            </div>
          </div>
        </div>
      </div>

      {/* 問題サマリー */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h4 className="font-bold text-slate-800 mb-4">問題サマリー</h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(["critical", "high", "medium", "low", "info"] as SecuritySeverity[]).map((severity) => {
            const config = severityConfig[severity];
            const Icon = config.icon;
            const count = report.issuesSummary[severity];

            return (
              <div
                key={severity}
                className={`rounded-xl border p-3 text-center ${config.color}`}
              >
                <Icon className="w-5 h-5 mx-auto mb-1" />
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-xs">{config.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 問題一覧 */}
      {report.latestIssues.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h4 className="font-bold text-slate-800 mb-4">検出された問題</h4>
          <div className="space-y-3">
            {report.latestIssues.map((issue, index) => {
              const config = severityConfig[issue.severity];
              const Icon = config.icon;

              return (
                <div
                  key={issue.id || index}
                  className={`rounded-xl border p-4 ${config.color}`}
                >
                  <div className="flex items-start gap-3">
                    <Icon className="w-5 h-5 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{issue.title}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/50">
                          {config.label}
                        </span>
                      </div>
                      <p className="text-sm mt-1 opacity-90">{issue.description}</p>
                      {issue.details && (
                        <p className="text-xs mt-1 opacity-75">{issue.details}</p>
                      )}
                      <div className="mt-2 pt-2 border-t border-current/10">
                        <p className="text-sm">
                          <strong>推奨対策:</strong> {issue.recommendation}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 問題がない場合 */}
      {report.latestIssues.length === 0 && (
        <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h4 className="font-bold text-emerald-700 mb-1">セキュリティ問題は検出されませんでした</h4>
          <p className="text-sm text-emerald-600">
            現時点では、スキャンで問題は見つかりませんでした。
          </p>
        </div>
      )}

      {/* 最近のスキャン */}
      {recentScans.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h4 className="font-bold text-slate-800 mb-4">最近のスキャン</h4>
          <div className="space-y-2">
            {recentScans.map((scan) => (
              <div
                key={scan.scanId}
                className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-slate-400" />
                  <div>
                    <a
                      href={scan.pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-slate-700 hover:text-rose-600 flex items-center gap-1"
                    >
                      {new URL(scan.pageUrl).pathname}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <p className="text-xs text-slate-400">
                      {new Date(scan.createdAt).toLocaleString("ja-JP")}
                    </p>
                  </div>
                </div>
                <span className="text-sm text-slate-500">
                  {scan.issueCount}件の問題
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* スコア計算の説明 */}
      <div className="bg-slate-50 rounded-2xl p-6">
        <h4 className="font-bold text-slate-700 mb-3">スコア計算について</h4>
        <p className="text-sm text-slate-600 mb-4">
          100点から、検出された問題の重要度に応じて減点されます。
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
          <div className="bg-white rounded-lg p-2 text-center">
            <span className="text-red-600 font-bold">Critical</span>
            <span className="text-slate-400 ml-1">-25</span>
          </div>
          <div className="bg-white rounded-lg p-2 text-center">
            <span className="text-orange-600 font-bold">High</span>
            <span className="text-slate-400 ml-1">-15</span>
          </div>
          <div className="bg-white rounded-lg p-2 text-center">
            <span className="text-yellow-600 font-bold">Medium</span>
            <span className="text-slate-400 ml-1">-8</span>
          </div>
          <div className="bg-white rounded-lg p-2 text-center">
            <span className="text-blue-600 font-bold">Low</span>
            <span className="text-slate-400 ml-1">-3</span>
          </div>
          <div className="bg-white rounded-lg p-2 text-center">
            <span className="text-slate-600 font-bold">Info</span>
            <span className="text-slate-400 ml-1">0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
