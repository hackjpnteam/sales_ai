import * as cheerio from "cheerio";
import { getOpenAI } from "./openai";
import { getCollection } from "./mongodb";
import { DocChunk } from "./types";
import puppeteerCore from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const MAX_PAGES = 15; // 重要ページを確実に取得するため
const CHUNK_SIZE = 600; // 500〜800文字程度でチャンク分割
const PARALLEL_LIMIT = 5; // 並列クロール数
const FETCH_TIMEOUT = 5000; // 5秒タイムアウト
const MIN_CHUNKS_FOR_EARLY_EXIT = 50; // 十分なコンテンツを確保
const PUPPETEER_TIMEOUT = 15000; // Puppeteer用の長めのタイムアウト

// 優先的にクロールすべき重要ページのパターン
const PRIORITY_PATHS = [
  '/company', '/about', '/corporate', '/profile',  // 会社概要
  '/contact', '/inquiry',  // お問い合わせ
  '/service', '/services', '/business',  // サービス
  '/news', '/topics',  // ニュース
  '/recruit', '/careers', '/jobs',  // 採用
];

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

// クロール結果の型
export interface CrawlResult {
  success: boolean;
  pagesVisited: number;
  totalChunks: number;
  themeColor: string;
  error?: string;
}

// URLを正規化・検証する関数
export function validateAndNormalizeUrl(input: string): { valid: boolean; url: string; error?: string } {
  let urlString = input.trim();

  // 空白チェック
  if (!urlString) {
    return { valid: false, url: "", error: "URLが入力されていません" };
  }

  // プロトコルがなければ追加
  if (!urlString.startsWith("http://") && !urlString.startsWith("https://")) {
    urlString = "https://" + urlString;
  }

  try {
    const urlObj = new URL(urlString);

    // ホスト名の検証
    const hostname = urlObj.hostname;

    // ホスト名が空またはローカルホスト
    if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") {
      return { valid: false, url: "", error: "有効なドメインを入力してください" };
    }

    // ホスト名に少なくとも1つのドットが必要（TLD）
    if (!hostname.includes(".")) {
      return { valid: false, url: "", error: "有効なドメイン名を入力してください（例: example.com）" };
    }

    // ホスト名が数字だけの場合は無効
    const parts = hostname.split(".");
    const allNumeric = parts.every(part => /^\d+$/.test(part));
    if (allNumeric && parts.length === 4) {
      // IPアドレスは許可しない（プライベートIP含む可能性）
      return { valid: false, url: "", error: "ドメイン名を入力してください（IPアドレスは使用できません）" };
    }

    // ランダム文字列チェック（TLDが存在しなさそうな場合）
    const tld = parts[parts.length - 1].toLowerCase();
    const validTlds = ["com", "net", "org", "io", "co", "jp", "dev", "app", "ai", "me", "info", "biz", "edu", "gov", "xyz", "tech", "site", "online", "store", "blog", "cloud"];
    const looksLikeTld = tld.length >= 2 && tld.length <= 6 && /^[a-z]+$/.test(tld);

    if (!validTlds.includes(tld) && !looksLikeTld) {
      return { valid: false, url: "", error: "有効なドメインを入力してください" };
    }

    return { valid: true, url: urlObj.toString() };
  } catch {
    return { valid: false, url: "", error: "無効なURL形式です" };
  }
}

// サイトのテーマカラーを抽出する関数
export function extractThemeColor(html: string): string {
  const $ = cheerio.load(html);
  const colorCounts = new Map<string, number>();

  // 1. meta theme-colorを確認
  const themeColorMeta = $('meta[name="theme-color"]').attr("content");
  if (themeColorMeta && isValidColor(themeColorMeta)) {
    return normalizeColor(themeColorMeta);
  }

  // 2. OGP関連のカラーを確認
  const msAppColor = $('meta[name="msapplication-TileColor"]').attr("content");
  if (msAppColor && isValidColor(msAppColor)) {
    return normalizeColor(msAppColor);
  }

  // 3. <style>タグ内のCSSから色を抽出（優先度高）
  $("style").each((_, el) => {
    const cssText = $(el).html() || "";
    // 鮮やかな色を優先的に抽出（彩度の高い色）
    const hexColors = cssText.match(/#[0-9a-fA-F]{6}/g) || [];
    hexColors.forEach((color) => {
      const normalized = normalizeColor(color);
      if (normalized && !isGrayOrWhiteOrBlack(normalized) && isVibrantColor(normalized)) {
        colorCounts.set(normalized, (colorCounts.get(normalized) || 0) + 3);
      }
    });
  });

  // 4. インラインスタイルから主要な色を抽出
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") || "";
    const colorMatches = style.match(/(?:background-color|background|color)\s*:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]+\))/gi);
    if (colorMatches) {
      colorMatches.forEach((match) => {
        const colorValue = match.split(":")[1].trim();
        const normalized = normalizeColor(colorValue);
        if (normalized && !isGrayOrWhiteOrBlack(normalized)) {
          colorCounts.set(normalized, (colorCounts.get(normalized) || 0) + 1);
        }
      });
    }
  });

  // 5. CSSクラスから推測（よくあるプライマリーカラー系クラス）
  const primaryElements = $(".primary, .brand, .accent, [class*='primary'], [class*='brand'], header, nav");
  primaryElements.each((_, el) => {
    const style = $(el).attr("style") || "";
    const bgMatch = style.match(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]+\))/i);
    if (bgMatch) {
      const normalized = normalizeColor(bgMatch[1]);
      if (normalized && !isGrayOrWhiteOrBlack(normalized)) {
        colorCounts.set(normalized, (colorCounts.get(normalized) || 0) + 5);
      }
    }
  });

  // 6. リンクの色を確認
  $("a").slice(0, 10).each((_, el) => {
    const style = $(el).attr("style") || "";
    const colorMatch = style.match(/color\s*:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]+\))/i);
    if (colorMatch) {
      const normalized = normalizeColor(colorMatch[1]);
      if (normalized && !isGrayOrWhiteOrBlack(normalized)) {
        colorCounts.set(normalized, (colorCounts.get(normalized) || 0) + 2);
      }
    }
  });

  // 7. ボタンの背景色を確認
  $("button, .btn, [class*='button'], input[type='submit']").each((_, el) => {
    const style = $(el).attr("style") || "";
    const bgMatch = style.match(/background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]+\))/i);
    if (bgMatch) {
      const normalized = normalizeColor(bgMatch[1]);
      if (normalized && !isGrayOrWhiteOrBlack(normalized)) {
        colorCounts.set(normalized, (colorCounts.get(normalized) || 0) + 3);
      }
    }
  });

  // 8. HTML全体から鮮やかな色を探す（最後の手段）
  if (colorCounts.size === 0) {
    const allHexColors = html.match(/#[0-9a-fA-F]{6}/g) || [];
    const vibrantColors: string[] = [];
    allHexColors.forEach((color) => {
      const normalized = normalizeColor(color);
      if (normalized && !isGrayOrWhiteOrBlack(normalized) && isVibrantColor(normalized)) {
        vibrantColors.push(normalized);
      }
    });
    // 最初に見つかった鮮やかな色を使用
    if (vibrantColors.length > 0) {
      return vibrantColors[0];
    }
  }

  // 最も頻度の高い色を選択
  if (colorCounts.size > 0) {
    const sorted = Array.from(colorCounts.entries()).sort((a, b) => b[1] - a[1]);
    return sorted[0][0];
  }

  // デフォルトカラー（ブルー）
  return "#2563eb";
}

// 鮮やかな色かどうかを判定（彩度が高い色）
function isVibrantColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  // 彩度が低い色は除外
  if (diff < 50) return false;

  // 明るすぎる色は除外
  if (r > 230 && g > 230 && b > 230) return false;

  // 暗すぎる色は除外
  if (r < 30 && g < 30 && b < 30) return false;

  return true;
}

// 色が有効かどうかを確認
function isValidColor(color: string): boolean {
  const hexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  const rgbRegex = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/;
  return hexRegex.test(color.trim()) || rgbRegex.test(color.trim());
}

// 色を正規化（hex形式に統一）
function normalizeColor(color: string): string {
  const trimmed = color.trim().toLowerCase();

  // 既にhex形式
  if (trimmed.startsWith("#")) {
    // 3桁を6桁に変換
    if (trimmed.length === 4) {
      return "#" + trimmed[1] + trimmed[1] + trimmed[2] + trimmed[2] + trimmed[3] + trimmed[3];
    }
    return trimmed;
  }

  // rgb形式をhexに変換
  const rgbMatch = trimmed.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  return "";
}

// グレー、白、黒は除外
function isGrayOrWhiteOrBlack(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  // 白に近い
  if (r > 240 && g > 240 && b > 240) return true;
  // 黒に近い
  if (r < 20 && g < 20 && b < 20) return true;
  // グレー（R, G, Bの差が小さい）
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 20 && r > 50 && r < 200) return true;

  return false;
}

// 構造化セクションの型
interface StructuredSection {
  sectionTitle: string;  // h1/h2/h3のテキスト
  content: string[];     // 本文（p, li, リンク情報など）
  links: string[];       // 「リンク: ラベル → URL」形式
}

// SPAフレームワークを検出する関数
function isSPAHtml(html: string): boolean {
  // SPAの特徴的なパターンを検出
  const spaPatterns = [
    /<div\s+id=["']root["']\s*><\/div>/i,           // React
    /<div\s+id=["']app["']\s*><\/div>/i,            // Vue
    /<div\s+id=["']__next["']\s*><\/div>/i,         // Next.js
    /<app-root[^>]*><\/app-root>/i,                 // Angular
    /type=["']module["'][^>]*src=["'][^"']*\.(js|mjs)["']/i, // ES modules
  ];

  // HTMLの本文が非常に短い場合もSPAの可能性が高い
  const $ = cheerio.load(html);
  $("script, style, link, meta, head").remove();
  const bodyText = $("body").text().trim();

  // 本文が100文字未満でSPAパターンがある場合
  if (bodyText.length < 100) {
    for (const pattern of spaPatterns) {
      if (pattern.test(html)) {
        return true;
      }
    }
  }

  return false;
}

// Puppeteerブラウザインスタンス（再利用）
let browserInstance: Awaited<ReturnType<typeof puppeteerCore.launch>> | null = null;

// SPAナビゲーション要素を検出するセレクタ（a要素とbutton要素の両方）
const NAV_SELECTORS = [
  "nav a",
  "nav button",
  "header a",
  "header button",
  "[role='navigation'] a",
  "[role='navigation'] button",
  ".nav a",
  ".nav button",
  ".menu a",
  ".menu button",
  ".navbar a",
  ".navbar button",
];

// クリックすべきでないリンクのパターン
const SKIP_LINK_PATTERNS = [
  /^#$/,
  /^javascript:/i,
  /^mailto:/i,
  /^tel:/i,
  /logout/i,
  /signout/i,
  /login/i,
  /signin/i,
  /register/i,
  /signup/i,
];

// SPAサイトの全ビューを取得する関数
async function fetchAllSPAViews(url: string): Promise<string[]> {
  let browser = browserInstance;
  let page = null;
  const htmlContents: string[] = [];

  try {
    // ブラウザがなければ起動
    if (!browser) {
      const executablePath = await chromium.executablePath();

      browser = await puppeteerCore.launch({
        args: chromium.args,
        defaultViewport: { width: 1280, height: 720 },
        executablePath,
        headless: true,
      });
      browserInstance = browser;
    }

    page = await browser.newPage();

    // ユーザーエージェントを設定
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    // ページにアクセス
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: PUPPETEER_TIMEOUT,
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // 初期ページのHTMLを取得
    const initialHtml = await page.content();
    htmlContents.push(initialHtml);
    console.log("[Crawler] SPA: Initial page captured");

    // ナビゲーションリンクを取得
    const navLinks = await page.evaluate((selectors: string[], skipPatterns: string[]) => {
      const links: { text: string; index: number }[] = [];
      const seen = new Set<string>();

      for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((el, idx) => {
          const anchor = el as HTMLAnchorElement;
          const text = anchor.innerText.trim();
          const href = anchor.getAttribute("href") || "";

          // スキップすべきリンクをフィルタ
          const shouldSkip = skipPatterns.some(pattern => new RegExp(pattern).test(href));
          if (shouldSkip) return;

          // 重複チェック
          if (text && text.length > 0 && text.length < 50 && !seen.has(text)) {
            seen.add(text);
            links.push({ text, index: idx });
          }
        });
      }

      return links;
    }, NAV_SELECTORS, SKIP_LINK_PATTERNS.map(r => r.source));

    console.log(`[Crawler] SPA: Found ${navLinks.length} navigation links:`, navLinks.map(l => l.text));

    // 各ナビゲーションをクリックしてコンテンツを取得
    for (const link of navLinks) {
      try {
        // ナビゲーションリンクをクリック
        const clicked = await page.evaluate((linkText: string, selectors: string[]) => {
          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              if (el.textContent?.trim() === linkText) {
                (el as HTMLElement).click();
                return true;
              }
            }
          }
          return false;
        }, link.text, NAV_SELECTORS);

        if (clicked) {
          // コンテンツの読み込みを待つ
          await new Promise(resolve => setTimeout(resolve, 1500));

          // 現在のHTMLを取得
          const currentHtml = await page.content();

          // 重複チェック（コンテンツが異なる場合のみ追加）
          const isDuplicate = htmlContents.some(html => {
            // body部分のテキストで比較
            const existingText = html.replace(/<[^>]*>/g, "").substring(0, 1000);
            const currentText = currentHtml.replace(/<[^>]*>/g, "").substring(0, 1000);
            return existingText === currentText;
          });

          if (!isDuplicate) {
            htmlContents.push(currentHtml);
            console.log(`[Crawler] SPA: Captured view for "${link.text}"`);
          }
        }
      } catch (e) {
        console.log(`[Crawler] SPA: Failed to click "${link.text}":`, e);
      }
    }

    console.log(`[Crawler] SPA: Total ${htmlContents.length} unique views captured`);
    return htmlContents;

  } catch (error) {
    console.error("[Crawler] Puppeteer SPA error:", error);
    return htmlContents;
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {
        // ページクローズエラーは無視
      }
    }
  }
}

// Puppeteerでページを取得する関数（単一ページ）
async function fetchHtmlWithPuppeteer(url: string): Promise<string | null> {
  let browser = browserInstance;
  let page = null;

  try {
    // ブラウザがなければ起動
    if (!browser) {
      const executablePath = await chromium.executablePath();

      browser = await puppeteerCore.launch({
        args: chromium.args,
        defaultViewport: { width: 1280, height: 720 },
        executablePath,
        headless: true,
      });
      browserInstance = browser;
    }

    page = await browser.newPage();

    // ユーザーエージェントを設定
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");

    // ページにアクセス
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: PUPPETEER_TIMEOUT,
    });

    // JavaScriptの実行完了を待つ
    await page.waitForFunction(() => {
      return document.readyState === "complete";
    }, { timeout: 5000 }).catch(() => {
      // タイムアウトは無視
    });

    // 少し待ってからHTMLを取得
    await new Promise(resolve => setTimeout(resolve, 1000));

    const html = await page.content();
    return html;
  } catch (error) {
    console.error("[Crawler] Puppeteer error:", error);
    return null;
  } finally {
    if (page) {
      try {
        await page.close();
      } catch {
        // ページクローズエラーは無視
      }
    }
  }
}

// ブラウザを閉じる関数（クロール終了時に呼び出し）
async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {
      // エラーは無視
    }
    browserInstance = null;
  }
}

// 通常のfetchでHTMLを取得
async function fetchHtmlSimple(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// HTMLを取得する統合関数（SPA検出付き）
async function fetchHtml(url: string, usePuppeteer: boolean = false): Promise<string | null> {
  // Puppeteerモードが指定されている場合
  if (usePuppeteer) {
    console.log(`[Crawler] Using Puppeteer for: ${url}`);
    return await fetchHtmlWithPuppeteer(url);
  }

  // まず通常のfetchを試す
  const html = await fetchHtmlSimple(url);
  if (!html) return null;

  // SPAかどうかを検出
  if (isSPAHtml(html)) {
    console.log(`[Crawler] SPA detected, retrying with Puppeteer: ${url}`);
    return await fetchHtmlWithPuppeteer(url);
  }

  return html;
}

// SPA用：全ビューのHTMLを取得
async function fetchHtmlForSPA(url: string): Promise<string[] | null> {
  // まず通常のfetchを試す
  const html = await fetchHtmlSimple(url);
  if (!html) return null;

  // SPAかどうかを検出
  if (isSPAHtml(html)) {
    console.log(`[Crawler] SPA detected, fetching all views: ${url}`);
    const views = await fetchAllSPAViews(url);
    return views.length > 0 ? views : null;
  }

  // 通常のサイトは単一のHTMLを返す
  return [html];
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

// URLが重要ページかどうかを判定
function isPriorityUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase();
    return PRIORITY_PATHS.some(p => path.includes(p));
  } catch {
    return false;
  }
}

// リンクを優先度でソート（重要ページを前に）
function sortLinksByPriority(links: string[]): string[] {
  return links.sort((a, b) => {
    const aPriority = isPriorityUrl(a) ? 0 : 1;
    const bPriority = isPriorityUrl(b) ? 0 : 1;
    return aPriority - bPriority;
  });
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

// 単一ページの処理結果
interface PageProcessResult {
  url: string;
  docs: Omit<DocChunk, "_id">[];
  links: string[];
  html: string | null;
}

// 単一ページを処理する関数
async function processPage(
  url: string,
  companyId: string,
  agentId: string
): Promise<PageProcessResult> {
  const html = await fetchHtml(url);
  if (!html) {
    return { url, docs: [], links: [], html: null };
  }

  const pageMeta = extractPageMeta(html, url);
  const sections = extractStructuredContent(html, url);
  const docsToInsert: Omit<DocChunk, "_id">[] = [];

  for (const section of sections) {
    const sectionText = [
      `【${section.sectionTitle}】`,
      ...section.content,
      ...section.links,
    ].join("\n");

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
        embeddings: [],
        createdAt: new Date(),
      });
    }
  }

  // セクションが少ない場合はフォールバック抽出
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

  // ページ概要も追加
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

  const links = extractLinks(html, url);
  return { url, docs: docsToInsert, links, html };
}

// 複数のHTMLからドキュメントを生成する関数
function processMultipleHtmls(
  htmls: string[],
  url: string,
  companyId: string,
  agentId: string
): { docs: Omit<DocChunk, "_id">[]; themeColor: string } {
  const docsToInsert: Omit<DocChunk, "_id">[] = [];
  let themeColor = "#2563eb";
  let themeColorExtracted = false;

  for (const html of htmls) {
    // テーマカラー抽出（最初の成功したページから）
    if (!themeColorExtracted) {
      themeColor = extractThemeColor(html);
      themeColorExtracted = true;
    }

    const pageMeta = extractPageMeta(html, url);
    const sections = extractStructuredContent(html, url);

    for (const section of sections) {
      const sectionText = [
        `【${section.sectionTitle}】`,
        ...section.content,
        ...section.links,
      ].join("\n");

      const chunks = splitIntoChunks(sectionText);

      for (const chunk of chunks) {
        if (chunk.length < 20) continue;
        // 重複チェック
        const isDuplicate = docsToInsert.some(d => d.chunk === chunk);
        if (!isDuplicate) {
          docsToInsert.push({
            companyId,
            agentId,
            url,
            title: pageMeta.title,
            sectionTitle: section.sectionTitle,
            chunk,
            embeddings: [],
            createdAt: new Date(),
          });
        }
      }
    }

    // フォールバック抽出
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
          const isDuplicate = docsToInsert.some(d => d.chunk === chunks[i]);
          if (!isDuplicate) {
            docsToInsert.push({
              companyId,
              agentId,
              url,
              title: "ページコンテンツ",
              sectionTitle: `ページ内容 (パート${i + 1})`,
              chunk: chunks[i],
              embeddings: [],
              createdAt: new Date(),
            });
          }
        }
      }
    }
  }

  return { docs: docsToInsert, themeColor };
}

// 進捗コールバック付きクロール（並列処理版）
export async function crawlAndEmbedSiteWithProgress(
  params: {
    companyId: string;
    agentId: string;
    rootUrl: string;
  },
  onProgress: (progress: CrawlProgress) => void
): Promise<CrawlResult> {
  const { companyId, agentId, rootUrl } = params;
  const visited = new Set<string>();
  const queue: string[] = [rootUrl];

  const docsCol = await getCollection<DocChunk>("documents");
  const openai = getOpenAI();

  let totalChunks = 0;
  let themeColor = "#2563eb";
  let themeColorExtracted = false;

  // 開始通知
  onProgress({
    type: "discovering",
    currentPage: 0,
    totalPages: MAX_PAGES,
    percent: 0,
    message: "サイトの解析を開始しています...",
  });

  // まずルートURLをチェックしてSPAかどうか判定
  const initialHtml = await fetchHtmlSimple(rootUrl);
  const isSPA = initialHtml ? isSPAHtml(initialHtml) : false;

  // SPAサイトの場合は特別な処理（ただしリンク抽出して通常クロールも継続）
  if (isSPA) {
    console.log("[Crawler] SPA site detected, using navigation-based crawling + link extraction");
    onProgress({
      type: "crawling",
      currentPage: 1,
      totalPages: MAX_PAGES,
      percent: 10,
      message: "🔄 SPAサイトを検出しました。全ページを取得中...",
    });

    // SPAの全ビューを取得
    const spaViews = await fetchAllSPAViews(rootUrl);

    if (spaViews && spaViews.length > 0) {
      onProgress({
        type: "embedding",
        currentPage: 1,
        totalPages: MAX_PAGES,
        percent: 20,
        message: `🧠 ${spaViews.length}ビューからコンテンツを抽出中...`,
      });

      // 全ビューからドキュメントを生成
      const { docs: allDocs, themeColor: extractedColor } = processMultipleHtmls(
        spaViews,
        rootUrl,
        companyId,
        agentId
      );
      themeColor = extractedColor;
      themeColorExtracted = true;

      // 全ビューからリンクを抽出してキューに追加（重要！）
      for (const html of spaViews) {
        const links = extractLinks(html, rootUrl);
        const sortedLinks = sortLinksByPriority(links);
        for (const link of sortedLinks) {
          if (!visited.has(link) && !queue.includes(link)) {
            if (isPriorityUrl(link)) {
              queue.unshift(link);
            } else {
              queue.push(link);
            }
          }
        }
      }
      console.log(`[Crawler] SPA: Extracted ${queue.length} links from SPA views for further crawling`);

      if (allDocs.length > 0) {
        onProgress({
          type: "embedding",
          currentPage: 1,
          totalPages: MAX_PAGES,
          percent: 30,
          chunksFound: allDocs.length,
          message: `🧠 ${allDocs.length}件のコンテンツをAI学習用に変換中...`,
        });

        try {
          // Embeddingをバッチ生成
          const textsToEmbed = allDocs.map((d) => d.chunk);
          const embRes = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: textsToEmbed,
          });

          for (let i = 0; i < allDocs.length; i++) {
            allDocs[i].embeddings = embRes.data[i].embedding;
          }

          onProgress({
            type: "saving",
            currentPage: 1,
            totalPages: MAX_PAGES,
            percent: 35,
            chunksFound: allDocs.length,
            message: `💾 ${allDocs.length}件のSPAデータを保存中...`,
          });

          // MongoDBに保存
          await docsCol.insertMany(allDocs as DocChunk[]);
          totalChunks = allDocs.length;
        } catch (error) {
          console.error("[Crawler] Error processing SPA content:", error);
        }
      }

      // ルートURLを訪問済みに追加
      visited.add(rootUrl);
    }
  }

  // 通常サイトの処理（SPAからの発見リンクも含めてクロール継続）

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    // 早期終了チェック: 十分なコンテンツが集まったら終了
    if (totalChunks >= MIN_CHUNKS_FOR_EARLY_EXIT) {
      console.log(`[Crawler] Early exit: ${totalChunks} chunks collected`);
      break;
    }

    // 並列処理するURLを取得
    const urlsToProcess: string[] = [];
    while (queue.length > 0 && urlsToProcess.length < PARALLEL_LIMIT && visited.size + urlsToProcess.length < MAX_PAGES) {
      const url = queue.shift()!;
      if (!visited.has(url)) {
        urlsToProcess.push(url);
        visited.add(url);
      }
    }

    if (urlsToProcess.length === 0) break;

    const currentPage = visited.size;
    const percent = Math.round((currentPage / MAX_PAGES) * 100);

    // クロール進捗通知
    onProgress({
      type: "crawling",
      currentPage,
      totalPages: MAX_PAGES,
      percent,
      message: `📄 ${urlsToProcess.length}ページを並列解析中...`,
    });

    // 並列でページを処理
    const results = await Promise.all(
      urlsToProcess.map((url) => processPage(url, companyId, agentId))
    );

    // 結果を処理
    const allDocs: Omit<DocChunk, "_id">[] = [];
    for (const result of results) {
      if (!result.html) continue;

      // テーマカラー抽出（最初の成功したページから）
      if (!themeColorExtracted && result.html) {
        themeColor = extractThemeColor(result.html);
        themeColorExtracted = true;
        console.log(`[Crawler] Extracted theme color: ${themeColor}`);
      }

      allDocs.push(...result.docs);

      // リンクをキューに追加（優先ページを先に）
      const sortedLinks = sortLinksByPriority(result.links);
      for (const link of sortedLinks) {
        if (!visited.has(link) && !queue.includes(link) && queue.length + visited.size < MAX_PAGES) {
          // 重要ページは先頭に、そうでないものは末尾に
          if (isPriorityUrl(link)) {
            queue.unshift(link);
          } else {
            queue.push(link);
          }
        }
      }
    }

    if (allDocs.length === 0) continue;

    // Embedding生成の進捗通知
    onProgress({
      type: "embedding",
      currentPage,
      totalPages: MAX_PAGES,
      percent,
      chunksFound: allDocs.length,
      message: `🧠 ${allDocs.length}件のコンテンツをAI学習用に変換中...`,
    });

    try {
      // Embeddingをバッチ生成
      const textsToEmbed = allDocs.map((d) => d.chunk);
      const embRes = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: textsToEmbed,
      });

      for (let i = 0; i < allDocs.length; i++) {
        allDocs[i].embeddings = embRes.data[i].embedding;
      }

      // 保存の進捗通知
      onProgress({
        type: "saving",
        currentPage,
        totalPages: MAX_PAGES,
        percent,
        chunksFound: allDocs.length,
        message: `💾 ${allDocs.length}件のデータを保存中...`,
      });

      // MongoDBに保存
      await docsCol.insertMany(allDocs as DocChunk[]);
      totalChunks += allDocs.length;

    } catch (error) {
      console.error(`[Crawler] Error processing batch:`, error);
    }
  }

  // Puppeteerブラウザを閉じる
  await closeBrowser();

  // 完了通知
  onProgress({
    type: "saving",
    currentPage: visited.size,
    totalPages: visited.size,
    percent: 100,
    chunksFound: totalChunks,
    message: `✅ 完了！ ${visited.size}ページから${totalChunks}件の情報を学習しました`,
  });

  return {
    success: totalChunks > 0,
    pagesVisited: visited.size,
    totalChunks,
    themeColor,
  };
}

// 後方互換性のための従来関数
export async function crawlAndEmbedSite(params: {
  companyId: string;
  agentId: string;
  rootUrl: string;
}): Promise<CrawlResult> {
  return await crawlAndEmbedSiteWithProgress(params, () => {});
}
