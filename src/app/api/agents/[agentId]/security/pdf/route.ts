import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollection } from "@/lib/mongodb";
import { Agent, Company, SecurityReport, SecuritySeverity } from "@/lib/types";
import { isSuperAdmin } from "@/lib/admin";

// 重要度ラベルのマッピング
const severityLabels: Record<SecuritySeverity, string> = {
  critical: "Critical (重大)",
  high: "High (高)",
  medium: "Medium (中)",
  low: "Low (低)",
  info: "Info (情報)",
};

// グレードの説明
const gradeDescriptions: Record<string, string> = {
  A: "優秀 - セキュリティ状態は良好です",
  B: "良好 - 軽微な問題があります",
  C: "注意 - いくつかの問題に対処が必要です",
  D: "警告 - 複数の重要な問題があります",
  F: "危険 - 緊急の対処が必要です",
};

// GET: PDFレポートを生成
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { agentId } = await params;
    const userId = session.user.id;

    const agentsCol = await getCollection<Agent>("agents");
    const companiesCol = await getCollection<Company>("companies");
    const reportsCol = await getCollection<SecurityReport>("security_reports");

    // エージェントを取得
    const agent = await agentsCol.findOne({ agentId });
    if (!agent) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    // 会社を取得し、アクセス権をチェック
    const company = await companiesCol.findOne({ companyId: agent.companyId });
    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
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
    const isShared = agent.sharedWith?.some(s => s.userId === userId);

    if (!isOwner && !isShared) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
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

    // jspdfを動的インポート（サーバーサイドでのみ使用）
    const { jsPDF } = await import("jspdf");
    // @ts-expect-error - jspdf-autotableの型定義がない
    const autoTable = (await import("jspdf-autotable")).default;

    // PDFドキュメントを作成
    const doc = new jsPDF();

    // フォントの設定（日本語対応のためヘルパー関数を使用）
    const addText = (text: string, x: number, y: number, options?: { fontSize?: number; fontStyle?: "normal" | "bold"; color?: [number, number, number] }) => {
      if (options?.fontSize) doc.setFontSize(options.fontSize);
      if (options?.fontStyle === "bold") {
        doc.setFont("helvetica", "bold");
      } else {
        doc.setFont("helvetica", "normal");
      }
      if (options?.color) doc.setTextColor(...options.color);
      else doc.setTextColor(0, 0, 0);
      doc.text(text, x, y);
    };

    // ヘッダー
    doc.setFillColor(225, 29, 72); // rose-600
    doc.rect(0, 0, 210, 40, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("Security Report", 20, 25);

    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Agent: ${agent.name}`, 20, 35);

    // 生成日時
    const now = new Date();
    addText(`Generated: ${now.toLocaleString("en-US")}`, 140, 35, { fontSize: 10, color: [255, 255, 255] });

    // スコアセクション
    let yPos = 55;

    addText("Security Score", 20, yPos, { fontSize: 16, fontStyle: "bold" });
    yPos += 15;

    // グレードボックス
    const gradeColors: Record<string, [number, number, number]> = {
      A: [16, 185, 129], // emerald-500
      B: [34, 197, 94],  // green-500
      C: [234, 179, 8],  // yellow-500
      D: [249, 115, 22], // orange-500
      F: [239, 68, 68],  // red-500
    };

    const gradeColor = gradeColors[report.grade] || [100, 100, 100];
    doc.setFillColor(...gradeColor);
    doc.roundedRect(20, yPos, 40, 40, 5, 5, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(32);
    doc.setFont("helvetica", "bold");
    doc.text(report.grade, 33, yPos + 28);

    // スコアと説明
    addText(`Score: ${report.score}/100`, 70, yPos + 12, { fontSize: 14, fontStyle: "bold" });
    addText(gradeDescriptions[report.grade] || "", 70, yPos + 24, { fontSize: 10, color: [100, 100, 100] });
    addText(`Last scan: ${new Date(report.lastScanAt).toLocaleString("en-US")}`, 70, yPos + 36, { fontSize: 9, color: [150, 150, 150] });

    yPos += 55;

    // 問題サマリー
    addText("Issue Summary", 20, yPos, { fontSize: 16, fontStyle: "bold" });
    yPos += 10;

    const summaryData = [
      ["Critical", String(report.issuesSummary.critical)],
      ["High", String(report.issuesSummary.high)],
      ["Medium", String(report.issuesSummary.medium)],
      ["Low", String(report.issuesSummary.low)],
      ["Info", String(report.issuesSummary.info)],
      ["Total", String(report.issuesSummary.total)],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [["Severity", "Count"]],
      body: summaryData,
      theme: "striped",
      headStyles: { fillColor: [225, 29, 72] },
      margin: { left: 20, right: 20 },
      tableWidth: 80,
    });

    // @ts-expect-error - autoTableのfinalYプロパティ
    yPos = doc.lastAutoTable.finalY + 15;

    // 検出された問題の詳細
    if (report.latestIssues.length > 0) {
      addText("Detected Issues", 20, yPos, { fontSize: 16, fontStyle: "bold" });
      yPos += 10;

      const issuesData = report.latestIssues.map((issue) => [
        severityLabels[issue.severity] || issue.severity,
        issue.title,
        issue.description.substring(0, 60) + (issue.description.length > 60 ? "..." : ""),
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [["Severity", "Issue", "Description"]],
        body: issuesData,
        theme: "striped",
        headStyles: { fillColor: [225, 29, 72] },
        margin: { left: 20, right: 20 },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 45 },
          2: { cellWidth: "auto" },
        },
        styles: { fontSize: 9 },
      });

      // @ts-expect-error - autoTableのfinalYプロパティ
      yPos = doc.lastAutoTable.finalY + 15;

      // 推奨事項
      if (yPos < 250) {
        addText("Recommendations", 20, yPos, { fontSize: 16, fontStyle: "bold" });
        yPos += 10;

        const recommendations = report.latestIssues
          .filter((issue) => issue.recommendation)
          .slice(0, 5)
          .map((issue, index) => [`${index + 1}.`, issue.title, issue.recommendation]);

        if (recommendations.length > 0) {
          autoTable(doc, {
            startY: yPos,
            head: [["#", "Issue", "Recommendation"]],
            body: recommendations,
            theme: "striped",
            headStyles: { fillColor: [225, 29, 72] },
            margin: { left: 20, right: 20 },
            columnStyles: {
              0: { cellWidth: 10 },
              1: { cellWidth: 40 },
              2: { cellWidth: "auto" },
            },
            styles: { fontSize: 9 },
          });
        }
      }
    } else {
      addText("No security issues detected.", 20, yPos, { fontSize: 12, color: [16, 185, 129] });
    }

    // フッター
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Page ${i} of ${pageCount} | Generated by ChatSales Security Scanner`,
        105,
        290,
        { align: "center" }
      );
    }

    // PDFをバッファとして出力
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="security-report-${agentId}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[Security PDF] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF report" },
      { status: 500 }
    );
  }
}
