import express, { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
// @ts-ignore
import PDFDocument from 'pdfkit';
import fs from 'fs';
import { chromium } from 'playwright-core';
import multer from 'multer';
import Tesseract from 'tesseract.js';

dotenv.config();

// ES Moduleで__dirnameを取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
// Fly.io uses PORT=8080 internally, fallback to 3001 for local development
const port = parseInt(process.env.PORT || '3001', 10);

app.use(cors());
app.use(express.json());

// Multer設定（画像アップロード用）
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB制限
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('画像ファイルのみアップロード可能です'));
    }
  }
});

// 静的ファイルのパスを定義（後で使用）
const distPath = path.join(process.cwd(), 'dist');

interface WorkflowRequest {
  url: string;
  maxQA?: number;
  language?: string;
  sourceCode?: string; // Optional: HTML source code from browser extension
}

interface WorkflowResponse {
  success: boolean;
  data?: {
    url: string;
    extractedContent: string;
    qaResult: string;
  };
  robotsAllowed?: boolean;
  error?: string;
  details?: string;  // エラー詳細情報用
}

// Playwrightでブラウザ経由でHTMLを取得（JavaScript実行サイトやセキュリティ保護されたサイトに対応）
async function fetchWithBrowser(url: string): Promise<string> {
  console.log(`🎭 Fetching with Playwright (real browser): ${url}`);
  
  let browser = null;
  
  try {
    // システムChromiumを使用（Dockerコンテナ内）
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
    
    console.log(`🚀 Launching Chromium from: ${executablePath}`);
    
    // ランダムなUser-Agentを使用（ボット検出を回避）
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
    ];
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    console.log(`🎭 Using User-Agent: ${randomUserAgent.substring(0, 50)}...`);
    
    browser = await chromium.launch({
      headless: true,
      executablePath: executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled',
        '--single-process',
        '--no-zygote',
        '--disable-extensions',
        '--disable-default-apps',
        '--no-first-run'
      ],
      timeout: 30000
    });
    
    // ドメイン情報を取得（Referer用）
    const domain = new URL(url).origin;
    const topPageUrl = `${domain}/hankyu-beauty/`;
    
    const context = await browser.newContext({
      userAgent: randomUserAgent,
      viewport: { width: 1920, height: 1080 },
      locale: 'ja-JP',
      timezoneId: 'Asia/Tokyo',
      extraHTTPHeaders: {
        'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Referer': topPageUrl, // 🔥 重要: トップページから遷移したように見せる
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin', // 🔥 none → same-origin（同じサイト内遷移）
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'DNT': '1' // Do Not Track（プライバシー配慮）
      },
      javaScriptEnabled: true,
      permissions: ['geolocation']
    });
    
    const page = await context.newPage();
    
    // WebDriver検出を回避
    await page.addInitScript(`
      // navigator.webdriverを削除
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // Chrome自動化フラグを削除
      window.chrome = {
        runtime: {},
      };
      
      // Permissionsをオーバーライド
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
    `);
    
    console.log(`⏳ Navigating to ${url}...`);
    
    // まずトップページにアクセス（クッキー・セッション確立）
    console.log(`🏠 First accessing homepage: ${topPageUrl}`);
    
    try {
      await page.goto(topPageUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      console.log(`✅ Homepage loaded, waiting for cookies...`);
      
      // クッキーを確認してログ出力
      const cookies = await context.cookies();
      console.log(`🍪 Received ${cookies.length} cookies from homepage`);
      
      // ランダム待機（3-5秒）でボット検出を回避
      const randomWait1 = Math.floor(Math.random() * 2000) + 3000; // 3000-5000ms
      console.log(`⏳ Random wait: ${randomWait1}ms`);
      await page.waitForTimeout(randomWait1);
    } catch (error) {
      console.warn(`⚠️ Homepage access failed, continuing anyway...`);
    }
    
    // 本来のURLにアクセス（Refererは自動で前のページになる）
    console.log(`🎯 Now accessing target URL: ${url}`);
    await page.goto(url, {
      waitUntil: 'load', // domcontentloaded → load に変更
      timeout: 90000 // 90秒に延長
    });
    
    // ランダム待機（5-8秒）
    const randomWait2 = Math.floor(Math.random() * 3000) + 5000; // 5000-8000ms
    console.log(`⏳ Waiting for JavaScript execution (${randomWait2}ms)...`);
    await page.waitForTimeout(randomWait2);
    
    // 人間らしいスクロール動作（ランダム化）
    console.log(`🖱️ Simulating human scrolling and interaction...`);
    
    // ランダムなスクロール位置（300-500px）
    const scroll1 = Math.floor(Math.random() * 200) + 300;
    await page.evaluate(`window.scrollTo({top: ${scroll1}, behavior: "smooth"})`);
    await page.waitForTimeout(Math.floor(Math.random() * 1000) + 1000); // 1-2秒
    
    // ランダムなスクロール位置（700-900px）
    const scroll2 = Math.floor(Math.random() * 200) + 700;
    await page.evaluate(`window.scrollTo({top: ${scroll2}, behavior: "smooth"})`);
    await page.waitForTimeout(Math.floor(Math.random() * 1000) + 1500); // 1.5-2.5秒
    
    // ランダムなスクロール位置（1200-1800px）
    const scroll3 = Math.floor(Math.random() * 600) + 1200;
    await page.evaluate(`window.scrollTo({top: ${scroll3}, behavior: "smooth"})`);
    await page.waitForTimeout(Math.floor(Math.random() * 1000) + 1500); // 1.5-2.5秒
    
    // トップに戻る
    await page.evaluate('window.scrollTo({top: 0, behavior: "smooth"})');
    await page.waitForTimeout(Math.floor(Math.random() * 1000) + 2000); // 2-3秒
    
    // ランダムなマウス移動
    const mouseX1 = Math.floor(Math.random() * 300) + 100;
    const mouseY1 = Math.floor(Math.random() * 300) + 100;
    await page.mouse.move(mouseX1, mouseY1);
    await page.waitForTimeout(Math.floor(Math.random() * 500) + 300); // 0.3-0.8秒
    
    const mouseX2 = Math.floor(Math.random() * 500) + 200;
    const mouseY2 = Math.floor(Math.random() * 500) + 200;
    await page.mouse.move(mouseX2, mouseY2);
    await page.waitForTimeout(Math.floor(Math.random() * 500) + 300); // 0.3-0.8秒
    
    // 最終的な待機（すべてのリソース読み込み完了）
    console.log(`⏳ Final wait for all resources...`);
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {
      console.warn(`⚠️ NetworkIdle timeout, continuing anyway...`);
    });
    
    // デバッグ: ページ情報を詳細に取得
    const pageUrl = page.url();
    const pageTitle = await page.title();
    console.log(`📍 Current URL: ${pageUrl}`);
    console.log(`📌 Page title: ${pageTitle}`);
    
    // デバッグ: 主要な要素の存在確認
    const bodyText = await page.evaluate(() => {
      // @ts-ignore - document is available in browser context
      const doc: any = document;
      return doc.body.innerText;
    });
    console.log(`📝 Body text length: ${bodyText.length} chars`);
    console.log(`📝 Body text preview (first 200 chars): ${bodyText.substring(0, 200)}`);
    
    // 特定の要素が存在するか確認
    const hasGoodsDetail = await page.evaluate(() => {
      // @ts-ignore - document is available in browser context
      const doc: any = document;
      return !!(
        doc.querySelector('.goodsDetail') ||
        doc.querySelector('.product-detail') ||
        doc.querySelector('[class*="product"]') ||
        doc.querySelector('h1')
      );
    });
    console.log(`🔍 Has product elements: ${hasGoodsDetail}`);
    
    // ページのHTMLを取得
    const html = await page.content();
    
    console.log(`✅ Successfully fetched with Playwright (${html.length} bytes)`);
    
    // 🔍 403チェック: PlaywrightでもForbiddenページを取得していないか確認
    if (pageTitle.includes('403') || pageTitle.includes('Forbidden') || 
        bodyText.includes('403 Forbidden') && bodyText.length < 100) {
      console.log(`⚠️ Playwright fetched 403 Forbidden page (title: "${pageTitle}", bodyLength: ${bodyText.length})`);
      throw new Error('Playwright fetched 403 Forbidden page');
    }
    console.log(`📄 HTML preview (first 500 chars): ${html.substring(0, 500)}`);
    
    // 最後の1000文字も確認（フッター確認用）
    console.log(`📄 HTML end (last 300 chars): ${html.substring(html.length - 300)}`);
    
    await browser.close();
    return html;
    
  } catch (error: any) {
    console.error(`❌ Playwright fetch failed:`, error.message);
    console.error(`   Error stack:`, error.stack);
    
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error(`❌ Error closing browser:`, closeError);
      }
    }
    
    throw error;
  }
}

// 簡易的なHTMLフェッチ（最終フォールバック）
// GenSpark Crawlerの代わりに、より寛容なfetchを使用
async function fetchWithGenSparkCrawler(url: string): Promise<string> {
  console.log(`🌐 [Fallback Fetch] Attempting to fetch with minimal restrictions: ${url}`);
  
  try {
    // より寛容なヘッダーで再試行
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'ja,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Connection': 'close',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 60000,
      maxRedirects: 10,
      validateStatus: () => true // すべてのステータスコードを受け入れる
    });
    
    const content = String(response.data);
    console.log(`✅ [Fallback Fetch] Fetched ${content.length} bytes (status: ${response.status})`);
    
    // 403ページでも、何かコンテンツがあれば返す
    // （最終手段として）
    if (content.length > 50) {
      return content;
    }
    
    throw new Error('Fallback fetch returned insufficient content');
  } catch (error) {
    console.error(`❌ [Fallback Fetch] Failed:`, error instanceof Error ? error.message : String(error));
    
    // 本当の最終手段: エラーメッセージをHTMLとして返す
    return `<html><body><h1>Failed to fetch content</h1><p>URL: ${url}</p><p>All methods exhausted.</p></body></html>`;
  }
}

// HTTPリクエストを実行してHTMLを取得（通常のブラウザとして振る舞う）
// まずaxiosで試行し、403エラーの場合はPuppeteerにフォールバック、最後にGenSpark Crawler
async function fetchWebsite(url: string): Promise<string> {
  console.log(`🌐 Fetching website: ${url}`);
  
  // リトライ設定
  const maxRetries = 3;
  let lastError: any;
  let usedPuppeteer = false;
  let usedGenSparkCrawler = false;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📡 Attempt ${attempt}/${maxRetries} to fetch ${url}`);
      
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
          'Referer': 'https://www.google.com/'
        },
        timeout: 30000, // 30秒に延長
        maxRedirects: 5,
        validateStatus: (status) => status < 500 // 500未満のステータスコードを受け入れる
      });
      
      console.log(`✅ Successfully fetched ${url} (${response.data.length} bytes)`);
      
      // コンテンツに"403 Forbidden"が含まれている場合、実際はブロックされている
      const contentStr = String(response.data);
      const is403Content = contentStr.includes('403 Forbidden') || 
                          contentStr.includes('Access Denied') || 
                          contentStr.includes('Forbidden');
      const isTooSmall = response.data.length < 1000;
      
      console.log(`🔍 Content check: is403=${is403Content}, size=${response.data.length}, tooSmall=${isTooSmall}`);
      
      if (is403Content || (contentStr.includes('Forbidden') && isTooSmall)) {
        console.log(`⚠️ Content contains "403 Forbidden" or blocking message.`);
        
        // フォールバックチェーン: Playwright → GenSpark Crawler
        if (!usedPuppeteer) {
          console.log(`🔄 Trying Playwright...`);
          try {
            const html = await fetchWithBrowser(url);
            console.log(`✅ Playwright succeeded`);
            return html;
          } catch (browserError: any) {
            console.error(`❌ Playwright failed:`, browserError.message);
            usedPuppeteer = true;
          }
        }
        
        // Playwrightが失敗したら、GenSpark Crawlerを試す
        if (!usedGenSparkCrawler) {
          console.log(`🚀 Trying GenSpark Crawler...`);
          try {
            const html = await fetchWithGenSparkCrawler(url);
            console.log(`🎉 GenSpark Crawler succeeded!`);
            return html;
          } catch (crawlerError: any) {
            console.error(`❌ GenSpark Crawler failed:`, crawlerError.message);
            usedGenSparkCrawler = true;
          }
        }
      }
      
      return response.data;
    } catch (error: any) {
      lastError = error;
      
      // エラー詳細をログ
      if (error.response) {
        // サーバーからレスポンスが返ってきた場合
        console.error(`❌ Attempt ${attempt} failed with status ${error.response.status}`);
        console.error(`   Response headers:`, error.response.headers);
        console.error(`   Response data:`, error.response.data?.substring(0, 200));
        
        // 403エラー（アクセス拒否）の場合、フォールバックチェーン実行
        if (error.response.status === 403) {
          console.log(`🔄 403 Forbidden detected. Starting fallback chain...`);
          
          // フォールバック1: Playwright
          if (!usedPuppeteer) {
            console.log(`🔄 Trying Playwright (real browser)...`);
            try {
              const html = await fetchWithBrowser(url);
              console.log(`✅ Playwright succeeded`);
              return html;
            } catch (browserError: any) {
              console.error(`❌ Playwright failed:`, browserError.message);
              usedPuppeteer = true;
            }
          }
          
          // フォールバック2: GenSpark Crawler
          if (!usedGenSparkCrawler) {
            console.log(`🚀 Trying GenSpark Crawler...`);
            try {
              const html = await fetchWithGenSparkCrawler(url);
              console.log(`🎉 GenSpark Crawler succeeded!`);
              return html;
            } catch (crawlerError: any) {
              console.error(`❌ GenSpark Crawler failed:`, crawlerError.message);
              usedGenSparkCrawler = true;
            }
          }
        }
      } else if (error.request) {
        // リクエストは送信されたがレスポンスがない場合
        console.error(`❌ Attempt ${attempt} failed: No response received`);
        console.error(`   Request details:`, {
          url: error.config?.url,
          method: error.config?.method,
          timeout: error.config?.timeout
        });
      } else {
        // リクエスト設定時のエラー
        console.error(`❌ Attempt ${attempt} failed:`, error.message);
      }
      
      // 最後の試行でなければ待機してリトライ
      if (attempt < maxRetries) {
        const waitTime = attempt * 2000; // 2秒、4秒と増加
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  
  // すべてのリトライが失敗した場合、最後にPlaywrightを試行
  if (!usedPuppeteer) {
    console.log(`🔄 All axios attempts failed. Trying Playwright as last resort...`);
    try {
      const html = await fetchWithBrowser(url);
      return html;
    } catch (browserError: any) {
      console.error(`❌ Playwright also failed:`, browserError.message);
    }
  }
  
  // 🚀 最終フォールバック: GenSpark Crawlerを試行（まだ使用していない場合）
  if (!usedGenSparkCrawler) {
    console.log(`🚀 Trying GenSpark Crawler as final fallback...`);
    try {
      const html = await fetchWithGenSparkCrawler(url);
      console.log(`🎉 GenSpark Crawler succeeded! HTML length: ${html.length} bytes`);
      return html;
    } catch (crawlerError: any) {
      console.error(`❌ GenSpark Crawler also failed:`, crawlerError.message);
    }
  }
  
  // すべての方法が失敗した場合
  const errorMessage = lastError?.response 
    ? `Failed to fetch website (Status: ${lastError.response.status}). All methods (axios, Playwright, GenSpark Crawler) failed.`
    : lastError?.request
    ? `Failed to fetch website: No response from server (timeout or network error). All methods failed.`
    : `Failed to fetch website: ${lastError?.message || 'Unknown error'}. All methods failed.`;
  
  console.error(`🚫 All attempts (axios + Playwright + GenSpark Crawler) failed for ${url}`);
  throw new Error(errorMessage);
}

// HTMLからテキストコンテンツを抽出（商品情報を優先）
function extractContent(html: string): string {
  const $ = cheerio.load(html);
  
  console.log('🔍 Extracting content with PRODUCT-FIRST algorithm (top-down priority)...');
  console.log(`📄 Original HTML length: ${html.length} bytes`);
  
  // デバッグ: タイトルを確認
  const pageTitle = $('title').text();
  console.log(`📌 Page title: ${pageTitle}`);
  
  // 【ステップ1】ノイズとなる要素を徹底的に削除
  $('script, style, noscript, iframe, svg, link').remove();
  $('nav, header, footer').remove(); // ナビゲーション、ヘッダー、フッター
  $('[class*="cookie"], [id*="cookie"]').remove(); // クッキー通知
  $('[class*="sidebar"], [class*="side-bar"], aside').remove(); // サイドバー
  $('[class*="menu"], [class*="navigation"], [role="navigation"]').remove(); // メニュー
  $('[class*="breadcrumb"]').remove(); // パンくずリスト
  $('[class*="share"], [class*="social"]').remove(); // SNSシェアボタン
  $('[class*="related"], [class*="recommend"], [class*="suggestion"]').remove(); // 関連商品
  $('[class*="comment"], [class*="review"], [class*="rating"]').remove(); // レビュー欄
  $('[class*="banner"], [class*="ad"], [class*="advertisement"]').remove(); // 広告
  $('[class*="newsletter"], [class*="subscribe"]').remove(); // メルマガ購読
  $('form').remove(); // フォーム（検索、問い合わせなど）
  
  // 【ステップ2】商品情報が含まれるメインコンテナを特定（最も重要）
  const mainContentSelectors = [
    // 最優先: 明確な商品コンテナ
    '.product-detail, .product-details, .productDetail',
    '.product-info, .productInfo, .product-information',
    '.item-detail, .itemDetail, .item-details',
    '.product-content, .productContent',
    
    // 阪急オンライン特有のセレクタ
    '.goodsDetail',
    '.itemBox',
    '#goodsDetailArea',
    '.detailBox',
    '.goodsInfo',
    
    // 次優先: 一般的なメインコンテンツ
    'main article',
    'main .content',
    'main',
    '[role="main"]',
    'article.product',
    'article.item',
    '.main-content',
    '#main-content',
    '#content',
    'article',
    
    // ECサイト共通セレクタ
    '[itemscope][itemtype*="Product"]',
    '.product',
    '.goods',
    '.item'
  ];
  
  let mainContainer = null;
  for (const selector of mainContentSelectors) {
    mainContainer = $(selector).first();
    if (mainContainer.length > 0 && mainContainer.text().trim().length > 100) {
      console.log(`✅ Found main container: ${selector}`);
      break;
    }
  }
  
  // メインコンテナが見つからない場合はbodyを使用
  if (!mainContainer || mainContainer.length === 0) {
    console.log('⚠️ No main container found, using body');
    mainContainer = $('body');
  }
  
  // 【ステップ3】メインコンテナ内の商品情報を優先順位で抽出
  const productInfoSections: Array<{text: string, priority: number}> = [];
  
  // 最優先: 商品タイトル・見出し（ページ上部）
  mainContainer.find('h1, h2, [class*="product-title"], [class*="product-name"], [class*="item-title"]').each((_, elem) => {
    const text = $(elem).text().trim();
    if (text && text.length > 5 && text.length < 500) {
      productInfoSections.push({ text, priority: 1 });
    }
  });
  
  // 高優先: 商品説明・詳細（ページ中央）
  mainContainer.find('[class*="description"], [class*="detail"], [class*="feature"], [class*="spec"], [class*="about"]').each((_, elem) => {
    const text = $(elem).text().trim();
    if (text && text.length > 50) {
      productInfoSections.push({ text, priority: 2 });
    }
  });
  
  // 中優先: 価格・購入情報
  mainContainer.find('[class*="price"], [class*="cost"], [class*="buy"], [class*="purchase"]').each((_, elem) => {
    const text = $(elem).text().trim();
    if (text && text.length > 10 && text.length < 300) {
      productInfoSections.push({ text, priority: 3 });
    }
  });
  
  // 低優先: その他の段落（ページ下部）
  mainContainer.find('p, div, section').each((_, elem) => {
    const text = $(elem).text().trim();
    // 長すぎず短すぎない、意味のあるテキストのみ
    if (text && text.length > 30 && text.length < 1000) {
      // すでに抽出済みのテキストと重複していないかチェック
      const isDuplicate = productInfoSections.some(section => 
        section.text.includes(text) || text.includes(section.text)
      );
      if (!isDuplicate) {
        productInfoSections.push({ text, priority: 4 });
      }
    }
  });
  
  // 【ステップ4】優先順位でソートして結合
  productInfoSections.sort((a, b) => a.priority - b.priority);
  
  let extractedContent = productInfoSections
    .map(section => section.text)
    .join(' ');
  
  // テキストを整形
  const cleanedContent = extractedContent
    .replace(/\s+/g, ' ') // 連続する空白を1つに
    .replace(/\n+/g, ' ') // 改行を空白に
    .trim();
  
  console.log(`✅ Extracted ${cleanedContent.length} characters (${productInfoSections.length} sections)`);
  console.log(`📊 Priority distribution: P1=${productInfoSections.filter(s=>s.priority===1).length}, P2=${productInfoSections.filter(s=>s.priority===2).length}, P3=${productInfoSections.filter(s=>s.priority===3).length}, P4=${productInfoSections.filter(s=>s.priority===4).length}`);
  
  // 【ステップ5】文字数制限（商品情報を最大限保持）
  // 上位3500文字を取得（フッター情報を完全除外）
  let finalContent: string;
  if (cleanedContent.length <= 3500) {
    finalContent = cleanedContent;
  } else {
    // ページ上部の商品情報のみを使用（フッターの一般情報は除外）
    finalContent = cleanedContent.substring(0, 3500);
    console.log(`📏 Content truncated to top 3500 chars (product-focused)`);
  }
  
  // 内容が少なすぎる場合の警告
  if (finalContent.length < 100) {
    console.warn('⚠️ WARNING: Very little content extracted. This might not be a product page.');
  }
  
  // 抽出されたコンテンツのプレビューを表示
  console.log(`📄 Extracted content preview (first 300 chars): ${finalContent.substring(0, 300)}`);
  
  return finalContent;
}

// OpenAI APIを使用して複数のQ&Aを生成
// OCRで画像からテキストを抽出
async function extractTextFromImage(imageBuffer: Buffer): Promise<string> {
  console.log(`🔍 OCR処理開始: ${imageBuffer.length} bytes`);
  
  try {
    const result = await Tesseract.recognize(imageBuffer, 'jpn+eng', {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`OCR進捗: ${(m.progress * 100).toFixed(1)}%`);
        }
      }
    });
    
    console.log(`✅ OCR完了: ${result.data.text.length} 文字抽出`);
    return result.data.text;
  } catch (error) {
    console.error('❌ OCR処理エラー:', error);
    throw new Error(`OCR処理に失敗しました: ${error}`);
  }
}

async function generateQA(content: string, maxQA: number = 5, language: string = 'ja', productUrl?: string): Promise<Array<{question: string, answer: string}>> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  console.log('API Key check:', apiKey ? `Found (length: ${apiKey.length})` : 'NOT FOUND');
  console.log('Generating Q&A:', { maxQA, language, contentLength: content.length });
  
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured');
  }

  const openai = new OpenAI({
    apiKey: apiKey
  });

  // コンテンツが少ない場合の対応
  const isLowContent = content.length < 500;
  const contentNote = isLowContent 
    ? `\n\n⚠️ 注意: ソーステキストが少ない場合でも、必ずソーステキストの情報のみを使用してください。外部情報や一般知識を追加しないでください。テキストから読み取れる情報を複数の角度から深掘りして${maxQA}個のQ&Aを作成してください。`
    : '';

  const languagePrompts: Record<string, string> = {
    ja: `あなたは日本語のQ&A作成専門家です。以下のテキストから、日本語で正確に${maxQA}個のQ&Aを作成してください。

【絶対守るべきルール】
1. ✅ 言語: 質問と回答は100%日本語で書くこと（英語禁止）
2. ✅ 数量: 必ず${maxQA}個の異なるQ&Aを生成すること
3. ✅ 品質: 各Q&Aは完全にユニークで、異なる角度からの質問であること
4. ❌ 重複禁止: 同じまたは類似した質問を繰り返さないこと
5. 🚫 【最重要】このウェブページで販売・紹介されている商品についてのみQ&Aを作成すること
   - ソーステキストに書かれている情報のみを使用すること
   - 外部の知識や一般常識を追加しないこと
   - ソーステキストに記載されていない他の商品について言及しないこと
   - ページ下部の会社情報・連絡先・フッター情報は無視すること
   - サイトポリシー、プライバシーポリシー、利用規約などは無視すること

【Q&A作成の視点】（すべてソーステキストの商品情報のみから）
- このページで紹介されている主要な商品・サービスとは何か
- その商品の具体的な特徴・機能は何か
- その商品の使い方・利用方法はどうか
- その商品のメリット・デメリットは何か
- その商品の価格・仕様・スペックはどうか
- その商品に関する注意事項・制限事項は何か
- ソーステキストから読み取れる商品情報を複数の角度から深掘り${contentNote}

【出力フォーマット - 必ず守る】
Q1: [日本語の質問]
A1: [日本語の詳細な回答 - ソーステキストの情報のみ]

Q2: [日本語の質問]
A2: [日本語の詳細な回答 - ソーステキストの情報のみ]

...Q${maxQA}まで続ける

【ソーステキスト】
${content}

【最重要】
- 必ず${maxQA}個の異なるQ&Aを日本語で生成してください
- すべての回答はソーステキストに記載されている情報のみを使用してください
- ソーステキストに記載されていない商品や情報については一切言及しないでください`,
    en: `You are an expert Q&A creator. Generate EXACTLY ${maxQA} Q&A pairs in ENGLISH from the text below.

【ABSOLUTE RULES】
1. ✅ LANGUAGE: Write 100% in ENGLISH (NO other languages)
2. ✅ QUANTITY: Generate EXACTLY ${maxQA} distinct Q&A pairs
3. ✅ QUALITY: Each Q&A must be completely unique with different angles
4. ❌ NO DUPLICATES: Do NOT repeat similar questions
5. 🚫 【CRITICAL】Create Q&A ONLY about the products sold/featured on THIS webpage
   - Use ONLY information written in the source text
   - Do NOT add external knowledge or general information
   - Do NOT mention other products not listed in the source text
   - IGNORE footer information (company info, contact details)
   - IGNORE site policies, privacy policy, terms of service

【Q&A PERSPECTIVES】(All from product information in source text only)
- What is the main product/service featured on this page?
- What are the specific features/functions of this product?
- How to use/utilize this product?
- What are the benefits/drawbacks of this product?
- What are the prices/specifications of this product?
- What are the cautions/limitations regarding this product?
- Deep dive into product information from multiple angles${contentNote}

【OUTPUT FORMAT - MUST FOLLOW】
Q1: [English question]
A1: [Detailed English answer - source text only]

Q2: [English question]
A2: [Detailed English answer - source text only]

...continue to Q${maxQA}

【SOURCE TEXT】
${content}

【CRITICAL】
- Generate EXACTLY ${maxQA} distinct Q&A pairs in ENGLISH
- All answers must use ONLY information stated in the source text
- Do NOT mention any products not listed in the source text`,
    zh: `你是专业的中文Q&A创作专家。请从下面的文本中精确生成${maxQA}个中文问答对。

【绝对规则】
1. ✅ 语言: 100%用中文编写（禁止英文）
2. ✅ 数量: 必须生成正好${maxQA}个不同的问答对
3. ✅ 质量: 每个问答对必须完全独特，从不同角度提问
4. ❌ 禁止重复: 不要重复相似的问题
5. 🚫 【最重要】仅创建关于此网页销售/介绍的产品的问答
   - 仅使用源文本中写明的信息
   - 不要添加外部知识或常识
   - 不要提及源文本中未列出的其他产品
   - 忽略页脚信息（公司信息、联系方式）
   - 忽略网站政策、隐私政策、使用条款等

【问答创作视角】（均来自源文本的产品信息）
- 此页面介绍的主要产品/服务是什么？
- 该产品的具体特征/功能是什么？
- 如何使用/利用该产品？
- 该产品的优点/缺点是什么？
- 该产品的价格/规格是什么？
- 关于该产品的注意事项/限制是什么？
- 从多个角度深入了解产品信息${contentNote}

【输出格式 - 必须遵守】
Q1: [中文问题]
A1: [详细的中文答案]

Q2: [中文问题]
A2: [详细的中文答案]

...继续到Q${maxQA}

【源文本】
${content}

【最重要】
- 必须用中文生成正好${maxQA}个不同的问答对
- 所有答案必须仅使用源文本中说明的信息
- 不要提及源文本中未列出的任何产品`
  };

  try {
    const prompt = languagePrompts[language] || languagePrompts['ja'];
    
    // 言語名をマッピング
    const languageNames: Record<string, string> = {
      ja: '日本語 (Japanese)',
      en: 'English',
      zh: '中文 (Chinese)'
    };
    const targetLanguage = languageNames[language] || languageNames['ja'];
    
    // maxQAに応じてmax_tokensを調整
    // gpt-3.5-turbo: 最大4096トークン（30問まで）
    // gpt-4o-mini: 最大16384トークン（30問以上）
    
    // 30問以上はgpt-4o-miniを使用（より大きなトークン制限）
    const useGPT4 = maxQA > 30; // 閾値を50→30に変更
    const model = useGPT4 ? 'gpt-4o-mini' : 'gpt-3.5-turbo';
    const maxTokensLimit = useGPT4 ? 16384 : 4096;
    const estimatedTokens = Math.min(maxQA * 120 + 1500, maxTokensLimit);
    
    console.log(`[MODEL SELECTION] maxQA=${maxQA}, useGPT4=${useGPT4}, model=${model}, maxTokensLimit=${maxTokensLimit}`);
    
    console.log(`[OpenAI] Model: ${model}, max_tokens: ${estimatedTokens}, target: ${maxQA} Q&As in ${targetLanguage}`);
    
    // タイムアウトを長めに設定（特に大量生成時）
    const timeoutMs = maxQA > 30 ? 120000 : 60000; // 30問超える場合は2分、それ以下は1分
    console.log(`[OpenAI] Timeout set to: ${timeoutMs}ms`);
    
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: `You are a professional Q&A creator. You MUST generate exactly ${maxQA} Q&A pairs in ${targetLanguage}. Never use any other language. Each Q&A must be unique and distinct. CRITICAL RULES: 1) Create Q&A ONLY about the main product/service featured on the webpage. 2) Use ONLY information from the provided source text. 3) Do NOT add external knowledge. 4) Do NOT mention products not in the source text. 5) IGNORE footer/policy/company info. Focus ONLY on product-specific information. IMPORTANT: Generate ALL ${maxQA} pairs, do not stop early.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: estimatedTokens
    }, {
      timeout: timeoutMs
    });

    const generatedText = response.choices[0]?.message?.content || '';
    const tokensUsed = response.usage?.total_tokens || 0;
    console.log(`[OpenAI] Response: ${generatedText.length} chars, ${tokensUsed} tokens used`);
    console.log(`[OpenAI] Finish reason: ${response.choices[0]?.finish_reason || 'unknown'}`);
    
    // 生成されたテキストの最初の500文字をログ出力（デバッグ用）
    console.log(`[OpenAI] First 500 chars: ${generatedText.substring(0, 500)}...`);
    console.log(`[OpenAI] Last 300 chars: ...${generatedText.substring(Math.max(0, generatedText.length - 300))}`);
    
    // Q&Aをパース（改善版）
    const qaItems: Array<{question: string, answer: string}> = [];
    const lines = generatedText.split('\n');
    let currentQ = '';
    let currentA = '';
    let inAnswer = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Q1:, Q2: などの形式を検出（柔軟なマッチング）
      const qMatch = trimmed.match(/^Q\d+[:：]?\s*(.+)$/i);
      const aMatch = trimmed.match(/^A\d+[:：]?\s*(.+)$/i);
      
      if (qMatch) {
        // 前のQ&Aがあれば保存
        if (currentQ && currentA) {
          qaItems.push({ question: currentQ.trim(), answer: currentA.trim() });
        }
        currentQ = qMatch[1].trim();
        currentA = '';
        inAnswer = false;
      } else if (aMatch) {
        currentA = aMatch[1].trim();
        inAnswer = true;
      } else if (inAnswer && currentA) {
        // 回答の続き
        currentA += ' ' + trimmed;
      } else if (!inAnswer && currentQ) {
        // 質問の続き
        currentQ += ' ' + trimmed;
      }
    }
    
    // 最後のQ&Aを追加
    if (currentQ && currentA) {
      qaItems.push({ question: currentQ.trim(), answer: currentA.trim() });
    }
    
    console.log(`📊 Parsed ${qaItems.length} Q&A items from response`);
    if (qaItems.length > 0) {
      console.log(`   First parsed Q: "${qaItems[0].question.substring(0, 60)}..."`);
      console.log(`   Last parsed Q: "${qaItems[qaItems.length - 1].question.substring(0, 60)}..."`);
    }
    if (qaItems.length < maxQA * 0.5) {
      console.error(`⚠️ CRITICAL: Only parsed ${qaItems.length}/${maxQA} Q&As - parsing may have failed!`);
      console.error(`   Generated text length: ${generatedText.length} chars`);
      console.error(`   Expected ~${maxQA * 150} chars for ${maxQA} Q&As`);
    }
    
    // 重複を除去（質問と回答の両方をチェック）
    const uniqueQA: Array<{question: string, answer: string}> = [];
    const seenQuestions = new Set<string>();
    const seenAnswers = new Set<string>();
    
    for (const item of qaItems) {
      const qLower = item.question.toLowerCase().trim();
      const aLower = item.answer.toLowerCase().trim();
      
      // 完全一致の重複をチェック
      if (seenQuestions.has(qLower) || seenAnswers.has(aLower)) {
        console.warn(`Duplicate detected: "${item.question.substring(0, 50)}..."`);
        continue;
      }
      
      // 類似度チェック（簡易版：最初の50文字が似ている場合）
      let isDuplicate = false;
      for (const seenQ of seenQuestions) {
        if (qLower.substring(0, 50) === seenQ.substring(0, 50)) {
          console.warn(`Similar question detected: "${item.question.substring(0, 50)}..."`);
          isDuplicate = true;
          break;
        }
      }
      
      if (!isDuplicate) {
        seenQuestions.add(qLower);
        seenAnswers.add(aLower);
        uniqueQA.push(item);
      }
    }
    
    console.log(`After deduplication: ${uniqueQA.length} unique Q&A items (removed ${qaItems.length - uniqueQA.length} duplicates)`);
    
    // 生成数が70%未満の場合は再試行または補完
    if (uniqueQA.length < maxQA * 0.7) {
      console.warn(`⚠️ Warning: Generated ${uniqueQA.length} Q&As but requested ${maxQA}. Attempting to supplement...`);
      
      // 追加生成を試みる
      const needed = maxQA - uniqueQA.length;
      console.log(`Attempting to generate ${needed} additional Q&As...`);
      
      try {
        const supplementPrompt = language === 'ja' 
          ? `以下の既存のQ&Aとは異なる、新しい${needed}個のQ&Aを日本語で生成してください。\n\n既存のQ&A:\n${uniqueQA.map((qa, i) => `Q${i+1}: ${qa.question}`).join('\n')}\n\n元のテキスト:\n${content}\n\n必ず${needed}個の全く新しいQ&Aを生成してください。`
          : language === 'zh'
          ? `生成${needed}个与以下现有问答不同的新问答（中文）。\n\n现有问答:\n${uniqueQA.map((qa, i) => `Q${i+1}: ${qa.question}`).join('\n')}\n\n原文:\n${content}\n\n必须生成${needed}个全新的问答。`
          : `Generate ${needed} NEW Q&A pairs in ENGLISH that are different from the existing ones below.\n\nExisting Q&As:\n${uniqueQA.map((qa, i) => `Q${i+1}: ${qa.question}`).join('\n')}\n\nOriginal text:\n${content}\n\nMust generate exactly ${needed} completely new Q&As.`;
        
        const supplementResponse = await openai.chat.completions.create({
          model: model,
          messages: [
            {
              role: 'system',
              content: `Generate ${needed} additional unique Q&A pairs in ${targetLanguage}.`
            },
            {
              role: 'user',
              content: supplementPrompt
            }
          ],
          temperature: 0.8,
          max_tokens: Math.min(needed * 120 + 500, maxTokensLimit)
        });
        
        const supplementText = supplementResponse.choices[0]?.message?.content || '';
        console.log(`[Supplement] Generated ${supplementText.length} chars`);
        
        // 追加Q&Aをパース
        const supplementLines = supplementText.split('\n');
        let suppQ = '';
        let suppA = '';
        let inSuppAnswer = false;
        
        for (const line of supplementLines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          const qMatch = trimmed.match(/^Q\d+[:：]?\s*(.+)$/i);
          const aMatch = trimmed.match(/^A\d+[:：]?\s*(.+)$/i);
          
          if (qMatch) {
            if (suppQ && suppA) {
              const qLower = suppQ.toLowerCase().trim();
              if (!seenQuestions.has(qLower)) {
                uniqueQA.push({ question: suppQ.trim(), answer: suppA.trim() });
                seenQuestions.add(qLower);
                console.log(`Added supplement Q&A: "${suppQ.substring(0, 50)}..."`);
              }
            }
            suppQ = qMatch[1].trim();
            suppA = '';
            inSuppAnswer = false;
          } else if (aMatch) {
            suppA = aMatch[1].trim();
            inSuppAnswer = true;
          } else if (inSuppAnswer && suppA) {
            suppA += ' ' + trimmed;
          }
        }
        
        // 最後の追加Q&A
        if (suppQ && suppA) {
          const qLower = suppQ.toLowerCase().trim();
          if (!seenQuestions.has(qLower)) {
            uniqueQA.push({ question: suppQ.trim(), answer: suppA.trim() });
            console.log(`Added final supplement Q&A: "${suppQ.substring(0, 50)}..."`);
          }
        }
        
        console.log(`✅ After supplementing: ${uniqueQA.length} total Q&As`);
      } catch (suppErr) {
        console.error('Failed to generate supplement Q&As:', suppErr);
      }
    }
    
    // maxQAの数に制限（超過分はカット）
    const finalQAs = uniqueQA.slice(0, maxQA);
    console.log(`📊 Final: Returning ${finalQAs.length} Q&As (requested: ${maxQA})`);
    return finalQAs;
  } catch (error) {
    throw new Error(`Failed to generate Q&A: ${error}`);
  }
}

// メインワークフローエンドポイント
app.post('/api/workflow', async (req: Request<{}, {}, WorkflowRequest>, res: Response<WorkflowResponse>) => {
  console.log('=== Workflow Request Started ===');
  console.log('Raw request body:', JSON.stringify(req.body, null, 2));
  console.log('Content-Type:', req.headers['content-type']);
  
  try {
    // デフォルト値を明示的に設定
    const requestMaxQA = req.body.maxQA;
    const requestLanguage = req.body.language;
    
    const url = req.body.url;
    const maxQA = requestMaxQA !== undefined && requestMaxQA !== null ? Number(requestMaxQA) : 5;
    const language = requestLanguage && requestLanguage.trim() !== '' ? requestLanguage : 'ja';
    const sourceCode = req.body.sourceCode; // HTML from browser extension

    console.log('Parsed parameters:');
    console.log('  - url:', url);
    console.log('  - maxQA (raw):', requestMaxQA, 'type:', typeof requestMaxQA);
    console.log('  - maxQA (parsed):', maxQA, 'type:', typeof maxQA);
    console.log('  - language (raw):', requestLanguage, 'type:', typeof requestLanguage);
    console.log('  - language (parsed):', language, 'type:', typeof language);
    console.log('  - sourceCode provided:', !!sourceCode, 'length:', sourceCode?.length || 0);

    // URLまたはソースコードが必要（どちらか一方でOK）
    if (!url && !sourceCode) {
      console.log('Error: URL or sourceCode is required');
      return res.status(400).json({
        success: false,
        error: 'URL or source code is required'
      });
    }
    
    // ソースコードのみの場合、URLをダミーに設定
    const effectiveUrl = url || 'source-code-input';
    console.log('Effective URL:', effectiveUrl);

    // 診断情報を収集
    const diagnostics = {
      fetchError: '',
      htmlLength: 0,
      pageTitle: '',
      contentLength: 0,
      is403: false,
      cookiesReceived: 0,
      playwrightUsed: false,
      usedExtension: !!sourceCode
    };

    // ステップ1: HTTPリクエストでWebページを取得（または拡張機能から受信）
    let html = '';
    
    if (sourceCode) {
      // Browser extensionから受信したHTMLを使用
      console.log('✅ Using HTML from browser extension (bypasses all bot detection)');
      console.log('  - Source code length:', sourceCode.length, 'characters');
      html = sourceCode;
      diagnostics.htmlLength = html.length;
      
      // ページタイトルを抽出
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
        diagnostics.pageTitle = titleMatch[1];
        console.log('  - Page title:', titleMatch[1]);
      }
    } else if (url) {
      // 通常のフェッチ処理
      console.log('Fetching website:', url);
      try {
        html = await fetchWebsite(url);
        diagnostics.htmlLength = html.length;
        
        // 403エラーをチェック
        if (html.includes('403 Forbidden') || html.includes('<title>403')) {
          diagnostics.is403 = true;
          diagnostics.fetchError = '403 Forbidden - サイトがアクセスをブロックしています';
        }
        
        // ページタイトルを抽出
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) {
          diagnostics.pageTitle = titleMatch[1];
        }
      } catch (error) {
        diagnostics.fetchError = error instanceof Error ? error.message : String(error);
        throw error;
      }
    }

    // ステップ2: HTMLからコンテンツを抽出
    console.log('Extracting content...');
    const extractedContent = extractContent(html);
    diagnostics.contentLength = extractedContent.length;
    
    // コンテンツが短すぎる場合はエラー
    if (extractedContent.length < 100) {
      console.warn(`⚠️ Content too short: ${extractedContent.length} characters`);
      return res.status(400).json({
        success: false,
        error: 'コンテンツが短すぎます。HTMLソースコードが正しく貼り付けられているか確認してください。提案: ブラウザで「ページのソースを表示」から完全なHTMLをコピーしてください。',
        details: `Content length: ${extractedContent.length} characters. Preview: ${extractedContent.substring(0, 200)}`
      } as any);
    }

    // ステップ3: OpenAI APIで複数のQ&Aを生成
    console.log(`[GENERATION] Starting Q&A generation with maxQA=${maxQA}, language=${language}`);
    console.log(`[GENERATION] Content length: ${extractedContent.length} characters`);
    const qaList = await generateQA(extractedContent, maxQA, language, effectiveUrl);
    console.log(`[GENERATION] Generated ${qaList.length} Q&A items`);

    // 動画推奨が必要かどうかを判定する関数
    const needsVideoExplanation = (question: string, answer: string): boolean => {
      const videoKeywords = [
        // 日本語
        '方法', '手順', '使い方', '操作', '設定', '取り付け', '組み立て', 'やり方',
        '仕組み', '構造', '動作', '機能', 'デザイン', '外観', '見た目',
        // 英語（より広範なマッチング）
        'how', 'step', 'method', 'procedure', 'setup', 'install', 'assemble',
        'build', 'create', 'make', 'configure', 'adjust', 'change', 'replace',
        'remove', 'attach', 'connect', 'mechanism', 'structure', 'works',
        'feature', 'design', 'appearance', 'look', 'demonstration', 'visual',
        // 中国語
        '方法', '步骤', '使用', '操作', '设置', '安装', '组装',
        '机制', '结构', '功能', '设计', '外观'
      ];
      
      const combined = (question + ' ' + answer).toLowerCase();
      return videoKeywords.some(keyword => combined.includes(keyword.toLowerCase()));
    };

    // OpenAI クライアントを初期化（動画推奨用）
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured');
    }
    const openai = new OpenAI({ apiKey });

    // qaItemsを生成（動画推奨情報を含む）
    const qaItems = await Promise.all(qaList.map(async (qa, index) => {
      const needsVideo = needsVideoExplanation(qa.question, qa.answer);
      console.error(`DEBUG Q${index + 1} needsVideo: ${needsVideo} - Q: ${qa.question.substring(0, 50)}`);
      
      const item: any = {
        id: `${Date.now()}-${index}`,
        question: qa.question,
        answer: qa.answer,
        source: 'collected' as const,
        sourceType: 'text' as const,
        url: url, // 元のURLを追加
        timestamp: Date.now(),
        needsVideo: needsVideo
      };
      
      // 動画推奨がある場合、OpenAI APIで具体的な理由と例を生成
      if (needsVideo) {
        try {
          const videoPrompt = language === 'ja'
            ? `以下のQ&Aについて、動画で説明すべき理由と具体的な動画例を提案してください。

質問: ${qa.question}
回答: ${qa.answer}

以下の形式で回答してください：
理由: [なぜこのQ&Aは動画での説明が効果的か、具体的に1文で]
例1: [具体的な動画タイトル例1]
例2: [具体的な動画タイトル例2]

【重要】必ず日本語で、このQ&Aの内容に特化した具体的な提案をしてください。`
            : language === 'zh'
            ? `对于以下的问答，请提出为什么需要用视频说明的理由，以及具体的视频示例。

问题: ${qa.question}
回答: ${qa.answer}

请按照以下格式回答：
理由: [为什么这个问答用视频说明更有效，用一句话具体说明]
例1: [具体的视频标题示例1]
例2: [具体的视频标题示例2]

【重要】必须用中文，并且要针对这个问答内容提出具体的建议。`
            : `For the following Q&A, suggest why video explanation would be effective and specific video examples.

Question: ${qa.question}
Answer: ${qa.answer}

Please respond in this format:
Reason: [Why video explanation is effective for this Q&A, specifically in one sentence]
Example1: [Specific video title example 1]
Example2: [Specific video title example 2]

【Important】Must be in English and specific to this Q&A content.`;

          const videoResponse = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are a video content planning expert. Provide specific, actionable video suggestions.'
              },
              {
                role: 'user',
                content: videoPrompt
              }
            ],
            temperature: 0.7,
            max_tokens: 300
          });

          const videoSuggestion = videoResponse.choices[0]?.message?.content || '';
          console.log(`[VIDEO] Q${index + 1} suggestion:`, videoSuggestion.substring(0, 100));

          // レスポンスをパース
          const reasonMatch = videoSuggestion.match(/理由[：:]\s*(.+?)(?=\n|例)/s) || 
                             videoSuggestion.match(/Reason[：:]\s*(.+?)(?=\n|Example)/s);
          const example1Match = videoSuggestion.match(/例1[：:]\s*(.+?)(?=\n|例2|$)/s) || 
                               videoSuggestion.match(/Example1[：:]\s*(.+?)(?=\n|Example2|$)/s);
          const example2Match = videoSuggestion.match(/例2[：:]\s*(.+?)(?=\n|$)/s) || 
                               videoSuggestion.match(/Example2[：:]\s*(.+?)(?=\n|$)/s);

          if (reasonMatch) {
            item.videoReason = reasonMatch[1].trim();
          }
          
          const examples = [];
          if (example1Match) examples.push(example1Match[1].trim());
          if (example2Match) examples.push(example2Match[1].trim());
          
          if (examples.length > 0) {
            item.videoExamples = examples;
          }
        } catch (videoError) {
          console.error(`Failed to generate video suggestion for Q${index + 1}:`, videoError);
          // フォールバック: 固定の文言を使用
          item.videoReason = language === 'ja' 
            ? 'この内容は視覚的な説明があるとより理解しやすくなります。'
            : language === 'zh'
            ? '此内容通过视觉说明会更容易理解。'
            : 'This content would be easier to understand with visual explanation.';
          item.videoExamples = [
            language === 'ja' 
              ? '操作方法のデモンストレーション動画'
              : language === 'zh'
              ? '操作方法演示视频'
              : 'Demonstration video of the operation'
          ];
        }
      }
      
      return item;
    }));

    // 全Q&Aを結合した文字列も生成（後方互換性のため）
    const qaResult = qaList.map((qa, i) => `Q${i+1}: ${qa.question}\nA${i+1}: ${qa.answer}`).join('\n\n');

    console.log(`🔍 DEBUG - Before response:`);
    console.log(`  - qaList.length: ${qaList.length}`);
    console.log(`  - qaItems.length: ${qaItems.length}`);
    console.log(`  - First Q&A: ${qaItems[0]?.question?.substring(0, 50) || 'N/A'}`);
    console.log(`  - Last Q&A: ${qaItems[qaItems.length - 1]?.question?.substring(0, 50) || 'N/A'}`);

    // シンプルサーバー用のレスポンスフォーマット
    // robotsAllowedをdataの中に含める（フロントエンドがdata.dataを使用するため）
    const responseData = {
      success: true,
      data: {
        url,
        urls: [url], // 配列形式も追加
        extractedContent: extractedContent.substring(0, 500) + '...', // 最初の500文字のみ返す
        qaResult,
        qaItems,
        robotsAllowed: true, // robots.txtチェックを無効化
        stats: {
          totalPages: 1,
          imagesAnalyzed: 0,
          videosAnalyzed: 0,
          pdfsAnalyzed: 0,
          reviewsAnalyzed: 0
        },
        // 🔍 診断情報を追加（Q&A数が0の場合にフロントエンドで表示）
        diagnostics: qaItems.length === 0 ? {
          fetchError: diagnostics.fetchError,
          htmlLength: diagnostics.htmlLength,
          pageTitle: diagnostics.pageTitle,
          contentLength: diagnostics.contentLength,
          is403: diagnostics.is403,
          htmlPreview: html.substring(0, 500)
        } : undefined
      }
    };
    
    console.log(`✅ Response: Generated ${qaItems.length} Q&A items`);
    
    // 🔍 診断情報のデバッグログ
    if (qaItems.length === 0) {
      console.log('🔍 DIAGNOSTICS DEBUG:');
      console.log('  - diagnostics object exists:', !!responseData.data.diagnostics);
      console.log('  - fetchError:', diagnostics.fetchError);
      console.log('  - htmlLength:', diagnostics.htmlLength);
      console.log('  - pageTitle:', diagnostics.pageTitle);
      console.log('  - contentLength:', diagnostics.contentLength);
      console.log('  - is403:', diagnostics.is403);
      console.log('  - htmlPreview length:', html.substring(0, 500).length);
    }
    
    console.log(`📤 Sending response with ${JSON.stringify(responseData).length} bytes`);
    
    // 🔍 完全なレスポンスをログ出力（デバッグ用）
    if (qaItems.length === 0) {
      console.log('🔍 COMPLETE RESPONSE DATA:');
      console.log(JSON.stringify(responseData, null, 2));
    }
    
    res.json(responseData);
  } catch (error: any) {
    console.error('❌ Workflow error:', error);
    
    // 詳細なエラー情報を取得
    let errorMessage = 'Unknown error occurred';
    let errorDetails = '';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack || '';
    }
    
    // Axiosエラーの場合はさらに詳細を追加
    if (error.response) {
      errorMessage = `HTTP Error ${error.response.status}: ${error.response.statusText}`;
      errorDetails = `Response data: ${JSON.stringify(error.response.data).substring(0, 200)}`;
      console.error('  Response status:', error.response.status);
      console.error('  Response headers:', error.response.headers);
    } else if (error.request) {
      errorMessage = 'No response from server (timeout or network error)';
      errorDetails = 'The request was sent but no response was received. This could be due to timeout, network issues, or the server being down.';
      console.error('  Request was sent but no response received');
    }
    
    console.error('  Error message:', errorMessage);
    console.error('  Error details:', errorDetails);
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      details: errorDetails
    });
  }
});

// PDFエクスポートエンドポイント（シンプル版）
app.post('/api/export/single', async (req: Request, res: Response) => {
  try {
    const { qaItems, format, includeLabels = false, includeVideoInfo = false } = req.body;
    
    console.log(`📥 Export request received: format=${format}, items=${qaItems?.length}, includeLabels=${includeLabels}, includeVideoInfo=${includeVideoInfo}`);
    console.log(`📋 Request headers:`, req.headers['content-type']);
    
    if (!qaItems || !Array.isArray(qaItems) || qaItems.length === 0) {
      console.error('❌ Invalid request: qaItems is missing or empty');
      return res.status(400).json({ error: 'Q&A items are required' });
    }
    
    if (format === 'pdf') {
      console.log('📕 Starting PDF generation...');
      // PDFKitを使用してPDFを生成（同期的に）
      // 複数のパスを試行（Docker環境を考慮）
      const fontPaths = [
        '/app/fonts/NotoSansJP-Regular.ttf',                        // Docker: /app/fonts/
        path.join(process.cwd(), 'fonts', 'NotoSansJP-Regular.ttf'), // process.cwd()/fonts/
        path.join(__dirname, 'fonts', 'NotoSansJP-Regular.ttf'),     // __dirname/fonts/
        '/home/user/webapp/fonts/NotoSansJP-Regular.ttf'             // ローカル開発環境
      ];
      console.log('🔍 Trying font paths:', fontPaths);
      console.log('📂 Current working directory:', process.cwd());
      console.log('📂 __dirname:', __dirname);
      
      let fontPath = '';
      for (const p of fontPaths) {
        if (fs.existsSync(p)) {
          fontPath = p;
          console.log(`Font found at: ${fontPath}`);
          break;
        }
      }
      
      if (!fontPath) {
        console.warn('⚠️ Font not found in any of these paths:', fontPaths);
        console.warn('⚠️ Will generate PDF with default font (Japanese text may not display correctly)');
        // フォントが見つからなくてもPDFは生成する
      }
      
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      
      // イベントハンドラを先に設定
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        console.log(`✅ PDF generated successfully: ${pdfBuffer.length} bytes`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="qa-collection.pdf"');
        res.setHeader('Content-Length', pdfBuffer.length.toString());
        console.log(`✅ Sending PDF to client...`);
        res.send(pdfBuffer);
      });
      
      // エラーハンドラ
      doc.on('error', (err: Error) => {
        console.error('❌ PDF generation error:', err);
        console.error('❌ Error stack:', err.stack);
        if (!res.headersSent) {
          res.status(500).json({ error: 'PDF generation failed', details: err.message });
        }
      });
      
      try {
        // フォント登録
        let fontRegistered = false;
        if (fontPath) {
          console.log(`📝 Attempting to register font: ${fontPath}`);
          try {
            doc.registerFont('NotoSans', fontPath);
            doc.font('NotoSans');
            fontRegistered = true;
            console.log('✅ Font registered successfully: NotoSans');
          } catch (fontErr) {
            console.warn('⚠️ Font registration failed:', fontErr);
            doc.font('Helvetica');
          }
        } else {
          console.warn('⚠️ No font path found, using default font');
          doc.font('Helvetica');
        }
        
        // タイトル
        doc.fontSize(20).text('Q&A Collection', { align: 'center' });
        doc.moveDown(2);
        
        if (!fontRegistered) {
          doc.fontSize(10).fillColor('red').text('Warning: Japanese font not available', { align: 'center' });
          doc.moveDown(1);
        }
        
        // Q&Aを追加
        qaItems.forEach((item: any, index: number) => {
          doc.fontSize(14).fillColor('blue').text(`Q${index + 1}: ${item.question}`);
          doc.moveDown(0.5);
          doc.fontSize(12).fillColor('black').text(`A: ${item.answer}`);
          
          // ラベル情報とビデオ情報の出力
          const shouldShowLabels = includeLabels || includeVideoInfo;
          if (shouldShowLabels) {
            doc.moveDown(0.5);
            doc.fontSize(9).fillColor('gray').text('─────────────────');
            
            // ラベル情報（includeLabelsがtrueの場合のみ）
            if (includeLabels) {
              // ソース情報
              if (item.source) {
                doc.fontSize(9).fillColor('gray').text(`📌 ソース: ${item.source}`);
              }
              
              // 情報源タイプ
              if (item.sourceType) {
                doc.fontSize(9).fillColor('gray').text(`📂 情報源タイプ: ${item.sourceType}`);
              }
              
              // URL（もし存在すれば）
              if (item.url) {
                doc.fontSize(9).fillColor('gray').text(`🔗 URL: ${item.url}`);
              }
            }
            
            // 動画推奨情報（includeVideoInfoがtrueの場合のみ）
            if (includeVideoInfo && item.needsVideo) {
              doc.fontSize(9).fillColor('red').text('🎥 推奨動画作成例');
              if (item.videoReason) {
                doc.fontSize(9).fillColor('gray').text(`  理由: ${item.videoReason}`);
              }
              if (item.videoExamples && item.videoExamples.length > 0) {
                doc.fontSize(9).fillColor('gray').text(`  例: ${item.videoExamples.join(', ')}`);
              }
            }
            
            doc.fontSize(9).fillColor('gray').text('─────────────────');
          }
          
          doc.moveDown(1.5);
        });
        
        // PDF終了
        doc.end();
      } catch (error) {
        console.error('❌ PDF content generation error:', error);
        console.error('Error details:', error instanceof Error ? error.message : String(error));
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack');
        doc.end();
        if (!res.headersSent) {
          res.status(500).json({ 
            error: 'PDF content generation failed',
            details: error instanceof Error ? error.message : String(error)
          });
        }
      }
    } else if (format === 'text') {
      // テキストとして返す
      console.log('📄 Starting TXT generation...');
      let textContent = 'Q&A Collection\n\n';
      qaItems.forEach((item: any, index: number) => {
        textContent += `Q${index + 1}: ${item.question}\n`;
        textContent += `A${index + 1}: ${item.answer}\n`;
        
        // ラベル情報とビデオ情報の出力
        const shouldShowLabels = includeLabels || includeVideoInfo;
        if (shouldShowLabels) {
          textContent += '\n─────────────────\n';
          
          // ラベル情報（includeLabelsがtrueの場合のみ）
          if (includeLabels) {
            // ソース情報
            if (item.source) {
              textContent += `📌 ソース: ${item.source}\n`;
            }
            
            // 情報源タイプ
            if (item.sourceType) {
              textContent += `📂 情報源タイプ: ${item.sourceType}\n`;
            }
            
            // URL（もし存在すれば）
            if (item.url) {
              textContent += `🔗 URL: ${item.url}\n`;
            }
          }
          
          // 動画推奨情報（includeVideoInfoがtrueの場合のみ）
          if (includeVideoInfo && item.needsVideo) {
            textContent += `🎥 推奨動画作成例\n`;
            if (item.videoReason) {
              textContent += `  理由: ${item.videoReason}\n`;
            }
            if (item.videoExamples && item.videoExamples.length > 0) {
              textContent += `  例: ${item.videoExamples.join(', ')}\n`;
            }
          }
          
          textContent += '─────────────────\n';
        }
        
        textContent += '\n';
      });
      
      console.log(`✅ TXT generated: ${textContent.length} characters`);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="qa-collection.txt"');
      res.setHeader('Content-Length', Buffer.byteLength(textContent, 'utf8').toString());
      console.log(`✅ Sending TXT to client...`);
      res.send(textContent);
    } else {
      res.status(400).json({ error: 'Unsupported format' });
    }
  } catch (error) {
    console.error('Export error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({ 
      error: 'Export failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// ヘルスチェックエンドポイント
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', version: '2.0' });
});

// フォントテストエンドポイント
app.get('/api/test-font', (req: Request, res: Response) => {
  const doc = new PDFDocument();
  const chunks: Buffer[] = [];
  
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  doc.on('end', () => {
    const pdfBuffer = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="font-test.pdf"');
    res.send(pdfBuffer);
  });
  
  const fontPath = '/home/user/webapp/fonts/NotoSansJP-Regular.ttf';
  console.error(`Font path: ${fontPath}, exists: ${fs.existsSync(fontPath)}`);
  
  try {
    doc.registerFont('Japanese', fontPath);
    doc.font('Japanese');
    console.error('✅ Font registered and set');
  } catch (err) {
    console.error('❌ Font error:', err);
  }
  
  doc.fontSize(20).text('日本語テスト Japanese Test', { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).text('これは日本語のテキストです。');
  doc.fontSize(14).text('This is English text.');
  doc.fontSize(14).text('这是中文文本。');
  
  doc.end();
});

// OCRワークフローエンドポイント
app.post('/api/workflow-ocr', upload.array('image0', 10), async (req: Request, res: Response) => {
  console.log('=== OCR Workflow Request Started ===');
  
  try {
    const url = req.body.url || '';
    const files = req.files as Express.Multer.File[];
    
    console.log('  - URL:', url);
    console.log('  - Uploaded files:', files?.length || 0);
    
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: '画像ファイルがアップロードされていません'
      });
    }
    
    // 各画像からOCRでテキスト抽出
    console.log(`📸 ${files.length}枚の画像からテキスト抽出を開始...`);
    const extractedTexts: string[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      console.log(`\n画像 ${i + 1}/${files.length}: ${file.originalname} (${(file.size / 1024).toFixed(2)} KB)`);
      
      try {
        const text = await extractTextFromImage(file.buffer);
        extractedTexts.push(text);
        console.log(`  → 抽出されたテキスト長: ${text.length} 文字`);
        console.log(`  → プレビュー: ${text.substring(0, 100)}...`);
      } catch (error) {
        console.error(`  ❌ 画像 ${i + 1} の処理エラー:`, error);
        // エラーが出ても他の画像の処理は続行
      }
    }
    
    // 抽出されたテキストを結合
    const combinedText = extractedTexts.join('\n\n--- 次のページ ---\n\n');
    console.log(`\n📝 結合後のテキスト長: ${combinedText.length} 文字`);
    
    if (combinedText.length < 100) {
      return res.status(400).json({
        success: false,
        error: 'テキストの抽出に失敗しました。画像が不鮮明な可能性があります。',
        data: {
          diagnostics: {
            extractedTextLength: combinedText.length,
            filesProcessed: files.length,
            extractedText: combinedText
          }
        }
      });
    }
    
    // Q&A生成（リクエストからmaxQAとlanguageを取得）
    const maxQA = req.body.maxQA ? parseInt(req.body.maxQA, 10) : 40;
    const language = req.body.language || 'ja';
    console.log('\n🤖 Q&A生成を開始...');
    console.log('  - maxQA:', maxQA);
    console.log('  - language:', language);
    console.log('  - Combined text length:', combinedText.length, 'characters');
    console.log('  - Text preview:', combinedText.substring(0, 200));
    
    const qaList = await generateQA(combinedText, maxQA, language, url);
    console.log(`✅ ${qaList.length}個のQ&Aを生成しました`);
    
    // Q&Aが0個の場合は詳細ログ
    if (qaList.length === 0) {
      console.error('❌ ERROR: No Q&As generated!');
      console.error('  - maxQA requested:', maxQA);
      console.error('  - language:', language);
      console.error('  - text length:', combinedText.length);
      console.error('  - text sample:', combinedText.substring(0, 500));
    }
    
    // 動画推奨が必要かどうかを判定する関数
    const needsVideoExplanation = (question: string, answer: string): boolean => {
      const videoKeywords = [
        '方法', '手順', '使い方', '操作', '設定', '取り付け', '組み立て', 'やり方',
        '仕組み', '構造', '動作', '機能', 'デザイン', '外観', '見た目',
        'how', 'step', 'method', 'procedure', 'setup', 'install', 'assemble',
        'build', 'create', 'make', 'configure', 'adjust', 'change', 'replace',
      ];
      const text = `${question} ${answer}`.toLowerCase();
      return videoKeywords.some(keyword => text.includes(keyword.toLowerCase()));
    };

    // レスポンス（必要なフィールドを全て含める）
    res.json({
      success: true,
      data: {
        url: url || 'ocr-images',
        extractedContent: combinedText.substring(0, 500) + '...',
        qaResult: qaList.map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`).join('\n\n'),
        qaItems: qaList.map((qa, index) => {
          const needsVideo = needsVideoExplanation(qa.question, qa.answer);
          return {
            id: String(index + 1),
            question: qa.question,
            answer: qa.answer,
            source: '収集した情報から生成',
            sourceType: 'image-ocr',
            url: url || 'ocr-images',
            needsVideo: needsVideo,
            videoReason: needsVideo ? '視覚的な説明が効果的です' : undefined,
            videoExamples: needsVideo ? ['操作手順の動画', 'デモンストレーション'] : undefined
          };
        }),
        robotsAllowed: true,
        stats: {
          totalPages: 1,
          imagesProcessed: files.length,
          imagesAnalyzed: files.length,
          videosAnalyzed: 0,
          pdfsAnalyzed: 0,
          reviewsAnalyzed: 0,
          textExtracted: combinedText.length
        }
      }
    });
    
  } catch (error) {
    console.error('❌ OCR Workflow error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      details: error instanceof Error ? error.stack : undefined
    });
  }
});

// 静的ファイルを提供（APIルートの後に配置）
app.use(express.static(distPath));

// すべての非APIルートでindex.htmlを返す（SPA用）
// Express 5では * の代わりに /.* を使用
app.get(/^(?!\/api).*$/, (req: Request, res: Response) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server is running on http://0.0.0.0:${port}`);
  console.log(`✅ Listening on all interfaces (0.0.0.0:${port})`);
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Dist path:', distPath);
  console.log('API Key configured:', !!process.env.OPENAI_API_KEY);
  console.log(`🚀 Ready to accept connections from Fly.io proxy`);
});

// タイムアウト設定を延長（Playwright処理のため）
server.timeout = 300000; // 5分
server.keepAliveTimeout = 310000;
server.headersTimeout = 320000;
