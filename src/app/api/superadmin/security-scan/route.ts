import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollection } from "@/lib/mongodb";
import { Agent, Company, SecurityIssue, SecurityReport } from "@/lib/types";
import { isSuperAdmin } from "@/lib/admin";
import { SECURITY_ISSUE_DETAILS } from "@/lib/security-issues";
import { v4 as uuidv4 } from "uuid";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

// スコア計算関数
function calculateScore(issues: SecurityIssue[]): number {
  let score = 100;
  for (const issue of issues) {
    switch (issue.severity) {
      case "critical": score -= 25; break;
      case "high": score -= 15; break;
      case "medium": score -= 8; break;
      case "low": score -= 3; break;
    }
  }
  return Math.max(0, Math.min(100, score));
}

// グレード計算関数
function calculateGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

// 問題サマリー計算
function calculateSummary(issues: SecurityIssue[]) {
  const summary = { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: issues.length };
  for (const issue of issues) {
    summary[issue.severity]++;
  }
  return summary;
}

// POST: サーバーサイドでセキュリティスキャン実行
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email || !isSuperAdmin(session.user.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { agentId } = await req.json();
    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    const agentsCol = await getCollection<Agent>("agents");
    const companiesCol = await getCollection<Company>("companies");
    const reportsCol = await getCollection<SecurityReport>("security_reports");

    // エージェントと会社を取得
    const agent = await agentsCol.findOne({ agentId });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const company = await companiesCol.findOne({ companyId: agent.companyId });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const targetUrl = company.rootUrl || agent.rootUrl;
    if (!targetUrl) {
      return NextResponse.json({ error: "No URL to scan" }, { status: 400 });
    }

    // Puppeteerでスキャン実行
    let browser;
    try {
      const isLocal = process.env.NODE_ENV === "development";

      if (isLocal) {
        // ローカル開発時
        const puppeteerFull = await import("puppeteer");
        browser = await puppeteerFull.default.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
      } else {
        // Vercel/本番環境
        browser = await puppeteer.launch({
          args: chromium.args,
          defaultViewport: { width: 1280, height: 720 },
          executablePath: await chromium.executablePath(),
          headless: true,
        });
      }

      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // ページにアクセス
      await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 30000 });

      // セキュリティスキャン実行
      const scanResult = await page.evaluate(() => {
        const issues: {
          id: string;
          type: string;
          severity: "critical" | "high" | "medium" | "low" | "info";
          title: string;
          description: string;
          recommendation: string;
          details?: string;
        }[] = [];

        // 1. HTTPS未使用チェック
        if (window.location.protocol !== "https:") {
          issues.push({
            id: "https_missing",
            type: "https_missing",
            severity: "critical",
            title: "HTTPS未使用",
            description: "サイトがHTTPSを使用していません。通信が暗号化されていません。",
            recommendation: "SSL/TLS証明書を導入し、サイト全体をHTTPS化してください。",
          });
        }

        // 2. HTTPフォーム送信チェック
        const httpForms = document.querySelectorAll('form[action^="http:"]');
        if (httpForms.length > 0) {
          issues.push({
            id: "http_form",
            type: "http_form",
            severity: "critical",
            title: "HTTPフォーム送信",
            description: `${httpForms.length}個のフォームがHTTP（非暗号化）で送信される設定です。`,
            recommendation: "フォームのaction属性をHTTPSのURLに変更してください。",
            details: `対象フォーム数: ${httpForms.length}`,
          });
        }

        // 3. 混合コンテンツチェック
        const mixedResources: string[] = [];
        document.querySelectorAll('img[src^="http:"]').forEach((el) => mixedResources.push((el as HTMLImageElement).src));
        document.querySelectorAll('script[src^="http:"]').forEach((el) => mixedResources.push((el as HTMLScriptElement).src));
        document.querySelectorAll('link[href^="http:"]').forEach((el) => mixedResources.push((el as HTMLLinkElement).href));

        if (mixedResources.length > 0 && window.location.protocol === "https:") {
          issues.push({
            id: "mixed_content",
            type: "mixed_content",
            severity: "high",
            title: "混合コンテンツ",
            description: `${mixedResources.length}個のリソースがHTTPで読み込まれています。`,
            recommendation: "すべてのリソースをHTTPS経由で読み込むようにしてください。",
            details: mixedResources.slice(0, 5).join(", ") + (mixedResources.length > 5 ? "..." : ""),
          });
        }

        // 4. 外部スクリプトチェック
        const currentHost = window.location.hostname;
        const externalScripts: string[] = [];
        document.querySelectorAll("script[src]").forEach((el) => {
          try {
            const url = new URL((el as HTMLScriptElement).src);
            if (url.hostname !== currentHost && !url.hostname.includes("cdn") && !url.hostname.includes("cloudflare") && !url.hostname.includes("google")) {
              externalScripts.push(url.hostname);
            }
          } catch (e) {}
        });

        if (externalScripts.length > 5) {
          issues.push({
            id: "external_scripts",
            type: "external_scripts",
            severity: "info",
            title: "多数の外部スクリプト",
            description: `${externalScripts.length}個の外部ドメインからスクリプトが読み込まれています。`,
            recommendation: "必要のないスクリプトを削除し、信頼できるソースのみを使用してください。",
            details: [...new Set(externalScripts)].slice(0, 5).join(", "),
          });
        }

        // 5. 古いjQueryチェック
        // @ts-ignore
        if (typeof jQuery !== "undefined" && jQuery.fn && jQuery.fn.jquery) {
          // @ts-ignore
          const version = jQuery.fn.jquery;
          const parts = version.split(".");
          const major = parseInt(parts[0], 10);
          const minor = parseInt(parts[1], 10);

          if (major < 3 || (major === 3 && minor < 5)) {
            issues.push({
              id: "old_jquery",
              type: "old_jquery",
              severity: "medium",
              title: "古いjQueryバージョン",
              description: `jQuery ${version}が使用されています。セキュリティ脆弱性がある可能性があります。`,
              recommendation: "jQueryを最新バージョンにアップデートしてください。",
              details: `現在のバージョン: ${version}`,
            });
          }
        }

        // 6. クッキーチェック
        const cookies = document.cookie.split(";").filter((c) => c.trim().length > 0);
        if (cookies.length > 3) {
          issues.push({
            id: "cookie_security",
            type: "cookie_security",
            severity: "medium",
            title: "JavaScriptからアクセス可能なCookie",
            description: `${cookies.length}個のCookieがJavaScriptからアクセス可能です。`,
            recommendation: "セッションCookieにはHttpOnly属性を設定してください。",
            details: `アクセス可能なCookie数: ${cookies.length}`,
          });
        }

        // 7. パスワードフィールドのautocompleteチェック
        const passwordFields = document.querySelectorAll('input[type="password"]');
        let insecurePasswords = 0;
        passwordFields.forEach((el) => {
          const autocomplete = el.getAttribute("autocomplete");
          if (!autocomplete || autocomplete === "on") {
            insecurePasswords++;
          }
        });

        if (insecurePasswords > 0) {
          issues.push({
            id: "password_autocomplete",
            type: "password_autocomplete",
            severity: "low",
            title: "パスワードフィールドのautocomplete",
            description: `${insecurePasswords}個のパスワードフィールドでautocompleteが適切に設定されていません。`,
            recommendation: 'パスワードフィールドにはautocomplete="new-password"または"current-password"を設定してください。',
          });
        }

        // 8. X-Frame-Options / CSPチェック (メタタグから)
        const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
        const xfoMeta = document.querySelector('meta[http-equiv="X-Frame-Options"]');
        if (!cspMeta && !xfoMeta) {
          issues.push({
            id: "no_frame_protection",
            type: "no_frame_protection",
            severity: "low",
            title: "クリックジャッキング対策なし",
            description: "X-Frame-OptionsまたはCSPのframe-ancestorsが設定されていない可能性があります。",
            recommendation: "HTTPヘッダーでX-Frame-OptionsまたはCSPを設定してください。",
          });
        }

        return {
          issues,
          meta: {
            protocol: window.location.protocol,
            url: window.location.href,
            title: document.title,
          },
        };
      });

      await browser.close();

      // 結果を保存
      const now = new Date();
      const processedIssues: SecurityIssue[] = scanResult.issues.map((issue) => {
        // SECURITY_ISSUE_DETAILSから詳細情報を取得
        const detail = SECURITY_ISSUE_DETAILS[issue.type];
        return {
          id: issue.id || uuidv4(),
          type: issue.type,
          severity: detail?.severity || issue.severity,
          title: detail?.title || issue.title,
          description: detail?.description || issue.description,
          recommendation: detail?.recommendation || issue.recommendation,
          details: issue.details,
          detectedAt: now,
        };
      });

      const score = calculateScore(processedIssues);
      const grade = calculateGrade(score);
      const summary = calculateSummary(processedIssues);
      const today = now.toISOString().split("T")[0];

      // レポートを更新または作成
      const existingReport = await reportsCol.findOne({ companyId: agent.companyId, agentId });

      if (existingReport) {
        const scoreHistory = existingReport.scoreHistory || [];
        const todayIndex = scoreHistory.findIndex((h) => h.date === today);
        if (todayIndex >= 0) {
          scoreHistory[todayIndex] = { date: today, score, grade };
        } else {
          scoreHistory.push({ date: today, score, grade });
          if (scoreHistory.length > 30) scoreHistory.shift();
        }

        await reportsCol.updateOne(
          { companyId: agent.companyId, agentId },
          {
            $set: {
              score,
              grade,
              issuesSummary: summary,
              latestIssues: processedIssues,
              lastScanAt: now,
              scoreHistory,
              updatedAt: now,
            },
            $inc: { scanCount: 1 },
          }
        );
      } else {
        const newReport: SecurityReport = {
          reportId: uuidv4(),
          companyId: agent.companyId,
          agentId,
          score,
          grade,
          issuesSummary: summary,
          latestIssues: processedIssues,
          scanCount: 1,
          lastScanAt: now,
          scoreHistory: [{ date: today, score, grade }],
          createdAt: now,
          updatedAt: now,
        };
        await reportsCol.insertOne(newReport);
      }

      return NextResponse.json({
        success: true,
        result: {
          url: targetUrl,
          score,
          grade,
          issuesSummary: summary,
          issues: processedIssues,
          scannedAt: now,
        },
      });
    } catch (scanError) {
      console.error("[Security Scan] Puppeteer error:", scanError);
      if (browser) await browser.close();
      return NextResponse.json(
        { error: "Failed to scan the website: " + (scanError instanceof Error ? scanError.message : "Unknown error") },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[Security Scan] Error:", error);
    return NextResponse.json({ error: "Failed to process security scan" }, { status: 500 });
  }
}

// GET: エージェントのセキュリティレポートを取得
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.email || !isSuperAdmin(session.user.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    const reportsCol = await getCollection<SecurityReport>("security_reports");
    const report = await reportsCol.findOne({ agentId });

    return NextResponse.json({ report: report || null });
  } catch (error) {
    console.error("[Security Report] Error:", error);
    return NextResponse.json({ error: "Failed to fetch report" }, { status: 500 });
  }
}
