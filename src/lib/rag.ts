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
          numCandidates: 100,
          limit: 5,
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
      docResults = results as SearchResult[];
    }
  } catch {
    // Vector Search failed, will use fallback
  }

  // 会社情報の質問かどうかを判定
  const companyInfoKeywordsForSearch = ['会社について', '会社を教えて', '企業情報', '会社概要', '御社について', '貴社について', 'どんな会社', 'どういう会社'];
  const isCompanyInfoQuestionForSearch = companyInfoKeywordsForSearch.some(keyword => question.includes(keyword));

  // Vector Searchが失敗またはゼロ件の場合、フォールバック
  if (docResults.length === 0) {
    const allDocs = await docsCol
      .find({ companyId })
      .project({ chunk: 1, url: 1, title: 1, embeddings: 1, _id: 0 })
      .toArray();

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
        .slice(0, 5);
    }
  }

  // 会社情報の質問の場合、会社概要チャンクを明示的に検索して追加
  if (isCompanyInfoQuestionForSearch) {
    const companyInfoDocs = await docsCol
      .find({
        companyId,
        $or: [
          { title: /会社概要/ },
          { chunk: /【会社について/ },
          { chunk: /【会社概要/ },
          { chunk: /【企業情報/ },
        ]
      })
      .project({ chunk: 1, url: 1, title: 1, embeddings: 1, _id: 0 })
      .toArray();

    if (companyInfoDocs.length > 0) {
      // 会社情報チャンクをスコア1.0で先頭に追加（重複除去）
      const existingUrls = new Set(docResults.map(r => r.chunk));
      for (const doc of companyInfoDocs) {
        if (!existingUrls.has(doc.chunk)) {
          docResults.unshift({
            chunk: doc.chunk,
            url: doc.url,
            title: doc.title,
            score: 1.0, // 最高スコアを付与
          });
        }
      }
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
  } catch {
    // Custom knowledge search error
  }

  // 結合してスコア順にソート（カスタムナレッジはスコアにボーナス付与）
  const allResults = [...docResults, ...knowledgeResults.map(k => ({
    ...k,
    score: k.score * 1.1, // カスタムナレッジを優先
  }))];

  const sorted = allResults
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

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
  ngResponses?: string;
  guardrails?: string;
};

// デフォルトのガードレール
const DEFAULT_GUARDRAILS = `# 制約条件
- わからないことは推測せず「わかりません」と正直に答える
- 個人情報や機密情報は取り扱わない
- 法的・税務・医療などの専門的助言は一般的な情報にとどめる
- 競合他社の批判や比較は行わない
- 不適切な内容や攻撃的な表現は使用しない`;

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function answerWithRAG(params: {
  companyId: string;
  question: string;
  language?: string;
  promptSettings?: PromptSettings;
  conversationHistory?: ConversationMessage[];
}) {
  const { companyId, question, language = "ja", promptSettings, conversationHistory = [] } = params;
  const chunks = await findRelevantChunks(companyId, question);
  const openai = getOpenAI();

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

  // 会社情報の質問かどうかを先に判定
  const companyInfoKeywords = ['会社について', '会社を教えて', '企業情報', '会社概要', '御社について', '貴社について', 'どんな会社', 'どういう会社'];
  const isCompanyInfoQuestion = companyInfoKeywords.some(keyword => question.includes(keyword));

  // 高スコアのチャンクのみ使用
  const relevantChunks = chunks.filter(c => {
    if (c.isCustomKnowledge) return c.score >= 0.15;
    if (isCompanyInfoQuestion) {
      const titleText = c.title || '';
      const chunkText = c.chunk || '';
      if (titleText.includes('会社概要') ||
          chunkText.includes('【会社について') ||
          chunkText.includes('【会社概要') ||
          chunkText.includes('【企業情報')) {
        return c.score >= 0.15;
      }
    }
    return c.score >= 0.3;
  });

  // URLを持つチャンクのみからリンクを抽出（カスタムナレッジは除外）
  // AI評価を省略し、高スコアのリンクを直接返す（速度優先）
  const relatedLinks: RelatedLink[] = relevantChunks
    .filter(c => c.url && !c.isCustomKnowledge && c.score >= 0.4)
    .slice(0, 2)
    .map(c => ({
      url: c.url,
      title: c.title,
      description: c.title.slice(0, 25) || 'ページの詳細情報'
    }));

  // 選択されたチャンクをさらにフィルタリング
  let filteredChunks = relevantChunks.length > 0 ? relevantChunks : chunks.slice(0, 5);

  // 「サービス」「プロダクト」「製品」などの質問では、利用規約・プライバシーポリシーを除外
  const serviceKeywords = ['サービス', 'プロダクト', '製品', '事業', 'service', 'product'];
  const isServiceQuestion = serviceKeywords.some(keyword => question.toLowerCase().includes(keyword.toLowerCase()));

  if (isServiceQuestion) {
    // 利用規約・プライバシーポリシーなどの法的文書は除外
    const legalPatterns = [
      /利用規約/,
      /ご利用規約/,
      /Terms.*Conditions/i,
      /プライバシーポリシー/,
      /Privacy.*Policy/i,
      /個人情報.*保護/,
      /個人情報.*取り扱い/,
      /個人情報.*利用/,
      /本規約/,
      /当社.*免責/,
      /第\d+条/,  // 法的条文
    ];

    filteredChunks = filteredChunks.filter(chunk => {
      const chunkText = chunk.chunk || '';
      const titleText = chunk.title || '';
      const urlText = chunk.url || '';
      if (urlText.includes('/service')) return true;
      if (legalPatterns.some(pattern => pattern.test(chunkText) || pattern.test(titleText))) return false;
      return true;
    });
  }

  // 「会社について」「企業情報」などの質問では、会社概要チャンクを優先
  if (isCompanyInfoQuestion) {
    // 会社概要チャンクを最優先にする
    const companyInfoChunks = filteredChunks.filter(chunk => {
      const titleText = chunk.title || '';
      const chunkText = chunk.chunk || '';
      return titleText.includes('会社概要') ||
             chunkText.includes('【会社について') ||
             chunkText.includes('【会社概要') ||
             chunkText.includes('【企業情報');
    });

    if (companyInfoChunks.length > 0) {
      const otherChunks = filteredChunks.filter(chunk => !companyInfoChunks.includes(chunk));
      filteredChunks = [...companyInfoChunks, ...otherChunks];
    }
  }

  // 「社長」「CEO」「代表」などの質問では、外部サイトの情報を除外
  const leadershipKeywords = ['社長', 'ceo', 'CEO', '代表', '代表取締役', '創業者', 'founder'];
  const isLeadershipQuestion = leadershipKeywords.some(keyword => question.toLowerCase().includes(keyword.toLowerCase()));

  if (isLeadershipQuestion) {
    // 外部情報（他社の社長・投資先・支援先・株主の情報など）を除外
    // これらは自社の代表者情報ではないため、代表者に関する質問では使用しない
    const externalPatterns = [
      /【.*?】/,  // 【■ ... 】のような記事見出し
      /氏が目指す/,
      /氏が語る/,
      /氏は「/,
      /支援先/,  // 支援先企業の記事
      /投資先/,  // 投資先企業の記事
      /株主/,    // 株主リスト（他社CEOが含まれる可能性）
      /ポートフォリオ/,  // 投資先一覧
      /創業者の.*氏/,  // 「創業者の◯◯氏」は他社の創業者の可能性が高い
      /スタートアップ.*創業者/,  // 他社スタートアップの創業者
      /ベンチャー.*創業者/,
      /IVS.*優勝/,  // ピッチコンテスト記事
      /ピッチ.*コンテスト/,
      /アドバンスコンポジット/,  // 具体的な他社名
    ];

    // 自社の公式代表者情報と思われるパターン
    // 注意: 「創業者」単体ではなく、会社概要ページ等の文脈で使用されている場合のみ
    const officialPatterns = [
      /当社.*代表/,
      /弊社.*代表/,
      /会社概要/,
      /Company.*Info/i,
      /About.*Us/i,
      /経営陣/,
      /役員紹介/,
      /代表取締役社長/,  // より具体的なパターン
    ];

    filteredChunks = filteredChunks.filter(chunk => {
      // カスタムナレッジはフィルタリング対象外（ユーザーが追加した信頼できる情報）
      if (chunk.isCustomKnowledge) {
        return true;
      }

      const chunkText = chunk.chunk || '';
      const titleText = chunk.title || '';
      const urlText = chunk.url || '';

      // URLが支援先/投資先記事っぽい場合は除外
      if (urlText.includes('news') && (chunkText.includes('支援先') || chunkText.includes('投資先'))) {
        return false;
      }

      // 外部パターンがあれば除外（公式パターンがあっても除外）
      if (externalPatterns.some(pattern => pattern.test(chunkText))) {
        return false;
      }

      // 公式情報パターンがあればOK
      if (officialPatterns.some(pattern => pattern.test(chunkText) || pattern.test(titleText))) {
        return true;
      }

      // 氏 + 人名パターンがあるが公式パターンがない場合は除外
      // （他社の人物の可能性が高い）
      if (/[ァ-ヶー一-龠]+\s*(氏|さん)/.test(chunkText) &&
          !officialPatterns.some(pattern => pattern.test(chunkText))) {
        return false;
      }

      return true;
    });

    // フィルタリング後、チャンクが残っていない場合
    // → 代表者情報がないと判断し、空配列のままにする（AIに「情報がない」と回答させる）
  }

  // 代表者に関する質問で、フィルタリング後にチャンクがない場合は、
  // フォールバックせずに空のままにする（外部情報を誤って使用しないため）
  const selectedChunks = isLeadershipQuestion
    ? filteredChunks
    : (filteredChunks.length > 0 ? filteredChunks : chunks.slice(0, 3));

  const contextText = selectedChunks
    .map(
      (c, i) =>
        `【情報${i + 1}】${c.title}\n${c.chunk}`
    )
    .join("\n\n");

  // プロンプト設定がある場合はカスタムプロンプトを構築
  let finalSystemPrompt: string;

  if (promptSettings && (promptSettings.systemPrompt || promptSettings.knowledge || promptSettings.style || promptSettings.ngResponses)) {
    // カスタムプロンプト設定がある場合
    const baseSystemPrompt = promptSettings.systemPrompt || 'あなたは丁寧なカスタマーサポートAIです。お客様のご質問に的確に、簡潔に回答してください。';

    const knowledgeSection = promptSettings.knowledge
      ? `\n\n# 重要な情報（必ず参照すること）\n${promptSettings.knowledge}\n\n※上記の情報（電話番号、連絡先、指示事項など）は最優先で回答に含めてください。`
      : '';

    const styleSection = promptSettings.style
      ? `\n\n# 会話スタイル\n${promptSettings.style}`
      : '';

    // NG回答セクション（絶対に回答してはいけない内容）
    const ngResponsesSection = promptSettings.ngResponses
      ? `\n\n# 【重要】NG回答（絶対に回答してはいけない内容）\n以下のトピックや質問には絶対に回答しないでください。該当する質問があった場合は「申し訳ございませんが、その件についてはお答えできません」と丁寧にお断りしてください。\n\n${promptSettings.ngResponses}`
      : '';

    const guardrailsSection = promptSettings.guardrails || DEFAULT_GUARDRAILS;

    const languageInstructions = {
      ja: '\n\n■回答のルール\n- 質問に直接的に答える\n- 上記の「重要な情報」に記載された電話番号や連絡先は必ず伝える\n- 200文字以内で簡潔に\n- 敬語を使いつつ自然な日本語で',
      en: '\n\n■ Response Rules\n- Answer the question directly\n- Always include phone numbers and contact info from "Important Information" above\n- Keep it within 200 characters\n- Professional but friendly English\n\nIMPORTANT: Respond ONLY in English.',
      zh: '\n\n■ 回答规则\n- 直接回答问题\n- 务必包含上述"重要信息"中的电话号码和联系方式\n- 保持在200字以内\n- 专业但友好的中文\n\n重要：请只用中文回复。',
    };

    finalSystemPrompt = `${baseSystemPrompt}${knowledgeSection}${styleSection}${ngResponsesSection}\n\n${guardrailsSection}${languageInstructions[language as keyof typeof languageInstructions] || languageInstructions.ja}`;
  } else {
    // デフォルトのシステムプロンプト（言語別・簡素化版）
    const systemPrompts = {
      ja: `あなたは丁寧なカスタマーサポートです。
・質問に簡潔に答える（150文字以内）
・参考情報にない内容は「把握しておりません」と答える
・架空の人名や情報は生成しない
・URLは記載しない`,

      en: `You are a polite customer support agent.
・Answer concisely (under 150 chars)
・If info not in reference, say "I don't have that information"
・Never make up names or facts
・Don't include URLs
RESPOND IN ENGLISH ONLY.`,

      zh: `您是礼貌的客服人员。
・简洁回答（150字以内）
・参考信息中没有的内容回答"我没有这方面的信息"
・不编造人名或信息
・不贴URL
请只用中文回复。`,
    };

    finalSystemPrompt = systemPrompts[language as keyof typeof systemPrompts] || systemPrompts.ja;
  }

  // knowledgeがある場合は追加コンテキストとして含める
  const knowledgeContext = promptSettings?.knowledge
    ? `\n\n[管理者からの指示・連絡先情報]\n${promptSettings.knowledge}`
    : '';

  // 言語別ユーザープロンプト
  // 参考情報がない場合の注意書きを追加
  const noInfoWarning = selectedChunks.length === 0
    ? '\n\n【重要】参考情報が見つかりませんでした。この質問に対して架空の情報を生成せず、「その情報は把握しておりません」と回答してください。'
    : '';

  const userPrompts = {
    ja: `[参考情報]
${contextText || '（該当する情報が見つかりませんでした）'}${knowledgeContext}${noInfoWarning}

[質問]
${question}

上記の参考情報と管理者からの指示を元に、質問に直接答えてください。参考情報に記載がない人名や具体的な情報は絶対に作り出さないでください。連絡先や電話番号が指定されている場合は必ず伝えてください。`,

    en: `[Reference Information]
${contextText || '(No relevant information found)'}${knowledgeContext}${noInfoWarning}

[Question]
${question}

Based on the above information and instructions, answer the question directly. NEVER fabricate names or specific information not in the reference. If contact information or phone numbers are specified, be sure to include them.`,

    zh: `[参考信息]
${contextText || '（未找到相关信息）'}${knowledgeContext}${noInfoWarning}

[问题]
${question}

根据上述信息和指示，直接回答问题。绝对不要编造参考信息中没有的人名或具体信息。如果指定了联系方式或电话号码，请务必告知。`,
  };

  const userPrompt = userPrompts[language as keyof typeof userPrompts] || userPrompts.ja;

  // ラリー数を計算（ユーザーのメッセージ数 + 現在の質問）
  const userMessageCount = conversationHistory.filter(msg => msg.role === "user").length;
  const currentRally = userMessageCount + 1; // 現在の質問を含めたラリー数

  // ラリー数に応じた営業制御指示
  const salesControlInstruction = currentRally < 3
    ? {
        ja: `\n\n【重要：営業制御】\n現在${currentRally}ラリー目です（3ラリー未満）。この段階では絶対に営業的な提案や売り込み、商品・サービスの案内はしないでください。お客様の質問に対して自然な会話で対応し、信頼関係の構築に専念してください。`,
        en: `\n\n【IMPORTANT: Sales Control】\nThis is rally ${currentRally} (less than 3). At this stage, absolutely DO NOT make any sales proposals, promotions, or product/service recommendations. Focus on natural conversation and building trust with the customer.`,
        zh: `\n\n【重要：销售控制】\n当前是第${currentRally}轮对话（少于3轮）。在此阶段，绝对不要进行任何销售提案、推销或产品/服务介绍。请专注于自然对话，与客户建立信任关系。`,
      }
    : {
        ja: `\n\n【会話状況】\n現在${currentRally}ラリー目です。お客様との信頼関係が構築されてきています。質問に答えつつ、適切であれば自然な流れで提案を行っても構いません。`,
        en: `\n\n【Conversation Status】\nThis is rally ${currentRally}. Trust has been built with the customer. While answering questions, you may naturally make suggestions if appropriate.`,
        zh: `\n\n【对话状况】\n当前是第${currentRally}轮对话。已与客户建立了一定的信任关系。在回答问题的同时，如果合适可以自然地提出建议。`,
      };

  const salesInstruction = salesControlInstruction[language as keyof typeof salesControlInstruction] || salesControlInstruction.ja;

  // メッセージ配列を構築（会話履歴を含む）
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: finalSystemPrompt + salesInstruction },
  ];

  // 会話履歴がある場合は追加（最初のユーザーメッセージには参考情報を含める）
  if (conversationHistory.length > 0) {
    // 会話の文脈を簡潔に追加
    const historyContext = conversationHistory
      .slice(-6) // 最新6件（3往復）に制限して、ラリー判定の精度を上げる
      .map((msg) => `${msg.role === "user" ? "お客様" : "担当者"}: ${msg.content}`)
      .join("\n");

    messages.push({
      role: "user",
      content: `[これまでの会話（${currentRally}ラリー目）]\n${historyContext}\n\n[参考情報]\n${contextText}${knowledgeContext}\n\n[新しい質問]\n${question}\n\n上記の会話の流れを踏まえて、自然に回答してください。`,
    });
  } else {
    // 新規会話の場合（1ラリー目）
    messages.push({ role: "user", content: userPrompt });
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.3,
    max_tokens: 200,
  });

  const reply = completion.choices[0].message.content ?? "";
  return { reply, sourceChunks: chunks, relatedLinks };
}
