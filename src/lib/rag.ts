import { getOpenAI } from "./openai";
import { getCollection } from "./mongodb";
import { DocChunk, Company } from "./types";

// コサイン類似度を計算
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 会社のrootUrlを取得
async function getCompanyRootUrl(companyId: string): Promise<string | null> {
  const companiesCol = await getCollection<Company>("companies");
  const company = await companiesCol.findOne({ companyId });
  return company?.rootUrl || null;
}

export async function findRelevantChunks(companyId: string, question: string) {
  const docsCol = await getCollection<DocChunk>("documents");
  const openai = getOpenAI();

  const embRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: question,
  });
  const queryVector = embRes.data[0].embedding;

  // まずVector Searchを試みる
  try {
    const pipeline = [
      {
        $vectorSearch: {
          index: "documents_vector_index",
          path: "embeddings",
          queryVector: queryVector,
          numCandidates: 150,
          limit: 15,
          filter: {
            companyId: companyId,
          },
        },
      },
      {
        $project: {
          chunk: 1,
          url: 1,
          title: 1,
          _id: 0,
          score: { $meta: "vectorSearchScore" },
        },
      },
    ];

    const results = await docsCol.aggregate(pipeline).toArray();

    if (results.length > 0) {
      console.log(`[RAG] Vector Search found ${results.length} chunks`);
      return results as {
        chunk: string;
        url: string;
        title: string;
        score: number;
      }[];
    }
  } catch (error) {
    console.log("[RAG] Vector Search failed, using fallback:", error);
  }

  // フォールバック: 全ドキュメントを取得してJavaScriptでコサイン類似度計算
  console.log("[RAG] Using fallback similarity search");

  const allDocs = await docsCol
    .find({ companyId })
    .project({ chunk: 1, url: 1, title: 1, embeddings: 1, _id: 0 })
    .toArray();

  console.log(`[RAG] Found ${allDocs.length} documents for company ${companyId}`);

  if (allDocs.length === 0) {
    return [];
  }

  // コサイン類似度でスコアリング
  const scored = allDocs
    .filter((doc) => doc.embeddings && doc.embeddings.length > 0)
    .map((doc) => ({
      chunk: doc.chunk,
      url: doc.url,
      title: doc.title,
      score: cosineSimilarity(queryVector, doc.embeddings),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  console.log(`[RAG] Top scores: ${scored.slice(0, 3).map(s => s.score.toFixed(3)).join(", ")}`);

  return scored;
}

// URL関連の質問かどうか判定
function isUrlQuestion(question: string): boolean {
  const urlKeywords = ["url", "URL", "リンク", "サイト", "ホームページ", "アドレス", "ページ", "詳細", "詳しく", "こちら", "申し込み", "問い合わせ", "contact"];
  return urlKeywords.some(keyword => question.includes(keyword));
}

export async function answerWithRAG(params: {
  companyId: string;
  question: string;
}) {
  const { companyId, question } = params;
  const chunks = await findRelevantChunks(companyId, question);
  const openai = getOpenAI();

  // 会社のrootUrlを取得（フォールバック用）
  const rootUrl = await getCompanyRootUrl(companyId);

  console.log(`[RAG] Retrieved ${chunks.length} chunks for question: "${question}"`);

  if (chunks.length === 0) {
    // フォールバック: rootUrlを案内
    if (rootUrl) {
      return {
        reply: `詳細については、公式サイトをご確認ください。\n\n🔗 公式サイト → ${rootUrl}`,
        sourceChunks: [],
      };
    }
    return {
      reply: "申し訳ございません。サイト情報が見つかりませんでした。しばらくしてから再度お試しください。",
      sourceChunks: [],
    };
  }

  // チャンクからユニークなURLを抽出
  const uniqueUrls = [...new Set(chunks.map(c => c.url))].slice(0, 5);
  const urlList = uniqueUrls.map(url => `・${url}`).join("\n");

  const contextText = chunks
    .map(
      (c, i) =>
        `【情報${i + 1}】${c.title}\nソースURL: ${c.url}\n${c.chunk}`
    )
    .join("\n\n");

  // 接客AI専用の強化プロンプト（URL回答指示を追加）
  const systemPrompt = `あなたは「企業サイトの詳細を理解した案内AI」です。

■ルール
1. サイトから抽出した情報（= RAGコンテキスト）を最優先で使う
2. 抽出情報が部分的でも、あなたの言葉で丁寧に補完してまとめる
3. 分からない時でも「推測ベース」で関連情報を案内する
4. 「分かりかねます」などの否定回答は禁止
5. 「この企業は◯◯事業を主に提供しています」のように断定的でOK
6. 見出し（h1/h2/h3）をサービスカテゴリとして解釈し説明する
7. 文章はプロの接客レベルで、分かりやすく・端的・丁寧に

■URL・リンクに関するルール（重要）
- リンク（URL）がサイト内に存在する場合は、必ず回答に含めてください
- リンクは「◯◯はこちら → URL」の形式で案内してください
- 🔗マークがついているリンク情報は特に重要なので優先して案内してください
- ユーザーがURLやリンクを求めている場合は、関連するURLを必ず提示してください

■回答形式
- まず結論（1〜2行）
- その後に「具体的サービス内容を箇条書き」
- 関連するURLがあれば「🔗 詳細はこちら → URL」形式で案内
- さらに理解を深める追加説明（必要に応じて）

■禁止事項
- 「情報が見つかりませんでした」という回答
- 曖昧な表現（〜かもしれません、〜と思われます）
- コンテキストに言及する（「提供された情報によると」等）`;

  // URL質問の場合は追加の指示
  const urlHint = isUrlQuestion(question)
    ? `\n\n【重要】この質問はURL/リンクに関する質問です。必ず関連URLを回答に含めてください。見つからない場合は公式サイト（${rootUrl}）を案内してください。`
    : "";

  const userPrompt = `[サイトから抽出した情報]
${contextText}

[関連ページURL一覧]
${urlList}
${rootUrl ? `\n[公式サイトURL]\n${rootUrl}` : ""}

[お客様からの質問]
${question}${urlHint}

上記の情報を元に、プロの接客AIとして質問に回答してください。`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.4,
    max_tokens: 1500,
  });

  const reply = completion.choices[0].message.content ?? "";
  return { reply, sourceChunks: chunks };
}
