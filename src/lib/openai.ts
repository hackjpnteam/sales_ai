import OpenAI from "openai";

export function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  console.log("[OpenAI] API Key first 20 chars:", apiKey?.substring(0, 20));
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  return new OpenAI({
    apiKey,
  });
}

// テキストの埋め込みベクトルを生成
export async function createEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAI();
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}
