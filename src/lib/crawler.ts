import * as cheerio from "cheerio";
import { getOpenAI } from "./openai";
import { getCollection } from "./mongodb";
import { DocChunk, CompanyInfo, CrawledPage } from "./types";
import puppeteerCore from "puppeteer-core";
import chromium from "@sparticuz/chromium";

// 本番環境かどうかを判定
const IS_PRODUCTION = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

// Puppeteerの起動オプションを取得
async function getPuppeteerOptions() {
  if (IS_PRODUCTION) {
    // 本番環境（Vercel/AWS Lambda）: @sparticuz/chromiumを使用
    const executablePath = await chromium.executablePath();
    return {
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath,
      headless: true,
    };
  } else {
    // ローカル開発環境: puppeteerの組み込みChromiumを使用
    try {
      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      // 一旦閉じて、executablePathを取得
      const execPath = browser.process()?.spawnfile;
      await browser.close();

      if (execPath) {
        return {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
          defaultViewport: { width: 1280, height: 720 },
          executablePath: execPath,
          headless: true,
        };
      }
    } catch (e) {
      console.log("[Crawler] Local puppeteer not available:", e);
    }

    // フォールバック: @sparticuz/chromiumを試す（エラーになる可能性あり）
    const executablePath = await chromium.executablePath();
    return {
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath,
      headless: true,
    };
  }
}

const MAX_PAGES = 50; // より多くのページを取得してナレッジを充実
const CHUNK_SIZE = 600; // 500〜800文字程度でチャンク分割
const PARALLEL_LIMIT = 5; // 並列クロール数
const FETCH_TIMEOUT = 10000; // 10秒タイムアウト（より確実に取得）
const MIN_CHUNKS_FOR_EARLY_EXIT = 200; // 十分なコンテンツを確保
const PUPPETEER_TIMEOUT = 25000; // Puppeteer用の長めのタイムアウト（25秒）

// 【最重要】会社情報・サービス概要を最優先で取得するパス
const CRITICAL_PATHS = [
  // ネストされたパス（会社概要ページによく使われる）
  '/corporate/overview', '/corporate/profile', '/corporate/about',
  '/company/overview', '/company/profile', '/company/about', '/company/info',
  '/about/company', '/about/overview',
  // 単一パス
  '/about', '/company', '/corporate', '/profile',  // 会社概要
  '/service', '/services', '/business',  // サービス・事業内容
  '/product', '/products',  // 製品・サービス
];

// 【重要】カスタマー対応に必要な情報があるページ
const PRIORITY_PATHS = [
  // 会社情報（ネストされたパスを先に配置）
  '/corporate/overview', '/corporate/profile', '/corporate/about', '/corporate/info',
  '/company/overview', '/company/profile', '/company/about', '/company/info',
  '/about/company', '/about/overview', '/about/profile',
  // 会社情報（単一パス）
  '/about', '/company', '/corporate', '/profile', '/kaisha', '/info', '/aboutus', '/about-us',
  '/gaiyou', '/outline', '/overview', '/introduction',
  // サービス・事業内容
  '/service', '/services', '/business', '/product', '/products', '/jigyou', '/solution', '/solutions',
  '/what-we-do', '/our-services', '/our-business',
  // 料金・プラン
  '/price', '/pricing', '/fee', '/plan', '/plans', '/cost', '/ryoukin',
  // よくある質問・サポート
  '/faq', '/faqs', '/question', '/questions', '/help', '/support', '/qa', '/q-and-a',
  // お問い合わせ
  '/contact', '/inquiry', '/toiawase', '/contact-us', '/contactus', '/otoiawase',
  // 導入事例・実績
  '/case', '/cases', '/case-study', '/works', '/portfolio', '/results', '/achievements', '/jisseki',
  // 会社の強み・特徴
  '/feature', '/features', '/strength', '/advantage', '/why-us', '/reason', '/tokuchou',
  // 流れ・プロセス
  '/flow', '/process', '/howto', '/how-to', '/step', '/steps', '/nagare',
  // アクセス・店舗情報
  '/access', '/location', '/shop', '/store', '/office', '/map', '/akusesu',
  // 採用情報
  '/recruit', '/careers', '/jobs', '/hiring', '/saiyo', '/employment',
  // ニュース・お知らせ
  '/news', '/topics', '/info', '/information', '/oshirase', '/blog', '/press',
  // プライバシー・利用規約
  '/privacy', '/terms', '/legal', '/policy',
  // その他
  '/message', '/philosophy', '/vision', '/mission', '/greeting', '/history',
];

// SPAや空ページの場合に試すサブディレクトリパス
const FALLBACK_SUBDIRECTORIES = [
  '/test',
  '/test/about', '/test/company', '/test/service', '/test/product',
  '/test/contact', '/test/faq', '/test/case', '/test/news',
  '/test/price', '/test/flow', '/test/access',
  '/wp', '/blog', '/site', '/home', '/main', '/index',
  '/lp', '/landing',
];

// 進捗イベントの型
export interface CrawlProgress {
  type: "discovering" | "crawling" | "embedding" | "saving" | "extracting" | "complete";
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
  companyInfo?: CompanyInfo;
  error?: string;
  isSPA?: boolean;  // SPAサイトだったかどうか
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
      const options = await getPuppeteerOptions();
      browser = await puppeteerCore.launch(options);
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
      const options = await getPuppeteerOptions();
      browser = await puppeteerCore.launch(options);
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

// チャンク情報の型（URLも保持）
interface ChunkWithUrl {
  text: string;
  url: string;
}

// 会社情報ページかどうかを判定
function isCompanyInfoPage(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return ['/about', '/company', '/corporate', '/profile', '/kaisha', '/gaiyou', '/overview'].some(p => lowerUrl.includes(p));
}

// 法人名パターン（これらを含むチャンクを最優先）
const LEGAL_ENTITY_PATTERNS = [
  /株式会社[^\s、。,．]+/,
  /[^\s、。,．]+株式会社/,
  /合同会社[^\s、。,．]+/,
  /[^\s、。,．]+合同会社/,
  /有限会社[^\s、。,．]+/,
  /[^\s、。,．]+有限会社/,
  /一般社団法人[^\s、。,．]+/,
  /[^\s、。,．]+弁護士法人/,
  /弁護士法人[^\s、。,．]+/,
  /[^\s、。,．]+税理士法人/,
  /税理士法人[^\s、。,．]+/,
  /[^\s、。,．]+司法書士法人/,
  /医療法人[^\s、。,．]+/,
  /社会福祉法人[^\s、。,．]+/,
  /NPO法人[^\s、。,．]+/,
  /特定非営利活動法人[^\s、。,．]+/,
];

// チャンクが法人名を含むかどうか
function containsLegalEntityName(text: string): boolean {
  return LEGAL_ENTITY_PATTERNS.some(pattern => pattern.test(text));
}

// クロールしたコンテンツから基本情報を抽出する関数
async function extractCompanyInfo(chunks: ChunkWithUrl[]): Promise<CompanyInfo> {
  const openai = getOpenAI();

  // 優先順位でソート:
  // 1. 法人名パターンを含むチャンク（最優先）
  // 2. 会社情報ページ（/about, /company等）のチャンク
  // 3. その他
  const sortedChunks = [...chunks].sort((a, b) => {
    const aHasLegalEntity = containsLegalEntityName(a.text);
    const bHasLegalEntity = containsLegalEntityName(b.text);
    const aIsCompanyPage = isCompanyInfoPage(a.url);
    const bIsCompanyPage = isCompanyInfoPage(b.url);

    // 法人名を含むチャンクを最優先
    if (aHasLegalEntity && !bHasLegalEntity) return -1;
    if (!aHasLegalEntity && bHasLegalEntity) return 1;

    // 次に会社情報ページを優先
    if (aIsCompanyPage && !bIsCompanyPage) return -1;
    if (!aIsCompanyPage && bIsCompanyPage) return 1;

    return 0;
  });

  // 法人名を含むチャンク数をログ出力
  const legalEntityChunks = sortedChunks.filter(c => containsLegalEntityName(c.text));
  if (legalEntityChunks.length > 0) {
    console.log(`[Crawler] Found ${legalEntityChunks.length} chunks with legal entity names`);
  }

  // 法人名を含むチャンクを優先的に抽出（最大80チャンク、より多くのコンテキスト）
  const combinedText = sortedChunks.slice(0, 80).map(c => c.text).join("\n").substring(0, 20000);

  if (combinedText.length < 50) {
    return {};
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",  // より高品質な抽出のため gpt-4o を使用
      messages: [
        {
          role: "system",
          content: `あなたはウェブサイトから企業情報を正確に抽出する専門AIです。

【最重要：絶対に守るべきルール】
★ テキストに明記されている情報のみを抽出すること
★ 推測・補完・創作は絶対に禁止
★ 「〇〇だろう」「〇〇と思われる」という推測は一切しない
★ テキストに書かれていない情報は省略する（空文字やnullも不要）

【会社名の抽出ルール】
- 法人格を含む正式名称を抽出：株式会社〇〇、〇〇株式会社、合同会社〇〇 など
- 屋号・ブランド名・サービス名は除外（tradeNameフィールドに入れる）

【事業内容の抽出ルール】
- businessDescriptionはテキストに書かれている事業内容のみを記載
- サイトに記載されていない事業（経営コンサル、不動産等）を追加しない
- 定款や登記情報を推測して追加しない

【servicesの抽出ルール】
- サイトで実際に紹介されているサービス名のみを記載
- 一般的な業種名や推測したサービスは含めない

以下のJSON形式で返してください（説明文は不要）：
{
  "companyName": "法人格を含む正式名称",
  "tradeName": "屋号・ブランド名（あれば）",
  "representativeName": "代表者名",
  "representativeTitle": "代表者の肩書（代表取締役社長など）",
  "establishedYear": "設立年月日",
  "address": "本社所在地（郵便番号含む）",
  "phone": "電話番号",
  "fax": "FAX番号",
  "email": "メールアドレス",
  "employeeCount": "従業員数",
  "capital": "資本金",
  "revenue": "売上高",
  "businessDescription": "サイトに明記されている事業内容のみ（推測禁止）",
  "services": ["サイトに明記されているサービス名のみ"],
  "industries": ["サイトに明記されている事業分野のみ"],
  "mission": "企業理念・ミッション",
  "vision": "ビジョン",
  "strengths": ["サイトに明記されている強みのみ"],
  "history": ["沿革（サイトに記載がある場合のみ）"],
  "achievements": ["実績・受賞（サイトに記載がある場合のみ）"],
  "clients": ["取引先（サイトに記載がある場合のみ）"],
  "recruitmentInfo": "採用情報の概要",
  "recruitmentUrl": "採用ページのURL",
  "websiteDescription": "このサイトの説明（サイトの内容に基づく）",
  "recentNews": ["ニュース（サイトに記載がある場合のみ）"]
}`
        },
        {
          role: "user",
          content: combinedText
        }
      ],
      temperature: 0.1,
      max_tokens: 2000,  // より詳細な情報を取得するため増加
    });

    const content = response.choices[0]?.message?.content?.trim() || "{}";
    // JSONを抽出（マークダウンコードブロックを除去）
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as CompanyInfo;
      console.log("[Crawler] Extracted company info:", parsed);
      return parsed;
    }
    return {};
  } catch (error) {
    console.error("[Crawler] Error extracting company info:", error);
    return {};
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
    const puppeteerHtml = await fetchHtmlWithPuppeteer(url);
    if (puppeteerHtml) return puppeteerHtml;
    // Puppeteerが失敗した場合はsimple fetchにフォールバック
    console.log(`[Crawler] Puppeteer failed, falling back to simple fetch: ${url}`);
    return await fetchHtmlSimple(url);
  }

  // まず通常のfetchを試す
  const html = await fetchHtmlSimple(url);
  if (!html) return null;

  // SPAかどうかを検出
  if (isSPAHtml(html)) {
    console.log(`[Crawler] SPA detected, retrying with Puppeteer: ${url}`);
    const puppeteerHtml = await fetchHtmlWithPuppeteer(url);
    // Puppeteerが成功した場合はそれを返す、失敗した場合は静的HTMLを返す
    if (puppeteerHtml) {
      return puppeteerHtml;
    }
    console.log(`[Crawler] Puppeteer failed for SPA, using static HTML: ${url}`);
    // SPAでも静的HTMLを返す（何もないよりはまし）
    return html;
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
    try {
      const views = await fetchAllSPAViews(url);
      if (views.length > 0) return views;
    } catch (error) {
      console.log(`[Crawler] SPA view fetch failed:`, error);
    }
    // Puppeteerが失敗した場合は静的HTMLを返す
    console.log(`[Crawler] SPA: Returning static HTML as fallback`);
    return [html];
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
        // div内のテーブルを抽出（会社概要等）
        current.find("table").each((_, table) => {
          $(table).find("tr").each((_, tr) => {
            const cells = $(tr).find("th, td");
            if (cells.length >= 2) {
              const label = $(cells[0]).text().trim();
              const value = $(cells[1]).text().trim();
              if (label && value) {
                const tableRow = `${label}: ${value}`;
                if (!section.content.includes(tableRow)) {
                  section.content.push(tableRow);
                }
              }
            }
          });
        });
        // div内のdl/dt/ddを抽出
        current.find("dl").each((_, dl) => {
          $(dl).find("dt").each((idx, dt) => {
            const label = $(dt).text().trim();
            const dd = $(dl).find("dd").eq(idx);
            const value = dd.text().trim();
            if (label && value) {
              const dlRow = `${label}: ${value}`;
              if (!section.content.includes(dlRow)) {
                section.content.push(dlRow);
              }
            }
          });
        });
      }

      // テーブル要素の直接処理（会社概要テーブル等）
      if (current.is("table")) {
        current.find("tr").each((_, tr) => {
          const cells = $(tr).find("th, td");
          if (cells.length >= 2) {
            const label = $(cells[0]).text().trim();
            const value = $(cells[1]).text().trim();
            if (label && value) {
              const tableRow = `${label}: ${value}`;
              if (!section.content.includes(tableRow)) {
                section.content.push(tableRow);
              }
            }
          }
        });
      }

      // dl要素の直接処理（定義リスト形式の会社概要等）
      if (current.is("dl")) {
        current.find("dt").each((idx, dt) => {
          const label = $(dt).text().trim();
          const dd = current.find("dd").eq(idx);
          const value = dd.text().trim();
          if (label && value) {
            const dlRow = `${label}: ${value}`;
            if (!section.content.includes(dlRow)) {
              section.content.push(dlRow);
            }
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

  // 【重要】見出しに属さないテーブル・dl要素も抽出（会社概要等）
  // 見出しの下にないが重要な情報を含む可能性があるため
  const standaloneSection: StructuredSection = {
    sectionTitle: "会社情報・その他",
    content: [],
    links: [],
  };

  // 全てのテーブルを処理
  $("table").each((_, table) => {
    $(table).find("tr").each((_, tr) => {
      const cells = $(tr).find("th, td");
      if (cells.length >= 2) {
        const label = $(cells[0]).text().trim();
        const value = $(cells[1]).text().trim();
        if (label && value && label.length < 50 && value.length < 500) {
          const tableRow = `${label}: ${value}`;
          if (!standaloneSection.content.includes(tableRow)) {
            standaloneSection.content.push(tableRow);
          }
        }
      }
    });
  });

  // 全てのdl/dt/ddを処理
  $("dl").each((_, dl) => {
    $(dl).find("dt").each((idx, dt) => {
      const label = $(dt).text().trim();
      const dd = $(dl).find("dd").eq(idx);
      const value = dd.text().trim();
      if (label && value && label.length < 50 && value.length < 500) {
        const dlRow = `${label}: ${value}`;
        if (!standaloneSection.content.includes(dlRow)) {
          standaloneSection.content.push(dlRow);
        }
      }
    });
  });

  // スタンドアロンセクションにコンテンツがあれば追加
  if (standaloneSection.content.length > 0) {
    sections.push(standaloneSection);
  }

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
// 【最重要】会社情報・サービス概要のURL判定
function isCriticalUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase();
    return CRITICAL_PATHS.some(p => path.includes(p));
  } catch {
    return false;
  }
}

// 【重要】カスタマー対応に必要な情報があるURL判定
function isPriorityUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname.toLowerCase();
    return PRIORITY_PATHS.some(p => path.includes(p));
  } catch {
    return false;
  }
}

// リンクを優先度でソート（最重要 > 重要 > その他）
function sortLinksByPriority(links: string[]): string[] {
  return links.sort((a, b) => {
    // 最重要（会社情報・サービス）: 0, 重要: 1, その他: 2
    const aPriority = isCriticalUrl(a) ? 0 : isPriorityUrl(a) ? 1 : 2;
    const bPriority = isCriticalUrl(b) ? 0 : isPriorityUrl(b) ? 1 : 2;
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
  pageMeta: {
    title: string;
    description: string;
    category: string;
  } | null;
}

// URLからページカテゴリを推測
function inferPageCategory(url: string): string {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('/about') || lowerUrl.includes('/company') || lowerUrl.includes('/corporate') || lowerUrl.includes('/profile')) return '会社情報';
  if (lowerUrl.includes('/service') || lowerUrl.includes('/business') || lowerUrl.includes('/product')) return 'サービス';
  if (lowerUrl.includes('/recruit') || lowerUrl.includes('/career') || lowerUrl.includes('/job')) return '採用情報';
  if (lowerUrl.includes('/contact') || lowerUrl.includes('/inquiry')) return 'お問い合わせ';
  if (lowerUrl.includes('/news') || lowerUrl.includes('/press') || lowerUrl.includes('/blog')) return 'ニュース';
  if (lowerUrl.includes('/faq') || lowerUrl.includes('/help') || lowerUrl.includes('/support')) return 'サポート';
  if (lowerUrl.includes('/price') || lowerUrl.includes('/pricing') || lowerUrl.includes('/plan')) return '料金';
  if (lowerUrl.includes('/case') || lowerUrl.includes('/work') || lowerUrl.includes('/portfolio')) return '実績';
  if (lowerUrl.includes('/access') || lowerUrl.includes('/location') || lowerUrl.includes('/map')) return 'アクセス';
  if (lowerUrl.includes('/ir') || lowerUrl.includes('/investor')) return 'IR情報';
  return 'その他';
}

// 単一ページを処理する関数
async function processPage(
  url: string,
  companyId: string,
  agentId: string
): Promise<PageProcessResult> {
  const html = await fetchHtml(url);
  if (!html) {
    return { url, docs: [], links: [], html: null, pageMeta: null };
  }

  const pageMeta = extractPageMeta(html, url);
  const category = inferPageCategory(url);
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
  return {
    url,
    docs: docsToInsert,
    links,
    html,
    pageMeta: {
      title: pageMeta.title,
      description: pageMeta.description,
      category,
    },
  };
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
  const allChunkTexts: ChunkWithUrl[] = [];  // 基本情報抽出用にチャンクテキストを収集（URLも保持）
  const crawledPages: { url: string; title: string; description: string; category: string }[] = [];  // クロールしたページ情報

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

    // SPAの全ビューを取得（Puppeteerが失敗した場合は空配列）
    let spaViews: string[] = [];
    try {
      spaViews = await fetchAllSPAViews(rootUrl);
    } catch (error) {
      console.error("[Crawler] Puppeteer failed, will use fallback:", error);
    }

    // Puppeteerが失敗した場合のフォールバック: initialHtmlからリンクを抽出
    if (spaViews.length === 0 && initialHtml) {
      console.log("[Crawler] SPA: Puppeteer failed, using fallback link extraction from static HTML");
      onProgress({
        type: "crawling",
        currentPage: 1,
        totalPages: MAX_PAGES,
        percent: 15,
        message: "📄 静的HTMLからリンクを抽出中...",
      });

      // 静的HTMLからリンクを抽出してキューに追加
      const links = extractLinks(initialHtml, rootUrl);
      const sortedLinks = sortLinksByPriority(links);
      for (const link of sortedLinks) {
        if (!visited.has(link) && !queue.includes(link)) {
          if (isCriticalUrl(link)) {
            queue.unshift(link);  // 最重要は先頭
          } else if (isPriorityUrl(link)) {
            queue.splice(Math.min(5, queue.length), 0, link);  // 重要は先頭付近
          } else {
            queue.push(link);
          }
        }
      }

      // 【最重要】会社情報・サービス概要のパスを最優先で追加
      const baseUrl = new URL(rootUrl);
      const rootPath = baseUrl.pathname.replace(/\/$/, '') || '';

      // まずCRITICAL_PATHSを最優先で追加（会社情報・サービス概要）
      for (const path of CRITICAL_PATHS) {
        const priorityUrl = `${baseUrl.origin}${rootPath}${path}/`;
        if (!visited.has(priorityUrl) && !queue.includes(priorityUrl)) {
          queue.unshift(priorityUrl);
        }
        if (rootPath) {
          const originUrl = `${baseUrl.origin}${path}/`;
          if (!visited.has(originUrl) && !queue.includes(originUrl)) {
            queue.unshift(originUrl);
          }
        }
      }

      // 次にPRIORITY_PATHSを追加（カスタマー対応に必要な情報）
      for (const path of PRIORITY_PATHS.slice(0, 25)) {
        const priorityUrl = `${baseUrl.origin}${rootPath}${path}/`;
        if (!visited.has(priorityUrl) && !queue.includes(priorityUrl)) {
          queue.push(priorityUrl);
        }
      }

      // リンクが見つからない場合、フォールバックサブディレクトリを試す
      if (queue.length === 0) {
        console.log("[Crawler] No links found, trying fallback subdirectories");
        const baseUrl = new URL(rootUrl);
        // rootUrlのパスを取得（例: /test/ -> /test）
        const rootPath = baseUrl.pathname.replace(/\/$/, '') || '';

        for (const subdir of FALLBACK_SUBDIRECTORIES) {
          const fallbackUrl = `${baseUrl.origin}${subdir}/`;
          queue.push(fallbackUrl);
        }
        // 重要パスも追加（rootUrlのパスを基準にする）
        for (const path of PRIORITY_PATHS) {
          // rootUrlのパス配下に追加（例: /test/ + /about -> /test/about/）
          const priorityUrl = `${baseUrl.origin}${rootPath}${path}/`;
          queue.unshift(priorityUrl);
          // originからの直接パスも追加
          if (rootPath) {
            const originPriorityUrl = `${baseUrl.origin}${path}/`;
            queue.push(originPriorityUrl);
          }
        }
        console.log(`[Crawler] Added ${queue.length} fallback URLs to try`);
      }

      console.log(`[Crawler] SPA fallback: Queue has ${queue.length} URLs to crawl`);

      // ルートURLを訪問済みに追加
      visited.add(rootUrl);
    } else if (spaViews.length > 0) {
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
            if (isCriticalUrl(link)) {
              queue.unshift(link);  // 最重要は先頭
            } else if (isPriorityUrl(link)) {
              queue.splice(Math.min(5, queue.length), 0, link);  // 重要は先頭付近
            } else {
              queue.push(link);
            }
          }
        }
      }

      // 【最重要】会社情報・サービス概要のパスを最優先で追加（SPA成功時も！）
      const baseUrl = new URL(rootUrl);
      const rootPath = baseUrl.pathname.replace(/\/$/, '') || '';

      // まずCRITICAL_PATHSを最優先で追加
      for (const path of CRITICAL_PATHS) {
        const priorityUrl = `${baseUrl.origin}${rootPath}${path}/`;
        if (!visited.has(priorityUrl) && !queue.includes(priorityUrl)) {
          queue.unshift(priorityUrl);
        }
        if (rootPath) {
          const originUrl = `${baseUrl.origin}${path}/`;
          if (!visited.has(originUrl) && !queue.includes(originUrl)) {
            queue.unshift(originUrl);
          }
        }
      }

      // 次にPRIORITY_PATHSを追加
      for (const path of PRIORITY_PATHS.slice(0, 25)) {
        const priorityUrl = `${baseUrl.origin}${rootPath}${path}/`;
        if (!visited.has(priorityUrl) && !queue.includes(priorityUrl)) {
          queue.push(priorityUrl);
        }
      }

      console.log(`[Crawler] SPA: Extracted ${queue.length} links from SPA views + priority paths for further crawling`);

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

          // MongoDBに保存
          await docsCol.insertMany(allDocs as DocChunk[]);
          totalChunks = allDocs.length;

          // 基本情報抽出用にチャンクテキストを収集（URLも保持）
          allChunkTexts.push(...allDocs.map(d => ({ text: d.chunk, url: d.url })));
        } catch (error) {
          console.error("[Crawler] Error processing SPA content:", error);
        }
      }

      // ルートURLを訪問済みに追加
      visited.add(rootUrl);
    }
  }

  // 通常サイトの処理（SPAからの発見リンクも含めてクロール継続）

  // CRITICAL_PATHSを追跡（早期終了前に必ず処理）
  const baseUrl = new URL(rootUrl);
  const criticalUrls = new Set<string>();
  for (const path of CRITICAL_PATHS) {
    criticalUrls.add(`${baseUrl.origin}${path}/`);
  }

  // 未処理のクリティカルURLがあるかチェック
  const hasPendingCriticalUrls = () => {
    return queue.some(url => criticalUrls.has(url) && !visited.has(url));
  };

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    // 早期終了チェック: 十分なコンテンツが集まったら終了
    // ただし、クリティカルURLが未処理の場合は続行
    if (totalChunks >= MIN_CHUNKS_FOR_EARLY_EXIT && !hasPendingCriticalUrls()) {
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

      // ページメタ情報を収集
      if (result.pageMeta) {
        crawledPages.push({
          url: result.url,
          title: result.pageMeta.title,
          description: result.pageMeta.description,
          category: result.pageMeta.category,
        });
      }

      allDocs.push(...result.docs);

      // リンクをキューに追加（最重要 > 重要 > その他）
      const sortedLinks = sortLinksByPriority(result.links);
      for (const link of sortedLinks) {
        if (!visited.has(link) && !queue.includes(link) && queue.length + visited.size < MAX_PAGES) {
          if (isCriticalUrl(link)) {
            queue.unshift(link);  // 最重要は先頭
          } else if (isPriorityUrl(link)) {
            queue.splice(Math.min(5, queue.length), 0, link);  // 重要は先頭付近
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

      // MongoDBに保存（進捗メッセージはembeddingの時点で表示済みなので省略）
      await docsCol.insertMany(allDocs as DocChunk[]);
      totalChunks += allDocs.length;

      // 基本情報抽出用にチャンクテキストを収集（URLも保持）
      allChunkTexts.push(...allDocs.map(d => ({ text: d.chunk, url: d.url })));

    } catch (error) {
      console.error(`[Crawler] Error processing batch:`, error);
    }
  }

  // Puppeteerブラウザを閉じる
  await closeBrowser();

  // 基本情報を抽出
  onProgress({
    type: "extracting",
    currentPage: visited.size,
    totalPages: visited.size,
    percent: 90,
    chunksFound: totalChunks,
    message: `📋 企業情報を解析中...`,
  });

  const companyInfo = await extractCompanyInfo(allChunkTexts);

  // クロールしたページ情報をcompanyInfoに追加
  // カテゴリでソートし、重要な情報が先に来るようにする
  const sortedPages = crawledPages.sort((a, b) => {
    const categoryOrder: Record<string, number> = {
      '会社情報': 0,
      'サービス': 1,
      '料金': 2,
      '実績': 3,
      'サポート': 4,
      '採用情報': 5,
      'ニュース': 6,
      'お問い合わせ': 7,
      'IR情報': 8,
      'アクセス': 9,
      'その他': 10,
    };
    return (categoryOrder[a.category] ?? 10) - (categoryOrder[b.category] ?? 10);
  });

  // CrawledPage形式に変換
  const crawledPagesForInfo: CrawledPage[] = sortedPages.map(p => ({
    url: p.url,
    title: p.title,
    summary: p.description || '',
    category: p.category,
  }));

  // companyInfoに追加情報を付与
  const enrichedCompanyInfo: CompanyInfo = {
    ...companyInfo,
    crawledPages: crawledPagesForInfo,
    totalPagesVisited: visited.size,
    totalChunks: totalChunks,
    crawledAt: new Date().toISOString(),
  };

  // 会社情報をRAG用ドキュメントとして保存（会社概要の質問に確実に回答できるように）
  if (companyInfo && Object.keys(companyInfo).length > 0) {
    try {
      const companyInfoChunks: string[] = [];

      // 基本情報チャンク（検索キーワードを強化）
      if (companyInfo.companyName) {
        const basicInfo = [
          `【会社について・会社概要・企業情報】`,
          `当社について、会社の基本情報をご紹介します。`,
          companyInfo.companyName ? `会社名: ${companyInfo.companyName}` : '',
          companyInfo.representativeName ? `代表者・社長: ${companyInfo.representativeTitle || ''} ${companyInfo.representativeName}` : '',
          companyInfo.establishedYear ? `設立年月日: ${companyInfo.establishedYear}` : '',
          companyInfo.address ? `本社所在地・住所: ${companyInfo.address}` : '',
          companyInfo.phone ? `電話番号・連絡先: ${companyInfo.phone}` : '',
          companyInfo.capital ? `資本金: ${companyInfo.capital}` : '',
          companyInfo.employeeCount ? `従業員数: ${companyInfo.employeeCount}` : '',
        ].filter(Boolean).join('\n');
        companyInfoChunks.push(basicInfo);
      }

      // 事業内容チャンク
      if (companyInfo.businessDescription || companyInfo.services?.length) {
        const businessInfo = [
          `【事業内容】`,
          companyInfo.businessDescription || '',
          companyInfo.services?.length ? `主要サービス: ${companyInfo.services.join('、')}` : '',
          companyInfo.industries?.length ? `事業分野: ${companyInfo.industries.join('、')}` : '',
        ].filter(Boolean).join('\n');
        companyInfoChunks.push(businessInfo);
      }

      // 企業理念・強みチャンク
      if (companyInfo.mission || companyInfo.vision || companyInfo.strengths?.length) {
        const missionInfo = [
          `【企業理念・強み】`,
          companyInfo.mission ? `ミッション: ${companyInfo.mission}` : '',
          companyInfo.vision ? `ビジョン: ${companyInfo.vision}` : '',
          companyInfo.strengths?.length ? `強み: ${companyInfo.strengths.join('、')}` : '',
        ].filter(Boolean).join('\n');
        companyInfoChunks.push(missionInfo);
      }

      // RAG用ドキュメントとして保存
      if (companyInfoChunks.length > 0) {
        const companyInfoDocs: Omit<DocChunk, "_id">[] = [];
        const companyInfoTexts = companyInfoChunks;

        const companyInfoEmbRes = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: companyInfoTexts,
        });

        for (let i = 0; i < companyInfoChunks.length; i++) {
          companyInfoDocs.push({
            companyId,
            agentId,
            url: rootUrl,
            title: '会社概要・基本情報',
            sectionTitle: i === 0 ? '会社概要' : i === 1 ? '事業内容' : '企業理念',
            chunk: companyInfoChunks[i],
            embeddings: companyInfoEmbRes.data[i].embedding,
            createdAt: new Date(),
          });
        }

        await docsCol.insertMany(companyInfoDocs as DocChunk[]);
        totalChunks += companyInfoDocs.length;
        console.log(`[Crawler] Added ${companyInfoDocs.length} company info chunks to RAG`);
      }
    } catch (error) {
      console.error('[Crawler] Error adding company info to RAG:', error);
    }
  }

  // 完了前の通知（APIが最終的なcompleteイベントを送信する）
  onProgress({
    type: "saving",
    currentPage: visited.size,
    totalPages: visited.size,
    percent: 95,
    chunksFound: totalChunks,
    message: `💾 ${visited.size}ページから${totalChunks}件の情報を保存中...`,
  });

  return {
    success: totalChunks > 0,
    pagesVisited: visited.size,
    totalChunks,
    themeColor,
    companyInfo: enrichedCompanyInfo,
    isSPA,
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
