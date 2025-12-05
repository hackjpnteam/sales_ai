import { getOpenAI } from "./openai";
import { getCollection } from "./mongodb";
import { DocChunk, CustomKnowledge } from "./types";

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

// 検索結果の型
type SearchResult = {
  chunk: string;
  url: string;
  title: string;
  score: number;
  isCustomKnowledge?: boolean;
};

export async function findRelevantChunks(companyId: string, question: string): Promise<SearchResult[]> {
  const docsCol = await getCollection<DocChunk>("documents");
  const knowledgeCol = await getCollection<CustomKnowledge>("custom_knowledge");
  const openai = getOpenAI();

  const embRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: question,
  });
  const queryVector = embRes.data[0].embedding;

  // ドキュメント検索結果
  let docResults: SearchResult[] = [];

  // まずVector Searchを試みる
  try {
    const pipeline = [
      {
        $vectorSearch: {
          index: "documents_vector_index",
          path: "embeddings",
          queryVector: queryVector,
          numCandidates: 150,
          limit: 10,
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
      docResults = results as SearchResult[];
    }
  } catch (error) {
    console.log("[RAG] Vector Search failed, using fallback:", error);
  }

  // Vector Searchが失敗またはゼロ件の場合、フォールバック
  if (docResults.length === 0) {
    console.log("[RAG] Using fallback similarity search");

    const allDocs = await docsCol
      .find({ companyId })
      .project({ chunk: 1, url: 1, title: 1, embeddings: 1, _id: 0 })
      .toArray();

    console.log(`[RAG] Found ${allDocs.length} documents for company ${companyId}`);

    if (allDocs.length > 0) {
      docResults = allDocs
        .filter((doc) => doc.embeddings && doc.embeddings.length > 0)
        .map((doc) => ({
          chunk: doc.chunk,
          url: doc.url,
          title: doc.title,
          score: cosineSimilarity(queryVector, doc.embeddings),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
    }
  }

  // カスタムナレッジも検索（Pro機能）
  let knowledgeResults: SearchResult[] = [];
  try {
    const customKnowledges = await knowledgeCol
      .find({ companyId })
      .project({ title: 1, content: 1, embeddings: 1, _id: 0 })
      .toArray();

    if (customKnowledges.length > 0) {
      console.log(`[RAG] Found ${customKnowledges.length} custom knowledge entries`);
      knowledgeResults = customKnowledges
        .filter((k) => k.embeddings && k.embeddings.length > 0)
        .map((k) => ({
          chunk: k.content,
          url: "",
          title: k.title,
          score: cosineSimilarity(queryVector, k.embeddings),
          isCustomKnowledge: true,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    }
  } catch (error) {
    console.log("[RAG] Custom knowledge search error:", error);
  }

  // 結合してスコア順にソート（カスタムナレッジはスコアにボーナス付与）
  const allResults = [...docResults, ...knowledgeResults.map(k => ({
    ...k,
    score: k.score * 1.1, // カスタムナレッジを優先
  }))];

  const sorted = allResults
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  console.log(`[RAG] Top scores: ${sorted.slice(0, 3).map(s => s.score.toFixed(3)).join(", ")}`);

  return sorted;
}


// 関連URLの型
export type RelatedLink = {
  url: string;
  title: string;
  description: string;
};

export async function answerWithRAG(params: {
  companyId: string;
  question: string;
  language?: string;
}) {
  const { companyId, question, language = "ja" } = params;
  const chunks = await findRelevantChunks(companyId, question);
  const openai = getOpenAI();

  console.log(`[RAG] Retrieved ${chunks.length} chunks for question: "${question}"`);

  if (chunks.length === 0) {
    const noInfoMessages = {
      ja: "申し訳ございません。お探しの情報が見つかりませんでした。別のご質問をお試しください。",
      en: "I apologize, but I couldn't find the information you're looking for. Please try a different question.",
      zh: "抱歉，我找不到您要查找的信息。请尝试其他问题。",
    };
    return {
      reply: noInfoMessages[language as keyof typeof noInfoMessages] || noInfoMessages.ja,
      sourceChunks: [],
      relatedLinks: [],
    };
  }

  // 高スコアのチャンクのみ使用（閾値0.3以上）
  const relevantChunks = chunks.filter(c => c.score >= 0.3);
  console.log(`[RAG] High-score chunks: ${relevantChunks.length} (threshold: 0.3)`);

  // URLを持つチャンクのみからリンクを抽出（カスタムナレッジは除外）
  const urlChunks = relevantChunks
    .filter(c => c.url && !c.isCustomKnowledge)
    .slice(0, 3);

  // 質問に関連するリンクのみをAIで判定
  const relatedLinks: RelatedLink[] = [];
  if (urlChunks.length > 0) {
    try {
      const linkEvalPrompt = urlChunks.map((u, i) =>
        `【URL${i + 1}】${u.title}\n内容: ${u.chunk.substring(0, 200)}`
      ).join('\n\n');

      const evalRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `あなたは質問とURLの関連性を判定するアシスタントです。
各URLが質問に直接関係があるかを判断し、関係あるURLのみの情報をJSONで返してください。
関係ないURLは含めないでください。`
          },
          {
            role: "user",
            content: `質問: ${question}

以下のURLから、質問に直接関係あるものだけを選んでください:

${linkEvalPrompt}

回答形式（JSON）:
{"links": [{"index": 0, "description": "25文字以内の説明"}]}

注意:
- 質問に直接関係ないURLは配列に含めない
- descriptionは「〜について」「〜の情報」などの形式で25文字以内
- 関係あるURLがなければ {"links": []} を返す`
          }
        ],
        temperature: 0.2,
        max_tokens: 200,
      });

      const evalText = evalRes.choices[0].message.content || '';
      try {
        const jsonMatch = evalText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const links = parsed.links || [];
          for (const link of links) {
            const idx = link.index;
            if (idx >= 0 && idx < urlChunks.length) {
              relatedLinks.push({
                url: urlChunks[idx].url,
                title: urlChunks[idx].title,
                description: link.description || 'ページの詳細情報'
              });
            }
          }
        }
      } catch {
        // JSONパースに失敗した場合はリンクを返さない
        console.log('[RAG] Link evaluation parse failed, returning no links');
      }
    } catch (error) {
      console.error('[RAG] Link evaluation error:', error);
    }
  }

  const contextText = (relevantChunks.length > 0 ? relevantChunks : chunks.slice(0, 5))
    .map(
      (c, i) =>
        `【情報${i + 1}】${c.title}\n${c.chunk}`
    )
    .join("\n\n");

  // 言語別システムプロンプト（より的確な回答を重視）
  const systemPrompts = {
    ja: `あなたは当社の接客担当AIです。お客様のご質問に的確に、簡潔に回答してください。

■回答のルール
1. 質問に対して直接的に答える（余計な情報は不要）
2. 150文字以内で簡潔に
3. 敬語を使いつつ自然な日本語で
4. 情報が見つかった場合は自信を持って回答
5. 質問されていないことには触れない

■禁止事項
- URLやリンクを含めること
- 「〜によると」「情報では」等のAI的表現
- 質問と関係ない補足情報
- 長すぎる回答
- 「お気軽にどうぞ」等の定型フォローは必要な場合のみ`,

    en: `You are our customer service AI. Answer customer questions accurately and concisely.

■ Response Rules
1. Answer the question directly (no unnecessary information)
2. Keep it within 150 characters
3. Professional but friendly English
4. Answer confidently when information is found
5. Don't mention things not asked about

■ Prohibited
- Including URLs or links
- AI-like phrases such as "according to"
- Unrelated supplementary information
- Overly long responses
- Generic follow-ups unless necessary

IMPORTANT: Respond ONLY in English.`,

    zh: `您是我们的客服AI。请准确、简洁地回答客户问题。

■ 回答规则
1. 直接回答问题（不需要多余信息）
2. 保持在150字以内
3. 专业但友好的中文
4. 找到信息时自信地回答
5. 不要提及未被问到的事情

■ 禁止事项
- 包含URL或链接
- "根据信息"等AI式表达
- 无关的补充信息
- 过长的回答
- 不必要的通用跟进

重要：请只用中文回复。`,
  };

  const systemPrompt = systemPrompts[language as keyof typeof systemPrompts] || systemPrompts.ja;

  // 言語別ユーザープロンプト
  const userPrompts = {
    ja: `[参考情報]
${contextText}

[質問]
${question}

上記の参考情報を元に、質問に直接答えてください。質問されたことだけに簡潔に回答してください。`,

    en: `[Reference Information]
${contextText}

[Question]
${question}

Based on the above information, answer the question directly. Only respond to what was asked, concisely.`,

    zh: `[参考信息]
${contextText}

[问题]
${question}

根据上述信息，直接回答问题。只简洁地回答被问到的内容。`,
  };

  const userPrompt = userPrompts[language as keyof typeof userPrompts] || userPrompts.ja;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 300,
  });

  const reply = completion.choices[0].message.content ?? "";
  return { reply, sourceChunks: chunks, relatedLinks };
}
