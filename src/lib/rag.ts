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

  console.log(`[RAG] Top scores: ${sorted.slice(0, 3).map(s => `${s.score.toFixed(3)}${s.isCustomKnowledge ? '(CK)' : ''}`).join(", ")}`);

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

  // 高スコアのチャンクのみ使用
  // カスタムナレッジは閾値を低く設定（ユーザーが追加した情報は優先的に使用）
  const relevantChunks = chunks.filter(c => {
    if (c.isCustomKnowledge) {
      console.log(`[RAG] Custom knowledge "${c.title}" score: ${c.score.toFixed(3)} (threshold: 0.15)`);
      return c.score >= 0.15; // カスタムナレッジは低い閾値
    }
    return c.score >= 0.3; // 通常のドキュメントは0.3
  });
  console.log(`[RAG] High-score chunks: ${relevantChunks.length} (threshold: 0.3 / custom: 0.15)`);

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

    const beforeCount = filteredChunks.length;
    filteredChunks = filteredChunks.filter(chunk => {
      const chunkText = chunk.chunk || '';
      const titleText = chunk.title || '';
      const urlText = chunk.url || '';

      // /service/ URLを持つチャンクは優先
      if (urlText.includes('/service')) {
        return true;
      }

      // 法的文書パターンがあれば除外
      if (legalPatterns.some(pattern => pattern.test(chunkText) || pattern.test(titleText))) {
        console.log(`[RAG] Filtering out legal document for service question: ${titleText}`);
        return false;
      }

      return true;
    });

    if (filteredChunks.length !== beforeCount) {
      console.log(`[RAG] Service question: filtered from ${beforeCount} to ${filteredChunks.length} chunks`);
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
        console.log(`[RAG] Keeping custom knowledge: ${chunk.title}`);
        return true;
      }

      const chunkText = chunk.chunk || '';
      const titleText = chunk.title || '';
      const urlText = chunk.url || '';

      // URLが支援先/投資先記事っぽい場合は除外
      if (urlText.includes('news') && (chunkText.includes('支援先') || chunkText.includes('投資先'))) {
        console.log(`[RAG] Filtering out portfolio company news: ${titleText} - ${urlText}`);
        return false;
      }

      // 外部パターンがあれば除外（公式パターンがあっても除外）
      if (externalPatterns.some(pattern => pattern.test(chunkText))) {
        console.log(`[RAG] Filtering out external content: ${titleText}`);
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
        console.log(`[RAG] Filtering out potential external person mention: ${titleText}`);
        return false;
      }

      return true;
    });

    // フィルタリング後、チャンクが残っていない場合
    // → 代表者情報がないと判断し、空配列のままにする（AIに「情報がない」と回答させる）
    if (filteredChunks.length === 0) {
      console.log(`[RAG] Leadership question: No valid chunks found after filtering. AI should respond with "information not available".`);
    }

    console.log(`[RAG] Leadership question detected, filtered to ${filteredChunks.length} chunks`);
  }

  // 代表者に関する質問で、フィルタリング後にチャンクがない場合は、
  // フォールバックせずに空のままにする（外部情報を誤って使用しないため）
  const selectedChunks = isLeadershipQuestion
    ? filteredChunks
    : (filteredChunks.length > 0 ? filteredChunks : chunks.slice(0, 3));

  // デバッグ: 取得されたチャンクの内容をログ出力
  console.log(`[RAG] Selected ${selectedChunks.length} chunks for context:`);
  selectedChunks.slice(0, 3).forEach((c, i) => {
    console.log(`[RAG] Chunk ${i + 1} (score: ${c.score.toFixed(3)}): ${c.title} - ${c.chunk.substring(0, 100)}...`);
  });

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
    // デフォルトのシステムプロンプト（言語別）
    const systemPrompts = {
      ja: `あなたは当社のカスタマーサポート担当です。お客様に寄り添い、温かみのある対応で信頼関係を築いてください。

■ペルソナ
- 経験豊富なカスタマーサポートスタッフとして振る舞う
- 親しみやすく、でもプロフェッショナルな対応
- お客様の立場に立って考える

■回答のルール
1. まずお客様の質問を理解し、的確に答える
2. 人間らしい自然な言葉遣いで（ただし丁寧語）
3. 簡潔に、でも冷たくならないように（100-200文字程度）
4. 共感を示す一言を添える（必要な場合）
5. 次のアクションがあれば自然に案内

■会話のコツ
- 「〜ですね」「〜でしょうか」など柔らかい語尾を使う
- 「かしこまりました」「承知しました」など適切な相槌
- 質問には直接答えてから補足
- 長文は避け、読みやすく

■絶対にしないこと
- URLやリンクをそのまま記載
- 「AIとして」「私はAIですので」等の発言
- 「情報によると」「データでは」等の不自然な表現
- 質問と無関係な情報の羅列
- 「何かございましたらお気軽に」の乱用
- 参考情報に記載されていない人名・役職・具体的な数字を勝手に作り出すこと

■情報がない場合の対応
- 参考情報に記載がない内容（社長名、具体的な人名、設立年など）は「申し訳ございませんが、その情報は把握しておりません。詳細は広報部（team@hackjpn.com）までお問い合わせください」と案内する
- 絶対に架空の人名や情報を生成しない`,

      en: `You are our customer support representative. Build trust with warm, caring interactions while remaining professional.

■ Persona
- Act as an experienced customer support specialist
- Friendly yet professional demeanor
- Think from the customer's perspective

■ Response Guidelines
1. Understand and directly address the customer's question
2. Use natural, human-like language (polite but not stiff)
3. Keep responses concise but warm (100-200 characters)
4. Show empathy when appropriate
5. Naturally guide to next steps when relevant

■ Conversation Tips
- Use softening phrases naturally
- Acknowledge with "Certainly" or "Of course"
- Answer directly first, then elaborate
- Keep it scannable and easy to read

■ Never Do
- Include raw URLs or links
- Say "As an AI" or similar
- Use "According to data" or unnatural phrasing
- List unrelated information
- Overuse "Let me know if you need anything else"
- Make up names, titles, or specific numbers not in the reference info

■ When Information is Missing
- If asked about something not in the reference info (CEO name, specific people, founding year), say "I don't have that information. Please contact our PR team at team@hackjpn.com for details."
- NEVER generate fictional names or information

IMPORTANT: Respond ONLY in English.`,

      zh: `您是我们的客户服务代表。以温暖、贴心的态度与客户建立信任关系。

■ 角色定位
- 作为经验丰富的客服专员
- 亲切但专业的态度
- 站在客户的角度思考

■ 回答规则
1. 理解并直接回答客户的问题
2. 使用自然、人性化的语言（礼貌但不生硬）
3. 简洁但温暖的回复（100-200字左右）
4. 适当表达同理心
5. 需要时自然地引导下一步

■ 对话技巧
- 使用柔和的语气词
- 适当使用"好的"、"当然"等回应
- 先直接回答，再补充说明
- 保持易读性

■ 绝对不做
- 直接贴出URL或链接
- 说"作为AI"或类似表达
- 使用"根据数据"等不自然的表达
- 罗列无关信息
- 滥用"如有问题请随时联系"
- 编造参考信息中没有的人名、职位或具体数字

■ 信息缺失时的处理
- 如果被问到参考信息中没有的内容（如CEO姓名、具体人员、成立年份），请回答"很抱歉，我没有这方面的信息。详情请联系我们的公关部门：team@hackjpn.com"
- 绝对不要生成虚构的姓名或信息

重要：请只用中文回复。`,
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
    temperature: 0.4, // 少し上げて自然さを向上
    max_tokens: 350,
  });

  const reply = completion.choices[0].message.content ?? "";
  return { reply, sourceChunks: chunks, relatedLinks };
}
