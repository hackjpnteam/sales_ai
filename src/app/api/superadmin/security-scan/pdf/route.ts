import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/admin";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

type SecurityIssue = {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  recommendation: string;
  details?: string;
};

type ScanResult = {
  url: string;
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
  issues: SecurityIssue[];
  scannedAt: string;
};

// 想定被害の定義
const potentialDamage: Record<string, string> = {
  https_missing: "ログイン情報・クレジットカード情報の漏洩、セッションハイジャック、フィッシング攻撃、SEO評価低下",
  http_form: "フォームデータの漏洩、認証情報の窃取、個人情報保護法違反による法的責任",
  mixed_content: "XSS攻撃、コンテンツ改ざん、ユーザー追跡、ブラウザ警告によるユーザー離脱",
  old_jquery: "XSS脆弱性の悪用、セッションハイジャック、マルウェア注入、キーロガー埋め込み",
  cookie_security: "セッションハイジャック、アカウント乗っ取り、個人情報・機密情報への不正アクセス",
  password_autocomplete: "共有端末でのパスワード漏洩、意図しないアカウントへの自動ログイン",
  no_frame_protection: "クリックジャッキング攻撃、ユーザーの意図しない操作（購入、送金等）の強制実行",
  external_scripts: "サプライチェーン攻撃、クリプトジャッキング、データ窃取、サイト機能停止",
};

// 技術的詳細
const technicalDetails: Record<string, string> = {
  https_missing: "HTTP通信は平文で送信されるため、同一ネットワーク上の攻撃者がWireshark等のツールで通信内容を傍受可能。中間者攻撃（MITM）による改ざんリスクも存在。",
  http_form: "フォームのaction属性がhttp://で始まるURLを指定している場合、POSTデータが暗号化されずに送信される。",
  mixed_content: "HTTPSページ内でHTTPリソースを読み込むと、攻撃者がそのリソースを改ざんしてページ全体を制御可能になる。",
  old_jquery: "jQuery 3.5.0未満にはCVE-2020-11022、CVE-2020-11023のXSS脆弱性が存在。",
  cookie_security: "HttpOnly属性がないCookieはXSS攻撃で窃取可能。Secure属性がないCookieはHTTP通信で送信される。",
  password_autocomplete: "autocomplete属性が未設定のパスワードフィールドでは、ブラウザが自動保存・自動入力を行う可能性がある。",
  no_frame_protection: "X-Frame-OptionsまたはCSPのframe-ancestorsが未設定の場合、サイトを透明なiframe内に埋め込むクリックジャッキング攻撃が可能。",
  external_scripts: "外部スクリプトはサードパーティサーバーから配信されるため、そのサーバーが侵害されると悪意のあるコードが注入される。",
};

// グレード説明
const gradeDescriptions: Record<string, { label: string; desc: string }> = {
  A: { label: "優秀", desc: "セキュリティ対策が適切に実施されており、現時点で重大な脆弱性は検出されませんでした。" },
  B: { label: "良好", desc: "基本的なセキュリティ対策は実施されていますが、一部改善の余地があります。" },
  C: { label: "要改善", desc: "複数のセキュリティ上の問題が検出されました。早急な対応が必要です。" },
  D: { label: "危険", desc: "重大なセキュリティリスクが存在します。即座の対応が必要です。" },
  F: { label: "緊急対応必要", desc: "複数の重大な脆弱性が検出されました。直ちに緊急対応を検討してください。" },
};

// HTMLテンプレート生成
function generateHTML(scanResult: ScanResult): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
  const gradeColors: Record<string, string> = {
    A: "#10b981", B: "#22c55e", C: "#eab308", D: "#f97316", F: "#ef4444",
  };
  const gradeColor = gradeColors[scanResult.grade] || "#64748b";
  const gradeInfo = gradeDescriptions[scanResult.grade];

  const severityColors: Record<string, { bg: string; border: string; text: string }> = {
    critical: { bg: "#fef2f2", border: "#fecaca", text: "#991b1b" },
    high: { bg: "#fff7ed", border: "#fed7aa", text: "#9a3412" },
    medium: { bg: "#fefce8", border: "#fef08a", text: "#854d0e" },
    low: { bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af" },
    info: { bg: "#f8fafc", border: "#e2e8f0", text: "#475569" },
  };

  const severityLabels: Record<string, string> = {
    critical: "重大", high: "高", medium: "中", low: "低", info: "情報",
  };

  const severityIcons: Record<string, string> = {
    critical: "🔴", high: "🟠", medium: "🟡", low: "🔵", info: "⚪",
  };

  const issuesHTML = scanResult.issues.map((issue, index) => {
    const colors = severityColors[issue.severity] || severityColors.info;
    const damage = potentialDamage[issue.type] || "";
    const techDetail = technicalDetails[issue.type] || "";
    const icon = severityIcons[issue.severity] || "⚪";

    return `
      <div class="issue-card" style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
        <!-- ヘッダー -->
        <div style="background: linear-gradient(135deg, ${colors.bg} 0%, white 100%); border-bottom: 2px solid ${colors.border}; padding: 14px 18px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 16px;">${icon}</span>
            <span style="background: ${colors.text}; color: white; padding: 3px 10px; border-radius: 4px; font-size: 10px; font-weight: bold; letter-spacing: 0.5px;">
              ${severityLabels[issue.severity]}
            </span>
            <span style="font-weight: bold; color: #1f2937; font-size: 14px;">${issue.title}</span>
          </div>
        </div>

        <div style="padding: 16px 18px;">
          <!-- 検出内容 -->
          <div style="margin-bottom: 14px;">
            <div style="font-weight: 600; color: #374151; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">検出内容</div>
            <div style="color: #4b5563; font-size: 12px; line-height: 1.7;">${issue.description}</div>
          </div>

          ${techDetail ? `
          <!-- 技術的詳細 -->
          <div style="margin-bottom: 14px; padding: 12px; background: #f8fafc; border-radius: 8px; border-left: 3px solid #94a3b8;">
            <div style="font-weight: 600; color: #475569; margin-bottom: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">技術的詳細</div>
            <div style="color: #64748b; font-size: 11px; line-height: 1.6;">${techDetail}</div>
          </div>
          ` : ""}

          ${damage ? `
          <!-- 想定される被害 -->
          <div style="margin-bottom: 14px; padding: 12px; background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius: 8px; border-left: 3px solid #f87171;">
            <div style="font-weight: 600; color: #dc2626; margin-bottom: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">⚠️ 想定される被害</div>
            <div style="color: #991b1b; font-size: 11px; line-height: 1.6;">${damage}</div>
          </div>
          ` : ""}

          <!-- 推奨対策 -->
          <div style="padding: 12px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-radius: 8px; border-left: 3px solid #4ade80;">
            <div style="font-weight: 600; color: #16a34a; margin-bottom: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">✅ 推奨対策</div>
            <div style="color: #166534; font-size: 11px; line-height: 1.6;">${issue.recommendation}</div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      margin: 0;
      size: A4;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
      font-size: 12px;
      line-height: 1.6;
      color: #1f2937;
      orphans: 3;
      widows: 3;
    }
    p, div {
      orphans: 3;
      widows: 3;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 15mm 20mm;
      page-break-after: always;
      position: relative;
    }
    .page:last-child {
      page-break-after: avoid;
    }
    .cover {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
      color: white;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 0;
    }
    .header {
      background: linear-gradient(135deg, #e11d48 0%, #be185d 100%);
      color: white;
      padding: 16px 20mm;
      margin: -15mm -20mm 20px -20mm;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .card-title {
      font-size: 14px;
      font-weight: bold;
      color: #374151;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #f1f5f9;
    }
    .issue-card {
      page-break-inside: avoid;
      break-inside: avoid;
      margin-bottom: 16px;
    }
    .details-section {
      padding-top: 0;
    }
    .details-header {
      page-break-after: avoid;
      break-after: avoid;
    }
    .footer {
      position: absolute;
      bottom: 10mm;
      left: 20mm;
      right: 20mm;
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
    }
  </style>
</head>
<body>

  <!-- 表紙 -->
  <div class="page cover">
    <div style="margin-bottom: 30px;">
      <div style="font-size: 11px; color: #64748b; letter-spacing: 3px; margin-bottom: 12px;">SECURITY ASSESSMENT REPORT</div>
      <div style="font-size: 42px; font-weight: bold; letter-spacing: 2px;">hackjpn</div>
      <div style="font-size: 22px; font-weight: 500; margin-top: 8px; color: #e2e8f0;">セキュリティ診断書</div>
    </div>

    <div style="width: 130px; height: 130px; border-radius: 50%; background: ${gradeColor}; display: flex; align-items: center; justify-content: center; margin: 30px 0; box-shadow: 0 8px 32px rgba(0,0,0,0.3);">
      <span style="font-size: 64px; font-weight: bold;">${scanResult.grade}</span>
    </div>

    <div style="font-size: 32px; font-weight: bold;">${scanResult.score}<span style="font-size: 18px; color: #94a3b8;"> / 100 点</span></div>
    <div style="font-size: 16px; color: ${gradeColor}; margin-top: 8px; font-weight: 500;">${gradeInfo.label}</div>

    <div style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px 32px; margin-top: 40px; max-width: 420px; text-align: left;">
      <table style="width: 100%; font-size: 13px;">
        <tr>
          <td style="color: #64748b; padding: 6px 0; width: 80px;">診断対象</td>
          <td style="color: #f1f5f9; padding: 6px 0; word-break: break-all;">${scanResult.url}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 6px 0;">診断日時</td>
          <td style="color: #f1f5f9; padding: 6px 0;">${dateStr}</td>
        </tr>
        <tr>
          <td style="color: #64748b; padding: 6px 0;">診断種別</td>
          <td style="color: #f1f5f9; padding: 6px 0;">自動セキュリティスキャン</td>
        </tr>
      </table>
    </div>

    <div class="footer" style="color: #475569;">
      <div>Confidential Document - hackjpn Security Team</div>
    </div>
  </div>

  <!-- サマリーページ -->
  <div class="page" style="background: #f8fafc;">
    <div class="header">
      <h1 style="font-size: 20px; font-weight: bold; margin: 0;">診断結果サマリー</h1>
      <div style="font-size: 11px; opacity: 0.8; margin-top: 4px;">Executive Summary</div>
    </div>

    <div class="card">
      <div class="card-title">🎯 総合評価</div>
      <div style="display: flex; align-items: center; gap: 20px;">
        <div style="width: 70px; height: 70px; border-radius: 50%; background: ${gradeColor}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <span style="font-size: 36px; font-weight: bold; color: white;">${scanResult.grade}</span>
        </div>
        <div>
          <div style="font-size: 22px; font-weight: bold; color: #1f2937;">${scanResult.score}点<span style="font-size: 14px; color: #6b7280;"> / 100点満点</span></div>
          <div style="color: #4b5563; margin-top: 6px; font-size: 13px; line-height: 1.5;">${gradeInfo.desc}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📊 検出された問題</div>
      <div style="display: flex; gap: 10px;">
        <div style="flex: 1; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 14px; text-align: center;">
          <div style="font-size: 24px; font-weight: bold; color: #dc2626;">${scanResult.issuesSummary.critical}</div>
          <div style="font-size: 11px; color: #991b1b; margin-top: 2px;">重大</div>
        </div>
        <div style="flex: 1; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; padding: 14px; text-align: center;">
          <div style="font-size: 24px; font-weight: bold; color: #ea580c;">${scanResult.issuesSummary.high}</div>
          <div style="font-size: 11px; color: #9a3412; margin-top: 2px;">高</div>
        </div>
        <div style="flex: 1; background: #fefce8; border: 1px solid #fef08a; border-radius: 10px; padding: 14px; text-align: center;">
          <div style="font-size: 24px; font-weight: bold; color: #ca8a04;">${scanResult.issuesSummary.medium}</div>
          <div style="font-size: 11px; color: #854d0e; margin-top: 2px;">中</div>
        </div>
        <div style="flex: 1; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px; text-align: center;">
          <div style="font-size: 24px; font-weight: bold; color: #2563eb;">${scanResult.issuesSummary.low}</div>
          <div style="font-size: 11px; color: #1e40af; margin-top: 2px;">低</div>
        </div>
        <div style="flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center;">
          <div style="font-size: 24px; font-weight: bold; color: #64748b;">${scanResult.issuesSummary.info}</div>
          <div style="font-size: 11px; color: #475569; margin-top: 2px;">情報</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">⏰ 対応優先度ガイド</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
        <tr style="background: #f1f5f9;">
          <th style="padding: 10px 12px; text-align: left; font-weight: 600;">重要度</th>
          <th style="padding: 10px 12px; text-align: center; font-weight: 600;">件数</th>
          <th style="padding: 10px 12px; text-align: left; font-weight: 600;">推奨対応期限</th>
          <th style="padding: 10px 12px; text-align: left; font-weight: 600;">リスクレベル</th>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 12px; color: #dc2626; font-weight: 600;">🔴 重大 (Critical)</td>
          <td style="padding: 10px 12px; text-align: center; font-weight: bold;">${scanResult.issuesSummary.critical}</td>
          <td style="padding: 10px 12px;">24時間以内</td>
          <td style="padding: 10px 12px; color: #dc2626;">攻撃される危険性が高い</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 12px; color: #ea580c; font-weight: 600;">🟠 高 (High)</td>
          <td style="padding: 10px 12px; text-align: center; font-weight: bold;">${scanResult.issuesSummary.high}</td>
          <td style="padding: 10px 12px;">7日以内</td>
          <td style="padding: 10px 12px; color: #ea580c;">悪用される可能性あり</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 12px; color: #ca8a04; font-weight: 600;">🟡 中 (Medium)</td>
          <td style="padding: 10px 12px; text-align: center; font-weight: bold;">${scanResult.issuesSummary.medium}</td>
          <td style="padding: 10px 12px;">30日以内</td>
          <td style="padding: 10px 12px; color: #ca8a04;">条件次第で悪用の恐れ</td>
        </tr>
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 12px; color: #2563eb; font-weight: 600;">🔵 低 (Low)</td>
          <td style="padding: 10px 12px; text-align: center; font-weight: bold;">${scanResult.issuesSummary.low}</td>
          <td style="padding: 10px 12px;">計画的に対応</td>
          <td style="padding: 10px 12px; color: #2563eb;">リスクは限定的</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; color: #64748b; font-weight: 600;">⚪ 情報 (Info)</td>
          <td style="padding: 10px 12px; text-align: center; font-weight: bold;">${scanResult.issuesSummary.info}</td>
          <td style="padding: 10px 12px;">任意</td>
          <td style="padding: 10px 12px; color: #64748b;">ベストプラクティス</td>
        </tr>
      </table>
    </div>

    <div class="footer">hackjpn Security Assessment Report - Page 2</div>
  </div>

  <!-- 詳細ページ -->
  <div class="details-section" style="background: #f8fafc;">
    <div class="details-header" style="background: linear-gradient(135deg, #e11d48 0%, #be185d 100%); color: white; padding: 16px 20mm; margin-bottom: 20px;">
      <h1 style="font-size: 20px; font-weight: bold; margin: 0;">検出された脆弱性の詳細</h1>
      <div style="font-size: 11px; opacity: 0.8; margin-top: 4px;">Detailed Findings</div>
    </div>

    <div style="padding: 0 20mm 20mm 20mm;">
      ${scanResult.issues.length === 0 ? `
        <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 2px solid #86efac; border-radius: 16px; padding: 40px; text-align: center;">
          <div style="font-size: 56px; margin-bottom: 16px;">✅</div>
          <div style="font-size: 20px; font-weight: bold; color: #16a34a; margin-bottom: 8px;">セキュリティ問題は検出されませんでした</div>
          <div style="color: #166534; font-size: 13px;">おめでとうございます！現時点で重大な脆弱性は見つかりませんでした。<br>引き続き定期的な診断を実施し、セキュリティレベルを維持してください。</div>
        </div>
      ` : issuesHTML}
    </div>
  </div>

  <!-- 免責事項ページ -->
  <div class="page disclaimer-page" style="background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%); page-break-before: always;">
    <div class="header" style="background: linear-gradient(135deg, #475569 0%, #334155 100%);">
      <h1 style="font-size: 20px; font-weight: bold; margin: 0;">免責事項・注意事項</h1>
      <div style="font-size: 11px; opacity: 0.8; margin-top: 4px;">Disclaimer & Notes</div>
    </div>

    <div class="card">
      <div class="card-title">📋 本診断書について</div>
      <div style="color: #4b5563; font-size: 12px; line-height: 2;">
        <div style="display: flex; align-items: flex-start; margin-bottom: 8px;">
          <span style="color: #e11d48; margin-right: 8px;">●</span>
          <span>本診断は自動スキャンによる診断であり、すべての脆弱性を検出できるものではありません。</span>
        </div>
        <div style="display: flex; align-items: flex-start; margin-bottom: 8px;">
          <span style="color: #e11d48; margin-right: 8px;">●</span>
          <span>診断結果は診断時点（${dateStr}）でのサイトの状態を反映しており、以後の変更は含まれません。</span>
        </div>
        <div style="display: flex; align-items: flex-start; margin-bottom: 8px;">
          <span style="color: #e11d48; margin-right: 8px;">●</span>
          <span>本診断書は機密情報として取り扱い、第三者への開示はお控えください。</span>
        </div>
        <div style="display: flex; align-items: flex-start; margin-bottom: 8px;">
          <span style="color: #e11d48; margin-right: 8px;">●</span>
          <span>診断結果に基づく対応・未対応により生じた損害について、hackjpnは責任を負いません。</span>
        </div>
        <div style="display: flex; align-items: flex-start; margin-bottom: 8px;">
          <span style="color: #e11d48; margin-right: 8px;">●</span>
          <span>より詳細なセキュリティ診断（ペネトレーションテスト等）については、専門家へのご相談を推奨します。</span>
        </div>
        <div style="display: flex; align-items: flex-start;">
          <span style="color: #e11d48; margin-right: 8px;">●</span>
          <span>セキュリティは継続的な取り組みです。定期的な診断（月1回推奨）の実施をお勧めします。</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📞 お問い合わせ</div>
      <div style="color: #4b5563; font-size: 13px; line-height: 1.8;">
        本診断書に関するご質問・ご相談は、hackjpnセキュリティチームまでお問い合わせください。
      </div>
      <div style="margin-top: 16px; padding: 16px; background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%); border-radius: 10px;">
        <div style="font-weight: bold; color: #be185d; font-size: 14px;">hackjpn Security Team</div>
        <div style="color: #9d174d; font-size: 13px; margin-top: 4px;">https://hackjpn.com</div>
      </div>
    </div>

    <div style="text-align: center; margin-top: 40px; padding: 24px; background: white; border-radius: 12px;">
      <div style="font-size: 18px; font-weight: bold; color: #1f2937; margin-bottom: 8px;">hackjpn</div>
      <div style="font-size: 12px; color: #6b7280;">Security Assessment Report</div>
      <div style="font-size: 11px; color: #9ca3af; margin-top: 8px;">発行日: ${dateStr}</div>
    </div>

    <div class="footer">hackjpn Security Assessment Report - Page 4</div>
  </div>

</body>
</html>
  `;
}

// POST: セキュリティ診断書PDFを生成
export async function POST(req: NextRequest) {
  let browser;
  try {
    const session = await auth();
    if (!session?.user?.email || !isSuperAdmin(session.user.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const scanResult: ScanResult = await req.json();
    if (!scanResult || !scanResult.url) {
      return NextResponse.json({ error: "Scan result is required" }, { status: 400 });
    }

    // HTMLを生成
    const html = generateHTML(scanResult);

    // Puppeteerでブラウザを起動
    const isLocal = process.env.NODE_ENV === "development";

    if (isLocal) {
      const puppeteerFull = await import("puppeteer");
      browser = await puppeteerFull.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    } else {
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: { width: 1280, height: 720 },
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    }

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    // PDFを生成
    const pdfUint8Array = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    await browser.close();

    const pdfBuffer = Buffer.from(pdfUint8Array);
    const filename = `hackjpn-security-report-${new Date().toISOString().split("T")[0]}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[Security PDF] Error:", error);
    if (browser) await browser.close();
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: "Failed to generate PDF: " + errorMessage }, { status: 500 });
  }
}
