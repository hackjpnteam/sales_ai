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
