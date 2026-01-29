import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollection } from "@/lib/mongodb";
import { Agent, Company, SecurityReport } from "@/lib/types";
import { isSuperAdmin } from "@/lib/admin";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

// GET: PDFレポートを生成
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  let browser;
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { agentId } = await params;
    const userId = session.user.id;

    const agentsCol = await getCollection<Agent>("agents");
    const companiesCol = await getCollection<Company>("companies");
    const reportsCol = await getCollection<SecurityReport>("security_reports");

    // エージェントを取得
    const agent = await agentsCol.findOne({ agentId });
    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // 会社を取得
    const company = await companiesCol.findOne({ companyId: agent.companyId });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // スーパーアドミン専用チェック
    if (!isSuperAdmin(session.user.email)) {
      return NextResponse.json(
        { error: "Security reports are only available for super admins" },
        { status: 403 }
      );
    }

    // ユーザーがこのcompanyにアクセス権があるかチェック
    const isOwner = company.userId === userId;
    const isShared = agent.sharedWith?.some((s) => s.userId === userId);

    if (!isOwner && !isShared) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // レポートを取得
    const report = await reportsCol.findOne({
      companyId: agent.companyId,
      agentId,
    });

    if (!report) {
      return NextResponse.json(
        { error: "No security scan data available" },
        { status: 404 }
      );
    }

    // superadmin版のPDF APIにリダイレクト（同じ形式で生成）
    const scanResult = {
      url: company.rootUrl || agent.rootUrl || "Unknown",
      score: report.score,
      grade: report.grade,
      issuesSummary: report.issuesSummary,
      issues: report.latestIssues,
      scannedAt: report.lastScanAt,
    };

    // HTMLを生成
    const html = generateHTML(scanResult, agent.name);

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
    const filename = `hackjpn-security-report-${agentId}-${new Date().toISOString().split("T")[0]}.pdf`;

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
    return NextResponse.json(
      { error: "Failed to generate PDF report" },
      { status: 500 }
    );
  }
}

type ScanResult = {
  url: string;
  score: number;
  grade: string;
  issuesSummary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };
  issues: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    description: string;
    recommendation: string;
    details?: string;
  }>;
  scannedAt: Date | string;
};

function generateHTML(scanResult: ScanResult, agentName: string): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const gradeColors: Record<string, string> = {
    A: "#10b981",
    B: "#22c55e",
    C: "#eab308",
    D: "#f97316",
    F: "#ef4444",
  };
  const gradeColor = gradeColors[scanResult.grade] || "#64748b";

  const gradeDescriptions: Record<string, { label: string; desc: string }> = {
    A: { label: "優秀", desc: "セキュリティ対策が適切に実施されています。" },
    B: { label: "良好", desc: "基本的なセキュリティ対策は実施されています。" },
    C: { label: "要改善", desc: "複数のセキュリティ上の問題が検出されました。" },
    D: { label: "危険", desc: "重大なセキュリティリスクが存在します。" },
    F: { label: "緊急対応必要", desc: "複数の重大な脆弱性が検出されました。" },
  };
  const gradeInfo = gradeDescriptions[scanResult.grade] || { label: "-", desc: "" };

  const severityLabels: Record<string, string> = {
    critical: "重大",
    high: "高",
    medium: "中",
    low: "低",
    info: "情報",
  };

  const issuesHTML = scanResult.issues
    .map((issue) => {
      const label = severityLabels[issue.severity] || issue.severity;
      return `
      <div style="background: white; border-radius: 8px; padding: 12px; margin-bottom: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); page-break-inside: avoid;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="background: #e11d48; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px;">${label}</span>
          <strong style="font-size: 13px;">${issue.title}</strong>
        </div>
        <div style="color: #4b5563; font-size: 11px; line-height: 1.5;">${issue.description}</div>
        <div style="margin-top: 8px; padding: 8px; background: #f0fdf4; border-radius: 4px; font-size: 10px; color: #166534;">
          推奨対策: ${issue.recommendation}
        </div>
      </div>
    `;
    })
    .join("");

  return `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <style>
    @page { margin: 0; size: A4; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif;
      font-size: 12px;
      line-height: 1.6;
      color: #1f2937;
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 15mm 20mm;
      page-break-after: always;
    }
  </style>
</head>
<body>
  <div class="page" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
    <div style="font-size: 11px; color: #64748b; letter-spacing: 3px; margin-bottom: 12px;">SECURITY ASSESSMENT REPORT</div>
    <div style="font-size: 36px; font-weight: bold;">hackjpn</div>
    <div style="font-size: 20px; margin-top: 8px; color: #e2e8f0;">セキュリティ診断書</div>
    <div style="margin-top: 20px; font-size: 14px; color: #94a3b8;">${agentName}</div>

    <div style="width: 100px; height: 100px; border-radius: 50%; background: ${gradeColor}; display: flex; align-items: center; justify-content: center; margin: 30px 0;">
      <span style="font-size: 48px; font-weight: bold;">${scanResult.grade}</span>
    </div>

    <div style="font-size: 28px; font-weight: bold;">${scanResult.score}<span style="font-size: 16px; color: #94a3b8;"> / 100 点</span></div>
    <div style="font-size: 14px; color: ${gradeColor}; margin-top: 8px;">${gradeInfo.label}</div>

    <div style="margin-top: 30px; font-size: 12px; color: #64748b;">診断日: ${dateStr}</div>
  </div>

  <div class="page" style="background: #f8fafc;">
    <div style="background: linear-gradient(135deg, #e11d48 0%, #be185d 100%); color: white; padding: 16px 20mm; margin: -15mm -20mm 20px -20mm;">
      <h1 style="font-size: 18px; font-weight: bold;">検出された問題</h1>
    </div>

    <div style="display: flex; gap: 10px; margin-bottom: 20px;">
      <div style="flex: 1; background: #fef2f2; border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 20px; font-weight: bold; color: #dc2626;">${scanResult.issuesSummary.critical}</div>
        <div style="font-size: 10px; color: #991b1b;">重大</div>
      </div>
      <div style="flex: 1; background: #fff7ed; border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 20px; font-weight: bold; color: #ea580c;">${scanResult.issuesSummary.high}</div>
        <div style="font-size: 10px; color: #9a3412;">高</div>
      </div>
      <div style="flex: 1; background: #fefce8; border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 20px; font-weight: bold; color: #ca8a04;">${scanResult.issuesSummary.medium}</div>
        <div style="font-size: 10px; color: #854d0e;">中</div>
      </div>
      <div style="flex: 1; background: #eff6ff; border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 20px; font-weight: bold; color: #2563eb;">${scanResult.issuesSummary.low}</div>
        <div style="font-size: 10px; color: #1e40af;">低</div>
      </div>
    </div>

    ${scanResult.issues.length === 0 ? `
      <div style="background: #f0fdf4; border: 2px solid #86efac; border-radius: 12px; padding: 30px; text-align: center;">
        <div style="font-size: 40px; margin-bottom: 12px;">✅</div>
        <div style="font-size: 16px; font-weight: bold; color: #16a34a;">セキュリティ問題は検出されませんでした</div>
      </div>
    ` : issuesHTML}

    <div style="position: absolute; bottom: 10mm; left: 20mm; right: 20mm; text-align: center; font-size: 9px; color: #94a3b8;">
      hackjpn Security Assessment Report - Confidential
    </div>
  </div>
</body>
</html>
  `;
}
