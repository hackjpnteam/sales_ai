import { NextRequest, NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import {
  Company,
  Agent,
  User,
  SecurityIssue,
  SecurityScanResult,
  SecurityReport,
  SecuritySeverity,
} from "@/lib/types";
import { v4 as uuidv4 } from "uuid";
import { isSuperAdmin } from "@/lib/admin";

// スコア計算関数
function calculateScore(issues: SecurityIssue[]): number {
  let score = 100;

  for (const issue of issues) {
    switch (issue.severity) {
      case "critical":
        score -= 25;
        break;
      case "high":
        score -= 15;
        break;
      case "medium":
        score -= 8;
        break;
      case "low":
        score -= 3;
        break;
      case "info":
        // infoは減点なし
        break;
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
  const summary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    total: issues.length,
  };

  for (const issue of issues) {
    summary[issue.severity]++;
  }

  return summary;
}

// POST: ウィジェットからスキャン結果を受信
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      companyId,
      sessionId,
      pageUrl,
      issues,
      meta,
      userAgent,
    } = body;

    if (!companyId || !sessionId || !pageUrl) {
      return NextResponse.json(
        { error: "companyId, sessionId, and pageUrl are required" },
        { status: 400 }
      );
    }

    const companiesCol = await getCollection<Company>("companies");
    const agentsCol = await getCollection<Agent>("agents");
    const usersCol = await getCollection<User>("users");
    const scansCol = await getCollection<SecurityScanResult>("security_scans");
    const reportsCol = await getCollection<SecurityReport>("security_reports");

    // 会社とエージェントを取得
    const company = await companiesCol.findOne({ companyId });
    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    // スーパーアドミン専用チェック
    // 会社のオーナーがスーパーアドミンかどうかを確認
    const owner = company.userId ? await usersCol.findOne({ userId: company.userId }) : null;
    if (!owner || !isSuperAdmin(owner.email)) {
      return NextResponse.json(
        { error: "Security scan is only available for super admins" },
        { status: 403 }
      );
    }

    const agent = await agentsCol.findOne({ companyId });
    if (!agent) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    // 同じセッションからの重複スキャンを防止
    const existingScan = await scansCol.findOne({
      companyId,
      sessionId,
    });

    if (existingScan) {
      // 既にスキャン済みの場合は成功扱い
      return NextResponse.json({
        success: true,
        scanId: existingScan.scanId,
        message: "Scan already recorded for this session",
      });
    }

    // SecurityIssueにタイムスタンプ追加
    const now = new Date();
    const processedIssues: SecurityIssue[] = (issues || []).map((issue: Partial<SecurityIssue>) => ({
      id: issue.id || uuidv4(),
      type: issue.type || "unknown",
      severity: issue.severity || "info",
      title: issue.title || "Unknown Issue",
      description: issue.description || "",
      recommendation: issue.recommendation || "",
      details: issue.details,
      detectedAt: now,
    }));

    // スキャン結果を保存
    const scanResult: SecurityScanResult = {
      scanId: uuidv4(),
      companyId,
      agentId: agent.agentId,
      sessionId,
      pageUrl,
      issues: processedIssues,
      meta: meta || {
        protocol: "unknown",
        hasHttpForms: false,
        hasMixedContent: false,
        externalScripts: [],
        cookieFlags: { total: 0, httpOnly: 0, secure: 0 },
      },
      userAgent: userAgent || "unknown",
      createdAt: now,
    };

    await scansCol.insertOne(scanResult);

    // レポートを更新または作成
    const existingReport = await reportsCol.findOne({
      companyId,
      agentId: agent.agentId,
    });

    const score = calculateScore(processedIssues);
    const grade = calculateGrade(score);
    const summary = calculateSummary(processedIssues);
    const today = now.toISOString().split("T")[0];

    if (existingReport) {
      // 既存レポートを更新
      const scoreHistory = existingReport.scoreHistory || [];

      // 今日のエントリがあれば更新、なければ追加
      const todayIndex = scoreHistory.findIndex(h => h.date === today);
      if (todayIndex >= 0) {
        scoreHistory[todayIndex] = { date: today, score, grade };
      } else {
        scoreHistory.push({ date: today, score, grade });
        // 30日分のみ保持
        if (scoreHistory.length > 30) {
          scoreHistory.shift();
        }
      }

      await reportsCol.updateOne(
        { companyId, agentId: agent.agentId },
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
      // 新規レポートを作成
      const newReport: SecurityReport = {
        reportId: uuidv4(),
        companyId,
        agentId: agent.agentId,
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

    return NextResponse.json(
      {
        success: true,
        scanId: scanResult.scanId,
        score,
        grade,
        issueCount: processedIssues.length,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  } catch (error) {
    console.error("[Security Scan] Error:", error);
    return NextResponse.json(
      { error: "Failed to process security scan" },
      { status: 500 }
    );
  }
}

// OPTIONS: CORSプリフライト対応
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
