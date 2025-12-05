import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollection } from "@/lib/mongodb";
import { createEmbedding } from "@/lib/openai";
import { v4 as uuidv4 } from "uuid";
import { CustomKnowledge, Company, Agent } from "@/lib/types";

const MAX_CONTENT_LENGTH = 3000;

// GET: カスタムナレッジ一覧取得
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  try {
    // 権限チェック
    const companiesCol = await getCollection<Company>("companies");
    const company = await companiesCol.findOne({ companyId });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Proプランチェック
    if (company.plan !== "pro") {
      return NextResponse.json(
        { error: "Pro plan required", knowledges: [] },
        { status: 200 }
      );
    }

    const knowledgeCol = await getCollection<CustomKnowledge>("custom_knowledge");
    const knowledges = await knowledgeCol
      .find({ companyId })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({
      knowledges: knowledges.map((k) => ({
        knowledgeId: k.knowledgeId,
        title: k.title,
        content: k.content,
        createdAt: k.createdAt,
        updatedAt: k.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching knowledge:", error);
    return NextResponse.json(
      { error: "Failed to fetch knowledge" },
      { status: 500 }
    );
  }
}

// POST: カスタムナレッジ追加
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { companyId, title, content } = body;

    if (!companyId || !title || !content) {
      return NextResponse.json(
        { error: "companyId, title, content required" },
        { status: 400 }
      );
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Content must be ${MAX_CONTENT_LENGTH} characters or less` },
        { status: 400 }
      );
    }

    // 権限チェック
    const companiesCol = await getCollection<Company>("companies");
    const company = await companiesCol.findOne({ companyId });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Proプランチェック
    if (company.plan !== "pro") {
      return NextResponse.json(
        { error: "Pro plan required" },
        { status: 403 }
      );
    }

    // エージェント取得
    const agentsCol = await getCollection<Agent>("agents");
    const agent = await agentsCol.findOne({ companyId });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // 埋め込みベクトルを生成
    const embeddings = await createEmbedding(`${title}\n${content}`);

    const knowledgeCol = await getCollection<CustomKnowledge>("custom_knowledge");
    const now = new Date();
    const knowledgeId = uuidv4();

    await knowledgeCol.insertOne({
      knowledgeId,
      companyId,
      agentId: agent.agentId,
      title,
      content,
      embeddings,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({
      success: true,
      knowledgeId,
      message: "Knowledge added successfully",
    });
  } catch (error) {
    console.error("Error adding knowledge:", error);
    return NextResponse.json(
      { error: "Failed to add knowledge" },
      { status: 500 }
    );
  }
}

// PUT: カスタムナレッジ更新
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { companyId, knowledgeId, title, content } = body;

    if (!companyId || !knowledgeId || !title || !content) {
      return NextResponse.json(
        { error: "companyId, knowledgeId, title, content required" },
        { status: 400 }
      );
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Content must be ${MAX_CONTENT_LENGTH} characters or less` },
        { status: 400 }
      );
    }

    // 権限チェック
    const companiesCol = await getCollection<Company>("companies");
    const company = await companiesCol.findOne({ companyId });

    if (!company || company.plan !== "pro") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 埋め込みベクトルを再生成
    const embeddings = await createEmbedding(`${title}\n${content}`);

    const knowledgeCol = await getCollection<CustomKnowledge>("custom_knowledge");
    const result = await knowledgeCol.updateOne(
      { companyId, knowledgeId },
      {
        $set: {
          title,
          content,
          embeddings,
          updatedAt: new Date(),
        },
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Knowledge not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Knowledge updated successfully",
    });
  } catch (error) {
    console.error("Error updating knowledge:", error);
    return NextResponse.json(
      { error: "Failed to update knowledge" },
      { status: 500 }
    );
  }
}

// DELETE: カスタムナレッジ削除
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  const knowledgeId = searchParams.get("knowledgeId");

  if (!companyId || !knowledgeId) {
    return NextResponse.json(
      { error: "companyId and knowledgeId required" },
      { status: 400 }
    );
  }

  try {
    // 権限チェック
    const companiesCol = await getCollection<Company>("companies");
    const company = await companiesCol.findOne({ companyId });

    if (!company || company.plan !== "pro") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const knowledgeCol = await getCollection<CustomKnowledge>("custom_knowledge");
    const result = await knowledgeCol.deleteOne({ companyId, knowledgeId });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: "Knowledge not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Knowledge deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting knowledge:", error);
    return NextResponse.json(
      { error: "Failed to delete knowledge" },
      { status: 500 }
    );
  }
}
