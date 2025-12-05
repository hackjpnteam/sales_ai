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

// プロンプト設定の型
export type PromptSettings = {
  systemPrompt?: string;
  knowledge?: string;
  style?: string;
  guardrails?: string;
};

// デフォルトのガードレール
const DEFAULT_GUARDRAILS = `# 制約条件
- わからないことは推測せず「わかりません」と正直に答える
- 個人情報や機密情報は取り扱わない
- 法的・税務・医療などの専門的助言は一般的な情報にとどめる
- 競合他社の批判や比較は行わない
- 不適切な内容や攻撃的な表現は使用しない`;

export async function answerWithRAG(params: {
  companyId: string;
  question: string;
  language?: string;
  promptSettings?: PromptSettings;
}) {
  const { companyId, question, language = "ja", promptSettings } = params;
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

  // プロンプト設定がある場合はカスタムプロンプトを構築
  let finalSystemPrompt: string;

  if (promptSettings && (promptSettings.systemPrompt || promptSettings.knowledge || promptSettings.style)) {
    // カスタムプロンプト設定がある場合
    const baseSystemPrompt = promptSettings.systemPrompt || 'あなたは丁寧なカスタマーサポートAIです。お客様のご質問に的確に、簡潔に回答してください。';

    const knowledgeSection = promptSettings.knowledge
      ? `\n\n# 重要な情報（必ず参照すること）\n${promptSettings.knowledge}\n\n※上記の情報（電話番号、連絡先、指示事項など）は最優先で回答に含めてください。`
      : '';

    const styleSection = promptSettings.style
      ? `\n\n# 会話スタイル\n${promptSettings.style}`
      : '';

    const guardrailsSection = promptSettings.guardrails || DEFAULT_GUARDRAILS;

    const languageInstructions = {
      ja: '\n\n■回答のルール\n- 質問に直接的に答える\n- 上記の「重要な情報」に記載された電話番号や連絡先は必ず伝える\n- 200文字以内で簡潔に\n- 敬語を使いつつ自然な日本語で',
      en: '\n\n■ Response Rules\n- Answer the question directly\n- Always include phone numbers and contact info from "Important Information" above\n- Keep it within 200 characters\n- Professional but friendly English\n\nIMPORTANT: Respond ONLY in English.',
      zh: '\n\n■ 回答规则\n- 直接回答问题\n- 务必包含上述"重要信息"中的电话号码和联系方式\n- 保持在200字以内\n- 专业但友好的中文\n\n重要：请只用中文回复。',
    };

    finalSystemPrompt = `${baseSystemPrompt}${knowledgeSection}${styleSection}\n\n${guardrailsSection}${languageInstructions[language as keyof typeof languageInstructions] || languageInstructions.ja}`;
  } else {
    // デフォルトのシステムプロンプト（言語別）
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

    finalSystemPrompt = systemPrompts[language as keyof typeof systemPrompts] || systemPrompts.ja;
  }

  // knowledgeがある場合は追加コンテキストとして含める
  const knowledgeContext = promptSettings?.knowledge
    ? `\n\n[管理者からの指示・連絡先情報]\n${promptSettings.knowledge}`
    : '';

  // 言語別ユーザープロンプト
  const userPrompts = {
    ja: `[参考情報]
${contextText}${knowledgeContext}

[質問]
${question}

上記の参考情報と管理者からの指示を元に、質問に直接答えてください。連絡先や電話番号が指定されている場合は必ず伝えてください。`,

    en: `[Reference Information]
${contextText}${knowledgeContext}

[Question]
${question}

Based on the above information and instructions, answer the question directly. If contact information or phone numbers are specified, be sure to include them.`,

    zh: `[参考信息]
${contextText}${knowledgeContext}

[问题]
${question}

根据上述信息和指示，直接回答问题。如果指定了联系方式或电话号码，请务必告知。`,
  };

  const userPrompt = userPrompts[language as keyof typeof userPrompts] || userPrompts.ja;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: finalSystemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 300,
  });

  const reply = completion.choices[0].message.content ?? "";
  return { reply, sourceChunks: chunks, relatedLinks };
}
