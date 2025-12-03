/**
 * STT (Speech-to-Text) / TTS (Text-to-Speech) 抽象化レイヤー
 *
 * 現在は OpenAI API を使用していますが、
 * 将来的に ElevenLabs Realtime API などに差し替え可能な設計です。
 */

import { getOpenAI } from "./openai";
import { toFile } from "openai";

// STT/TTSプロバイダーの種類
export type AudioProvider = "openai" | "elevenlabs";

// 現在のプロバイダー（環境変数で切り替え可能）
const AUDIO_PROVIDER: AudioProvider = (process.env.AUDIO_PROVIDER as AudioProvider) || "openai";

// 音声の種類（OpenAI TTSで使用）
export type VoiceId = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

// STTオプション
interface STTOptions {
  language?: string;  // 言語コード (ja, en など)
}

// TTSオプション
interface TTSOptions {
  voice?: VoiceId;           // 音声の種類
  speed?: number;            // 再生速度 (0.25〜4.0)
  responseFormat?: "mp3" | "opus" | "aac" | "flac";
}

/**
 * 音声をテキストに変換 (STT)
 * @param audioBuffer - 音声データのバッファ
 * @param filename - ファイル名 (拡張子を含む)
 * @param options - オプション設定
 * @returns 変換されたテキスト
 */
export async function transcribeAudio(
  audioBuffer: ArrayBuffer,
  filename: string,
  options: STTOptions = {}
): Promise<string> {
  if (AUDIO_PROVIDER === "openai") {
    return transcribeWithOpenAI(audioBuffer, filename, options);
  }

  // 将来的に ElevenLabs 等を追加する場合はここに分岐を追加
  // if (AUDIO_PROVIDER === "elevenlabs") {
  //   return transcribeWithElevenLabs(audioBuffer, filename, options);
  // }

  throw new Error(`Unsupported audio provider: ${AUDIO_PROVIDER}`);
}

/**
 * テキストを音声に変換 (TTS)
 * @param text - 読み上げるテキスト
 * @param options - オプション設定
 * @returns 音声データのバッファ
 */
export async function synthesizeSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<Buffer> {
  if (AUDIO_PROVIDER === "openai") {
    return synthesizeWithOpenAI(text, options);
  }

  // 将来的に ElevenLabs 等を追加する場合はここに分岐を追加
  // if (AUDIO_PROVIDER === "elevenlabs") {
  //   return synthesizeWithElevenLabs(text, options);
  // }

  throw new Error(`Unsupported audio provider: ${AUDIO_PROVIDER}`);
}

// =====================================================
// OpenAI 実装
// =====================================================

async function transcribeWithOpenAI(
  audioBuffer: ArrayBuffer,
  filename: string,
  options: STTOptions
): Promise<string> {
  const openai = getOpenAI();

  const transcription = await openai.audio.transcriptions.create({
    file: await toFile(audioBuffer, filename),
    model: "whisper-1",
    language: options.language,
  });

  return transcription.text;
}

async function synthesizeWithOpenAI(
  text: string,
  options: TTSOptions
): Promise<Buffer> {
  const openai = getOpenAI();

  const audio = await openai.audio.speech.create({
    model: "tts-1",
    voice: options.voice || "alloy",
    input: text,
    speed: options.speed || 1.0,
    response_format: options.responseFormat || "mp3",
  });

  return Buffer.from(await audio.arrayBuffer());
}

// =====================================================
// ElevenLabs 実装 (将来用プレースホルダー)
// =====================================================

// async function transcribeWithElevenLabs(
//   audioBuffer: ArrayBuffer,
//   filename: string,
//   options: STTOptions
// ): Promise<string> {
//   // ElevenLabs STT API 実装
//   throw new Error("ElevenLabs STT is not implemented yet");
// }

// async function synthesizeWithElevenLabs(
//   text: string,
//   options: TTSOptions
// ): Promise<Buffer> {
//   // ElevenLabs TTS API 実装
//   // const response = await fetch("https://api.elevenlabs.io/v1/text-to-speech/{voice_id}", {
//   //   method: "POST",
//   //   headers: {
//   //     "xi-api-key": process.env.ELEVENLABS_API_KEY!,
//   //     "Content-Type": "application/json",
//   //   },
//   //   body: JSON.stringify({
//   //     text,
//   //     model_id: "eleven_multilingual_v2",
//   //     voice_settings: {
//   //       stability: 0.5,
//   //       similarity_boost: 0.75,
//   //     },
//   //   }),
//   // });
//   // return Buffer.from(await response.arrayBuffer());
//   throw new Error("ElevenLabs TTS is not implemented yet");
// }

// =====================================================
// ユーティリティ関数
// =====================================================

/**
 * 音声ファイルのMIMEタイプを取得
 */
export function getAudioMimeType(format: string): string {
  const mimeTypes: Record<string, string> = {
    mp3: "audio/mpeg",
    opus: "audio/opus",
    aac: "audio/aac",
    flac: "audio/flac",
    wav: "audio/wav",
    webm: "audio/webm",
  };
  return mimeTypes[format] || "audio/mpeg";
}

/**
 * ファイル拡張子から音声形式を推測
 */
export function getAudioFormat(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "webm";
  return ext;
}
