import { getOpenAI } from "./openai";
import { getCollection } from "./mongodb";
import { DocChunk } from "./types";

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

  // チャンクからユニークなURL+タイトル+チャンク内容を抽出（上位3件）
  const seenUrls = new Set<string>();
  const urlChunks: { url: string; title: string; chunk: string }[] = [];
  for (const c of chunks) {
    if (c.url && !seenUrls.has(c.url)) {
      seenUrls.add(c.url);
      urlChunks.push({ url: c.url, title: c.title || c.url, chunk: c.chunk || '' });
      if (urlChunks.length >= 3) break;
    }
  }

  // AIで各URLの説明を1行に要約
  const relatedLinks: RelatedLink[] = [];
  if (urlChunks.length > 0) {
    try {
      const summaryPrompt = urlChunks.map((u, i) =>
        `【URL${i + 1}】${u.title}\n内容: ${u.chunk.substring(0, 300)}`
      ).join('\n\n');

      const summaryRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "あなたはウェブページの内容を簡潔に要約するアシスタントです。各URLについて、そのページで何ができるか・何の情報があるかを1行（25文字以内）で説明してください。番号やプレフィックスは付けず、説明文のみを返してください。JSONで返してください。"
          },
          {
            role: "user",
            content: `以下のURLの内容を1行ずつ要約してください:\n\n${summaryPrompt}\n\n回答形式（JSON配列のみ）:\n{"summaries": ["説明文1", "説明文2", "説明文3"]}\n\n注意: 各説明文は25文字以内で、「URL1:」などのプレフィックスは付けないでください。`
          }
        ],
        temperature: 0.3,
        max_tokens: 200,
      });

      const summaryText = summaryRes.choices[0].message.content || '';
      try {
        const jsonMatch = summaryText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const summaries = parsed.summaries || [];
          for (let i = 0; i < urlChunks.length; i++) {
            relatedLinks.push({
              url: urlChunks[i].url,
              title: urlChunks[i].title,
              description: summaries[i] || 'ページの詳細情報'
            });
          }
        }
      } catch {
        // JSONパースに失敗した場合はデフォルトの説明を使用
        for (const u of urlChunks) {
          relatedLinks.push({
            url: u.url,
            title: u.title,
            description: 'ページの詳細情報'
          });
        }
      }
    } catch (error) {
      console.error('[RAG] Summary generation error:', error);
      // エラー時はデフォルトの説明を使用
      for (const u of urlChunks) {
        relatedLinks.push({
          url: u.url,
          title: u.title,
          description: 'ページの詳細情報'
        });
      }
    }
  }

  const contextText = chunks
    .map(
      (c, i) =>
        `【情報${i + 1}】${c.title}\n${c.chunk}`
    )
    .join("\n\n");

  // 言語別システムプロンプト
  const systemPrompts = {
    ja: `あなたは当社のチーフスタッフオフィサー（最高総務責任者）です。
お客様からのお問い合わせに、プロフェッショナルかつ親身に対応してください。

■あなたの人物像
- 会社のことを熟知した頼れるエグゼクティブ
- 温かみがありながらも的確でスマートな対応
- お客様に寄り添い、最適な情報を提供する

■回答スタイル
- 敬語を使いつつも、堅すぎない自然な日本語で
- 「〜ですね」「〜でございます」など丁寧に
- お客様のニーズを汲み取った提案型の回答
- 300文字以内で簡潔に、要点を押さえて

■回答の流れ
1. まず結論や要点を1〜2文で
2. 補足があれば簡潔に（箇条書き可）
3. 必要に応じて「他にご質問があればお気軽にどうぞ」等のフォロー

■禁止事項
- URLやリンクを回答に含めること
- 「情報がありません」等の否定的回答
- 「提供された情報によると」等のAI的な表現
- 長すぎる回答`,

    en: `You are our Chief Staff Officer. Please respond to customer inquiries professionally and warmly.

■ Your Character
- A reliable executive who knows the company well
- Warm yet precise and smart responses
- Provide optimal information tailored to customer needs

■ Response Style
- Professional but friendly English
- Use polite expressions naturally
- Provide solution-oriented responses
- Keep responses concise, within 300 characters

■ Response Flow
1. Start with the main point in 1-2 sentences
2. Add brief supplements if needed (bullet points OK)
3. Follow up with "Feel free to ask if you have any other questions" as needed

■ Prohibited
- Including URLs or links in responses
- Negative responses like "information not found"
- AI-like expressions such as "according to the provided information"
- Overly long responses

IMPORTANT: You MUST respond ENTIRELY in English. Do not use any Japanese or other languages.`,

    zh: `您是我们的首席行政官。请专业且热情地回复客户咨询。

■ 您的人物设定
- 熟知公司的可靠高管
- 温暖而又准确、智慧的应对
- 贴近客户，提供最佳信息

■ 回答风格
- 专业但友好的中文
- 自然地使用礼貌用语
- 提供面向解决方案的回答
- 保持简洁，300字以内

■ 回答流程
1. 首先用1-2句话说明要点
2. 如有需要，简要补充（可用要点）
3. 必要时跟进"如有其他问题，请随时询问"

■ 禁止事项
- 在回答中包含URL或链接
- "未找到信息"等否定性回答
- "根据提供的信息"等AI式表达
- 过长的回答

重要：您必须完全用中文回复。不要使用日语或其他语言。`,
  };

  const systemPrompt = systemPrompts[language as keyof typeof systemPrompts] || systemPrompts.ja;

  // 言語別ユーザープロンプト
  const userPrompts = {
    ja: `[サイトから抽出した情報]
${contextText}

[お客様からの質問]
${question}

上記の情報を元に、プロの接客AIとして質問に回答してください。`,

    en: `[Information extracted from the site]
${contextText}

[Customer's question]
${question}

Based on the above information, please answer the question as a professional customer service AI. Remember to respond ONLY in English.`,

    zh: `[从网站提取的信息]
${contextText}

[客户的问题]
${question}

根据上述信息，作为专业的客户服务AI回答问题。请务必只用中文回复。`,
  };

  const userPrompt = userPrompts[language as keyof typeof userPrompts] || userPrompts.ja;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.4,
    max_tokens: 500,
  });

  const reply = completion.choices[0].message.content ?? "";
  return { reply, sourceChunks: chunks, relatedLinks };
}
