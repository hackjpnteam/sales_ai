import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCollection } from "@/lib/mongodb";
import { createEmbedding } from "@/lib/openai";
import { v4 as uuidv4 } from "uuid";
import { CustomKnowledge, Company, Agent, User } from "@/lib/types";
import * as mammoth from "mammoth";
import { checkRateLimit, getClientIP, RATE_LIMIT_CONFIGS } from "@/lib/rate-limit";

const MAX_CONTENT_LENGTH = 50000; // アップロード時は50000文字まで許可
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// ファイルのマジックバイトを検証（セキュリティ対策）
type FileType = "pdf" | "docx" | "txt" | "unknown";

function detectFileType(buffer: Buffer): FileType {
  // PDF: %PDF-
  if (buffer.length >= 5 && buffer.slice(0, 5).toString() === "%PDF-") {
    return "pdf";
  }

  // DOCX (ZIP形式): PK\x03\x04
  if (buffer.length >= 4 &&
      buffer[0] === 0x50 && buffer[1] === 0x4B &&
      buffer[2] === 0x03 && buffer[3] === 0x04) {
    return "docx";
  }

  // テキストファイル（UTF-8 BOMまたは印字可能文字のみ）
  const sample = buffer.slice(0, Math.min(1000, buffer.length));
  const isBOM = sample.length >= 3 && sample[0] === 0xEF && sample[1] === 0xBB && sample[2] === 0xBF;
  const isText = Array.from(sample).every(byte =>
    byte === 0x09 || byte === 0x0A || byte === 0x0D || (byte >= 0x20 && byte <= 0x7E) || byte >= 0x80
  );

  if (isBOM || isText) {
    return "txt";
  }

  return "unknown";
}

function validateFileTypeMatch(fileName: string, detectedType: FileType): boolean {
  const ext = fileName.toLowerCase();

  if (ext.endsWith(".pdf") && detectedType === "pdf") return true;
  if ((ext.endsWith(".docx") || ext.endsWith(".doc")) && detectedType === "docx") return true;
  if ((ext.endsWith(".txt") || ext.endsWith(".md") || ext.endsWith(".csv")) && detectedType === "txt") return true;

  return false;
}

// ユーザーが会社にアクセスできるか確認
async function canAccessCompany(session: { user: { id?: string; email?: string | null } }, companyId: string): Promise<boolean> {
  const usersCol = await getCollection<User>("users");
  const agentsCol = await getCollection<Agent>("agents");

  const user = await usersCol.findOne({ userId: session.user.id });
  if (user?.companyIds?.includes(companyId)) {
    return true;
  }

  const agent = await agentsCol.findOne({ companyId });
  if (agent?.sharedWith?.some(
    (shared) => shared.email === session.user.email || shared.userId === session.user.id
  )) {
    return true;
  }

  return false;
}

// テキストを分割する関数（長いテキストを複数のナレッジに分割）
function splitText(text: string, maxLength: number = 3000): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + 2 <= maxLength) {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      // 段落が長すぎる場合は強制分割
      if (paragraph.length > maxLength) {
        const words = paragraph.split(/\s+/);
        currentChunk = "";
        for (const word of words) {
          if (currentChunk.length + word.length + 1 <= maxLength) {
            currentChunk += (currentChunk ? " " : "") + word;
          } else {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = word;
          }
        }
      } else {
        currentChunk = paragraph;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // レート制限チェック
    const clientIP = getClientIP(req);
    const rateLimit = await checkRateLimit(clientIP, "upload", RATE_LIMIT_CONFIGS.upload);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "リクエストが多すぎます。しばらくお待ちください。" },
        { status: 429 }
      );
    }
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const companyId = formData.get("companyId") as string | null;

    if (!file || !companyId) {
      return NextResponse.json(
        { error: "file and companyId required" },
        { status: 400 }
      );
    }

    // ファイルサイズチェック
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `ファイルサイズは${MAX_FILE_SIZE / 1024 / 1024}MB以下にしてください` },
        { status: 413 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "ファイルが空です" },
        { status: 400 }
      );
    }

    // 権限チェック
    if (!await canAccessCompany(session, companyId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Proプランチェック
    const companiesCol = await getCollection<Company>("companies");
    const company = await companiesCol.findOne({ companyId });

    if (!company || (company.plan !== "pro" && company.plan !== "max")) {
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

    // ファイルタイプチェックとテキスト抽出
    const fileName = file.name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    let extractedText = "";

    // マジックバイト検証（セキュリティ対策）
    const detectedType = detectFileType(buffer);
    if (!validateFileTypeMatch(fileName, detectedType)) {
      console.warn(`[Upload] File type mismatch: ${fileName} detected as ${detectedType}`);
      return NextResponse.json(
        { error: "ファイル形式が不正です。正しいファイルをアップロードしてください。" },
        { status: 400 }
      );
    }

    if (fileName.endsWith(".pdf")) {
      // PDF処理（unpdf使用）
      const { extractText } = await import("unpdf");
      const uint8Array = new Uint8Array(buffer);
      const result = await extractText(uint8Array);
      // textは配列で返される可能性があるため、結合する
      if (Array.isArray(result.text)) {
        extractedText = result.text.join("\n\n");
      } else {
        extractedText = result.text || "";
      }
    } else if (fileName.endsWith(".docx")) {
      // Word処理
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else if (fileName.endsWith(".txt") || fileName.endsWith(".md")) {
      // テキストファイル
      extractedText = buffer.toString("utf-8");
    } else {
      return NextResponse.json(
        { error: "Unsupported file type. Supported: PDF, DOCX, TXT, MD" },
        { status: 400 }
      );
    }

    // テキストのクリーンアップ
    extractedText = extractedText
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!extractedText) {
      return NextResponse.json(
        { error: "Could not extract text from file" },
        { status: 400 }
      );
    }

    if (extractedText.length > MAX_CONTENT_LENGTH) {
      extractedText = extractedText.substring(0, MAX_CONTENT_LENGTH);
    }

    // テキストを分割
    const chunks = splitText(extractedText, 3000);
    const knowledgeCol = await getCollection<CustomKnowledge>("custom_knowledge");
    const now = new Date();
    const baseTitle = file.name.replace(/\.[^/.]+$/, ""); // 拡張子を除去

    const createdKnowledges: { knowledgeId: string; title: string }[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const title = chunks.length > 1 ? `${baseTitle} (${i + 1}/${chunks.length})` : baseTitle;
      const knowledgeId = uuidv4();

      // 埋め込みベクトルを生成
      const embeddings = await createEmbedding(`${title}\n${chunk}`);

      await knowledgeCol.insertOne({
        knowledgeId,
        companyId,
        agentId: agent.agentId,
        title,
        content: chunk,
        embeddings,
        createdAt: now,
        updatedAt: now,
      });

      createdKnowledges.push({ knowledgeId, title });
    }

    console.log(`[Knowledge Upload] Created ${createdKnowledges.length} knowledge entries from ${file.name}`);

    return NextResponse.json({
      success: true,
      message: `${createdKnowledges.length}件のナレッジを作成しました`,
      knowledges: createdKnowledges,
      totalCharacters: extractedText.length,
    });
  } catch (error) {
    console.error("Error uploading knowledge:", error);
    return NextResponse.json(
      { error: "Failed to upload knowledge" },
      { status: 500 }
    );
  }
}
