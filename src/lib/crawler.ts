import * as cheerio from "cheerio";
import { getOpenAI } from "./openai";
import { getCollection } from "./mongodb";
import { DocChunk } from "./types";

const MAX_PAGES = 30;
const CHUNK_SIZE = 600; // 500〜800文字程度でチャンク分割

// 進捗イベントの型
export interface CrawlProgress {
  type: "discovering" | "crawling" | "embedding" | "saving";
  currentUrl?: string;
  currentPage: number;
  totalPages: number;
  percent: number;
  chunksFound?: number;
  message: string;
}

// 構造化セクションの型
interface StructuredSection {
  sectionTitle: string;  // h1/h2/h3のテキスト
  content: string[];     // 本文（p, li, リンク情報など）
  links: string[];       // 「リンク: ラベル → URL」形式
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent": "hackjpn-ai-crawler/1.0",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// 構造化コンテンツ抽出（仕様準拠: h1/h2/h3ごとにセクション分割）
function extractStructuredContent(html: string, baseUrl: string): StructuredSection[] {
  const $ = cheerio.load(html);
  const sections: StructuredSection[] = [];
  const base = new URL(baseUrl);

  // ノイズ要素を削除
  $("script, style, nav, header, footer, aside, noscript, iframe, form").remove();

  // 全てのh1, h2, h3要素を取得
  const headings = $("h1, h2, h3").toArray();

  headings.forEach((el, index) => {
    const $heading = $(el);
    const sectionTitle = $heading.text().trim();

    if (!sectionTitle || sectionTitle.length < 2) return;

    const section: StructuredSection = {
      sectionTitle,
      content: [],
      links: [],
    };

    // 次の見出しまでの要素を収集
    let current = $heading.next();
    const nextHeadingIndex = index + 1;
    const nextHeading = headings[nextHeadingIndex] ? $(headings[nextHeadingIndex]) : null;

    while (current.length) {
      // 次の見出しに到達したら終了
      if (current.is("h1, h2, h3")) break;
      if (nextHeading && current.is(nextHeading)) break;

      // pタグの処理
      if (current.is("p")) {
        const text = current.text().trim();
        if (text.length > 5) {
          section.content.push(text);
        }
        // p内のリンクを抽出
        current.find("a[href]").each((_, a) => {
          const href = $(a).attr("href");
          const linkText = $(a).text().trim();
          if (href && linkText && linkText.length > 1) {
            try {
              const fullUrl = new URL(href, base.origin).toString();
              if (!fullUrl.match(/\.(jpg|jpeg|png|gif|svg|css|js|pdf)$/i)) {
                section.links.push(`リンク: ${linkText} → ${fullUrl}`);
              }
            } catch { /* 無効なURL */ }
          }
        });
      }

      // ul/olリストの処理
      if (current.is("ul, ol")) {
        current.find("li").each((_, li) => {
          const text = $(li).text().trim();
          if (text.length > 3) {
            section.content.push(`・${text}`);
          }
          // li内のリンクを抽出
          $(li).find("a[href]").each((_, a) => {
            const href = $(a).attr("href");
            const linkText = $(a).text().trim();
            if (href && linkText && linkText.length > 1) {
              try {
                const fullUrl = new URL(href, base.origin).toString();
                if (!fullUrl.match(/\.(jpg|jpeg|png|gif|svg|css|js|pdf)$/i)) {
                  section.links.push(`リンク: ${linkText} → ${fullUrl}`);
                }
              } catch { /* 無効なURL */ }
            }
          });
        });
      }

      // div/section/article内のコンテンツ
      if (current.is("div, section, article")) {
        // 内部のp, liを取得
        current.find("p, li").each((_, inner) => {
          const text = $(inner).text().trim();
          if (text.length > 10 && !section.content.includes(text)) {
            section.content.push(text);
          }
        });
        // div内のリンクを抽出
        current.find("a[href]").each((_, a) => {
          const href = $(a).attr("href");
          const linkText = $(a).text().trim();
          if (href && linkText && linkText.length > 1) {
            try {
              const fullUrl = new URL(href, base.origin).toString();
              if (!fullUrl.match(/\.(jpg|jpeg|png|gif|svg|css|js|pdf)$/i)) {
                const linkEntry = `リンク: ${linkText} → ${fullUrl}`;
                if (!section.links.includes(linkEntry)) {
                  section.links.push(linkEntry);
                }
              }
            } catch { /* 無効なURL */ }
          }
        });
      }

      current = current.next();
    }

    // コンテンツがあるセクションのみ追加
    if (section.content.length > 0 || section.links.length > 0) {
      sections.push(section);
    }
  });

  return sections;
}

// ページメタ情報を抽出
function extractPageMeta(html: string, url: string) {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim();
  const description = $('meta[name="description"]').attr("content")?.trim() || "";
  const ogTitle = $('meta[property="og:title"]').attr("content")?.trim() || "";
  const ogDescription = $('meta[property="og:description"]').attr("content")?.trim() || "";

  return {
    title: title || ogTitle || url,
    description: description || ogDescription,
  };
}

// テキストをチャンク分割（500〜800文字程度）
function splitIntoChunks(text: string, maxSize: number = CHUNK_SIZE): string[] {
  if (text.length <= maxSize) return [text];

  const chunks: string[] = [];
  const sentences = text.split(/(?<=[。．！!？?\n])/);
  let current = "";

  for (const sentence of sentences) {
    if ((current + sentence).length > maxSize && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }

  return chunks;
}

// 同一ドメインのリンクを抽出
function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  const origin = base.origin;
  const links = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const urlObj = new URL(href, origin);
      if (urlObj.origin === origin && !urlObj.hash) {
        const path = urlObj.pathname.toLowerCase();
        if (!path.match(/\.(jpg|jpeg|png|gif|svg|css|js|pdf|zip|mp4|mp3)$/)) {
          links.add(urlObj.toString());
        }
      }
    } catch { /* 無効なURL */ }
  });

  return Array.from(links);
}

// URLからページ名を抽出（進捗表示用）
function getPageName(url: string): string {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    if (path === "/" || path === "") return "トップページ";
    const parts = path.split("/").filter(Boolean);
    return parts[parts.length - 1] || "ページ";
  } catch {
    return "ページ";
  }
}

// 進捗コールバック付きクロール
export async function crawlAndEmbedSiteWithProgress(
  params: {
    companyId: string;
    agentId: string;
    rootUrl: string;
  },
  onProgress: (progress: CrawlProgress) => void
) {
  const { companyId, agentId, rootUrl } = params;
  const visited = new Set<string>();
  const queue: string[] = [rootUrl];

  const docsCol = await getCollection<DocChunk>("documents");
  const openai = getOpenAI();

  let totalChunks = 0;

  // 開始通知
  onProgress({
    type: "discovering",
    currentPage: 0,
    totalPages: MAX_PAGES,
    percent: 0,
    message: "サイトの解析を開始しています...",
  });

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    const currentPage = visited.size;
    const percent = Math.round((currentPage / MAX_PAGES) * 100);
    const pageName = getPageName(url);

    // クロール進捗通知
    onProgress({
      type: "crawling",
      currentUrl: url,
      currentPage,
      totalPages: MAX_PAGES,
      percent,
      message: `📄 ${pageName} を解析中...`,
    });

    const html = await fetchHtml(url);
    if (!html) continue;

    const pageMeta = extractPageMeta(html, url);
    const sections = extractStructuredContent(html, url);

    // セクションごとにチャンクを生成
    const docsToInsert: Omit<DocChunk, "_id">[] = [];

    for (const section of sections) {
      // セクションの全文を構築
      const sectionText = [
        `【${section.sectionTitle}】`,
        ...section.content,
        ...section.links,
      ].join("\n");

      // チャンク分割
      const chunks = splitIntoChunks(sectionText);

      for (const chunk of chunks) {
        if (chunk.length < 20) continue;
        docsToInsert.push({
          companyId,
          agentId,
          url,
          title: pageMeta.title,
          sectionTitle: section.sectionTitle,
          chunk,
          embeddings: [], // 後で設定
          createdAt: new Date(),
        });
      }
    }

    // セクションが少ない場合はページ全体からフォールバック抽出
    if (docsToInsert.length < 2) {
      const $ = cheerio.load(html);
      $("script, style, nav, header, footer, aside, noscript").remove();
      const fullText = $("main, article, .content, #content, body")
        .first()
        .text()
        .replace(/\s+/g, " ")
        .trim();

      if (fullText.length > 100) {
        const chunks = splitIntoChunks(fullText, 800);
        for (let i = 0; i < chunks.length; i++) {
          docsToInsert.push({
            companyId,
            agentId,
            url,
            title: pageMeta.title,
            sectionTitle: `ページ内容 (パート${i + 1})`,
            chunk: chunks[i],
            embeddings: [],
            createdAt: new Date(),
          });
        }
      }
    }

    // ページ概要(description)も追加
    if (pageMeta.description && pageMeta.description.length > 20) {
      docsToInsert.push({
        companyId,
        agentId,
        url,
        title: pageMeta.title,
        sectionTitle: "ページ概要",
        chunk: `【ページ概要】${pageMeta.description}`,
        embeddings: [],
        createdAt: new Date(),
      });
    }

    if (docsToInsert.length === 0) continue;

    // Embedding生成の進捗通知
    onProgress({
      type: "embedding",
      currentUrl: url,
      currentPage,
      totalPages: MAX_PAGES,
      percent,
      chunksFound: docsToInsert.length,
      message: `🧠 ${pageName} の内容をAI学習用に変換中... (${docsToInsert.length}件)`,
    });

    try {
      // Embeddingを生成
      const textsToEmbed = docsToInsert.map((d) => d.chunk);
      const embRes = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: textsToEmbed,
      });

      // Embeddingを設定
      for (let i = 0; i < docsToInsert.length; i++) {
        docsToInsert[i].embeddings = embRes.data[i].embedding;
      }

      // 保存の進捗通知
      onProgress({
        type: "saving",
        currentUrl: url,
        currentPage,
        totalPages: MAX_PAGES,
        percent,
        chunksFound: docsToInsert.length,
        message: `💾 ${pageName} のデータを保存中...`,
      });

      // MongoDBに保存
      await docsCol.insertMany(docsToInsert as DocChunk[]);
      totalChunks += docsToInsert.length;

    } catch (error) {
      console.error(`[Crawler] Error processing ${url}:`, error);
    }

    // 同一ドメインのリンクをキューに追加
    const links = extractLinks(html, url);
    for (const link of links) {
      if (!visited.has(link) && queue.length + visited.size < MAX_PAGES) {
        queue.push(link);
      }
    }
  }

  // 完了通知
  onProgress({
    type: "saving",
    currentPage: visited.size,
    totalPages: visited.size,
    percent: 100,
    chunksFound: totalChunks,
    message: `✅ 完了！ ${visited.size}ページから${totalChunks}件の情報を学習しました`,
  });
}

// 後方互換性のための従来関数
export async function crawlAndEmbedSite(params: {
  companyId: string;
  agentId: string;
  rootUrl: string;
}) {
  await crawlAndEmbedSiteWithProgress(params, () => {});
}
