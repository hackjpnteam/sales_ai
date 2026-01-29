import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollection } from "@/lib/mongodb";
import { Agent, Company, SecurityReport, SecurityScanResult } from "@/lib/types";
import { isSuperAdmin } from "@/lib/admin";

// GET: セキュリティレポートを取得
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
    const scansCol = await getCollection<SecurityScanResult>("security_scans");

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
      // まだスキャンデータがない場合
      return NextResponse.json({
        report: null,
        message: "No security scans yet. The widget will automatically scan when visitors access your site.",
      });
    }

    // 最新のスキャン5件も取得
    const recentScans = await scansCol
      .find({ companyId: agent.companyId, agentId })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    return NextResponse.json({
      report: {
        reportId: report.reportId,
        score: report.score,
        grade: report.grade,
        issuesSummary: report.issuesSummary,
        latestIssues: report.latestIssues,
        scanCount: report.scanCount,
        lastScanAt: report.lastScanAt,
        scoreHistory: report.scoreHistory,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      },
      recentScans: recentScans.map(scan => ({
        scanId: scan.scanId,
        pageUrl: scan.pageUrl,
        issueCount: scan.issues.length,
        createdAt: scan.createdAt,
      })),
    });
  } catch (error) {
    console.error("[Security Report] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch security report" },
      { status: 500 }
    );
  }
}

// DELETE: セキュリティデータをリセット（オプション）
export async function DELETE(
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
    const scansCol = await getCollection<SecurityScanResult>("security_scans");

    // エージェントを取得
    const agent = await agentsCol.findOne({ agentId });
    if (!agent) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    // 会社を取得し、オーナーかチェック
    const company = await companiesCol.findOne({ companyId: agent.companyId });
    if (!company || company.userId !== userId) {
      return NextResponse.json(
        { error: "Only the owner can reset security data" },
        { status: 403 }
      );
    }

    // レポートとスキャンデータを削除
    await reportsCol.deleteMany({ companyId: agent.companyId, agentId });
    await scansCol.deleteMany({ companyId: agent.companyId, agentId });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Security Report Delete] Error:", error);
    return NextResponse.json(
      { error: "Failed to reset security data" },
      { status: 500 }
    );
  }
}
