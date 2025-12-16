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
  includeTypes?: {
    collected: boolean; // 収集情報ベースのQ&A
    suggested: boolean; // 想定Q&A
  };
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
  
  console.log('🔍 Extracting content with JSON-LD + PRODUCT-FIRST algorithm...');
  console.log(`📄 Original HTML length: ${html.length} bytes`);
  
  // デバッグ: タイトルを確認
  const pageTitle = $('title').text();
  console.log(`📌 Page title: ${pageTitle}`);
  
  // 【ステップ0】JSON-LD構造化データを優先的に抽出（最優先）
  let jsonLdContent = '';
  $('script[type="application/ld+json"]').each((_, elem) => {
    try {
      const jsonText = $(elem).html();
      if (jsonText) {
        const jsonData = JSON.parse(jsonText);
        // Productタイプのみを抽出
        if (jsonData['@type'] === 'Product') {
          console.log('✅ Found Product JSON-LD data');
          const product = jsonData;
          jsonLdContent += `商品名: ${product.name || ''}\n`;
          jsonLdContent += `説明: ${product.description || ''}\n`;
          jsonLdContent += `カテゴリ: ${product.category || ''}\n`;
          jsonLdContent += `ブランド: ${product.brand?.name || ''}\n`;
          jsonLdContent += `価格: ${product.offers?.price || ''}円\n`;
          jsonLdContent += `サイズ: ${product.size?.name || ''}\n`;
          jsonLdContent += `色: ${product.color || ''}\n`;
          jsonLdContent += `SKU: ${product.sku || ''}\n`;
          // 在庫状況は除外（在庫関連Q&A生成を防ぐため）
          // jsonLdContent += `在庫状況: ${product.offers?.availability?.includes('InStock') ? '在庫あり' : ''}\n`;
          console.log('📦 JSON-LD product info extracted:', jsonLdContent.length, 'chars');
        }
      }
    } catch (err) {
      console.warn('⚠️ Failed to parse JSON-LD:', err);
    }
  });
  
  // JSON-LDが見つかった場合、これを優先的に使用
  if (jsonLdContent.length > 100) {
    console.log('✅ Using JSON-LD as primary content source');
    console.log(`📄 JSON-LD content: ${jsonLdContent}`);
    return jsonLdContent;
  }
  
  console.log('⚠️ No usable JSON-LD found, falling back to HTML extraction');
  
  // 【ステップ1】ノイズとなる要素を徹底的に削除（商品情報以外を全て除外）
  
  // A. スクリプト・スタイル・メタ情報
  $('script, style, noscript, iframe, svg, link, meta').remove();
  
  // B. ナビゲーション・ヘッダー・フッター
  $('nav, header, footer').remove();
  $('[class*="footer"], [id*="footer"]').remove();
  $('[class*="header"], [id*="header"]').remove();
  $('[class*="navigation"], [class*="nav"], [role="navigation"]').remove();
  $('[class*="menu"]').remove();
  $('[class*="breadcrumb"], [class*="bread-crumb"]').remove();
  
  // C. サイドバー・広告・バナー
  $('[class*="sidebar"], [class*="side-bar"], [class*="aside"], aside').remove();
  $('[class*="banner"], [class*="ad"], [class*="advertisement"], [class*="promo"]').remove();
  
  // D. SNS・シェア・コミュニティ機能
  $('[class*="share"], [class*="social"], [class*="sns"]').remove();
  $('[class*="comment"], [class*="review"], [class*="rating"]').remove();
  $('[class*="like"], [class*="favorite"], [class*="bookmark"]').remove();
  
  // E. サイトポリシー・会社情報
  $('[class*="policy"], [class*="terms"], [class*="privacy"]').remove();
  $('[class*="sitemap"], [class*="site-map"]').remove();
  $('[class*="company"], [class*="corporate"], [class*="about"]').remove();
  $('[class*="copyright"]').remove();
  
  // F. ヘルプ・サポート・お問い合わせ
  $('[class*="help"], [class*="faq"], [class*="guide"]').not('[class*="product"], [class*="usage"]').remove();
  $('[class*="contact"], [class*="support"], [class*="inquiry"]').remove();
  $('[class*="customer"], [class*="service"]').not('[class*="product"]').remove();
  
  // G. アカウント・会員・ログイン関連
  $('[class*="account"], [class*="login"], [class*="register"], [class*="signup"], [class*="signin"]').remove();
  $('[class*="member"], [class*="mypage"], [class*="profile"]').remove();
  
  // H. 購入・決済・配送関連（商品ページの購入ボタン以外）
  $('[class*="checkout"], [class*="payment"]').not('[class*="product"]').remove();
  $('[class*="shipping"], [class*="delivery"]').not('[class*="product"]').remove();
  $('[class*="store"], [class*="shop"]').not('[class*="product"]').remove();
  
  // I. ポイント・キャンペーン・特典
  $('[class*="point"], [class*="reward"], [class*="benefit"]').not('[class*="product"]').remove();
  $('[class*="campaign"], [class*="sale"], [class*="event"]').not('[class*="product"]').remove();
  $('[class*="coupon"], [class*="discount"]').not('[class*="product"]').remove();
  
  // J. その他の推奨・関連コンテンツ
  $('[class*="related"], [class*="recommend"], [class*="suggestion"]').remove();
  $('[class*="popular"], [class*="trending"], [class*="ranking"]').remove();
  $('[class*="recently"], [class*="history"]').remove();
  
  // K. クッキー・通知・モーダル
  $('[class*="cookie"], [id*="cookie"]').remove();
  $('[class*="modal"], [class*="popup"], [class*="overlay"]').not('[class*="product"]').remove();
  $('[class*="notification"], [class*="alert"], [class*="message"]').not('[class*="product"]').remove();
  $('[class*="newsletter"], [class*="subscribe"]').remove();
  
  // L. フォーム（商品関連以外）
  $('form').not('[class*="product"], [class*="cart"], [class*="wishlist"]').remove();
  $('input, select, textarea, button').not('[class*="product"], [class*="quantity"], [class*="size"], [class*="color"]').remove();
  
  // M. 店舗在庫・在庫確認システム関連（徹底的に削除）
  $('[class*="store-inventory"], [class*="storeInventory"], [id*="store-inventory"]').remove();
  $('[class*="store-stock"], [class*="storeStock"], [id*="store-stock"]').remove();
  $('[class*="store"], [class*="shop"]').not('[class*="product"], [class*="online"]').remove();
  $('[class*="stock"], [class*="inventory"]').not('[class*="product"]').remove();
  $('[class*="availability"]').not('[class*="product"]').remove();
  $('[class*="in-stock"], [class*="inStock"], [id*="in-stock"]').remove();
  $('[class*="out-of-stock"], [class*="outOfStock"], [id*="out-of-stock"]').remove();
  
  // 🚨 CRITICAL: 在庫関連のテキストを含む要素を完全削除
  $('*').filter(function() {
    const text = $(this).text();
    const inventoryKeywords = ['店舗在庫', '他の店舗', '在庫を確認', '在庫状況', '店舗の在庫', 
                                '在庫数', 'リアルタイム', '数分程度', '反映', '確認方法'];
    return inventoryKeywords.some(keyword => text.includes(keyword));
  }).remove();
  
  // N. テキストベースの削除（特定のフレーズを含む要素を削除）
  // 【重要】店舗在庫・サイト機能関連のフレーズを徹底的に削除
  const elementExcludePhrases = [
    '店舗在庫', '他の店舗', '在庫を確認', '店舗の在庫', '店舗から',
    '店舗受け取り', '店舗情報', '営業時間', 'ご来店', '来店',
    'お問い合わせ', '配送について', '送料について', '返品について',
    'ポイント', '会員登録', 'ログイン', 'マイページ',
    'お支払い方法', '決済方法', 'クレジットカード',
    '個人情報', 'プライバシー', '利用規約', '特定商取引法',
    'メールマガジン', 'ニュースレター',
    'よくある質問', 'FAQ', 'ヘルプ', 'ガイド',
    'お気に入り', 'ウィッシュリスト', 'カート', 'チェックアウト'
  ];
  
  $('*').each(function() {
    const elem = $(this);
    const text = elem.text();
    
    // 除外フレーズが含まれている場合、その要素を削除
    for (const phrase of elementExcludePhrases) {
      if (text.includes(phrase)) {
        elem.remove();
        return; // この要素は削除したので次へ
      }
    }
  });
  
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
    
    // 【追加フィルタリング】サイト機能関連のテキストを完全除外
    const textExcludePhrases = [
      '店舗在庫', '他の店舗', '在庫を確認', '店舗の在庫', '店舗から',
      '店舗受け取り', '店舗情報', '営業時間', 'ご来店', '来店',
      'お問い合わせ', '配送について', '送料について', '返品について',
      'ポイント', '会員登録', 'ログイン', 'マイページ',
      'お支払い方法', '決済方法', 'クレジットカード',
      '個人情報', 'プライバシー', '利用規約', '特定商取引法',
      'メールマガジン', 'ニュースレター',
      'よくある質問', 'FAQ', 'ヘルプ', 'ガイド',
      'お気に入り', 'ウィッシュリスト', 'カート', 'チェックアウト',
      'レビューを書く', '口コミ', '評価する'
    ];
    
    // 除外フレーズが含まれているテキストはスキップ
    const shouldExclude = textExcludePhrases.some(phrase => text.includes(phrase));
    if (shouldExclude) {
      return; // このテキストは除外
    }
    
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
  let cleanedContent = extractedContent
    .replace(/\s+/g, ' ') // 連続する空白を1つに
    .replace(/\n+/g, ' ') // 改行を空白に
    .trim();
  
  // 【最終フィルタリング】サイト機能関連のフレーズを含む文を削除
  const sentenceExcludePhrases = [
    // 在庫関連（最優先削除）
    '店舗在庫', '他の店舗', '在庫を確認', '店舗の在庫', '在庫の確認', '在庫状況',
    '店舗から', '店舗受け取り', '店舗情報', '営業時間', 'ご来店', '来店', 
    'アクセス方法', '実店舗', '取扱店舗', '在庫数', 'リアルタイム', '反映',
    '数分程度', '確認方法', '表示', '遅延', '入荷', '再入荷', '入荷予定',
    // サイト機能関連
    'お問い合わせ', '配送について', '送料について', '返品について', '交換について',
    'ポイント', '会員登録', 'ログイン', 'マイページ', 'アカウント',
    'お支払い方法', '決済方法', 'クレジットカード', '代金引換',
    '個人情報', 'プライバシー', '利用規約', '特定商取引法',
    'メールマガジン', 'ニュースレター', '購読',
    'よくある質問', 'FAQ', 'ヘルプ', 'ガイド', 'サポート',
    'お気に入り', 'ウィッシュリスト', 'カート', 'チェックアウト',
    'レビューを書く', '口コミ', '評価する', 'コメント'
  ];
  
  // 🚨 CRITICAL: 在庫関連テキストの完全削除（文単位 + 行単位）
  console.log(`🔍 PRE-FILTER content length: ${cleanedContent.length} chars`);
  
  // 方法1: 文単位で除外（句点で分割）
  const contentSentences = cleanedContent.split(/[。.！？\n]/);
  const filteredContentSentences = contentSentences.filter(sentence => {
    const shouldExclude = sentenceExcludePhrases.some(phrase => sentence.includes(phrase));
    if (shouldExclude) {
      console.log(`🗑️ Filtering out inventory sentence: "${sentence.substring(0, 80)}..."`);
    }
    return !shouldExclude;
  });
  cleanedContent = filteredContentSentences.join('。').trim();
  
  // 方法2: 行単位で除外（改行で分割）
  const contentLines = cleanedContent.split('\n');
  const filteredContentLines = contentLines.filter(line => {
    const shouldExclude = sentenceExcludePhrases.some(phrase => line.includes(phrase));
    if (shouldExclude) {
      console.log(`🗑️ Filtering out inventory line: "${line.substring(0, 80)}..."`);
    }
    return !shouldExclude;
  });
  cleanedContent = filteredContentLines.join('\n').trim();
  
  console.log(`✅ POST-FILTER content length: ${cleanedContent.length} chars`);
  
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
  
  // 【ステップ6】最終的なテキストフィルタリング - 在庫関連の文を削除
  const inventoryPhrases = [
    '店舗在庫', '他の店舗', '在庫を確認', '店舗の在庫', '在庫数', '在庫状況',
    '数分程度かかる', 'リアルタイム', '反映に', '確認方法', '店舗受け取り'
  ];
  
  const lines = finalContent.split('\n');
  const filteredLines = lines.filter(line => {
    // 在庫関連フレーズを含む行を除外
    for (const phrase of inventoryPhrases) {
      if (line.includes(phrase)) {
        console.log(`🗑️ Filtering out inventory line: ${line.substring(0, 50)}...`);
        return false;
      }
    }
    return true;
  });
  
  finalContent = filteredLines.join('\n');
  console.log(`🧹 After inventory filtering: ${finalContent.length} characters (removed ${lines.length - filteredLines.length} lines)`);
  
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

async function generateQA(content: string, maxQA: number = 5, language: string = 'ja', productUrl?: string, isOCRMode: boolean = false, qaType: 'collected' | 'suggested' | 'mixed' = 'collected'): Promise<Array<{question: string, answer: string, type?: 'collected' | 'suggested'}>> {
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
  // 重要な修正: URLモードは常に厳格なプロンプトを使用する
  // - OCRモード: 常に緩いプロンプト（ノイジーなデータのため）
  // - URLモード: 常に厳格なプロンプト（extractContent()の出力は高品質のため）
  const isLowContent = content.length < 500;
  const isVeryLowContent = isOCRMode ? true : false; // URLモードは常にfalse（厳格）
  
  console.log(`🔍 Content quality assessment:`);
  console.log(`  - isOCRMode: ${isOCRMode}`);
  console.log(`  - content.length: ${content.length}`);
  console.log(`  - isVeryLowContent: ${isVeryLowContent} (${isOCRMode ? 'OCR mode - always true' : 'URL mode - based on length'})`);
  
  const contentNote = isLowContent 
    ? `\n\n⚠️ 注意: ソーステキストが少ない場合でも、必ずソーステキストの情報のみを使用してください。外部情報や一般知識を追加しないでください。テキストから読み取れる情報を複数の角度から深掘りして${maxQA}個のQ&Aを作成してください。`
    : isOCRMode
    ? `\n\n⚠️ 注意: OCRで抽出されたテキストの場合、完璧でないことがあります。読み取れる商品情報（商品名、価格、特徴など）から、可能な限り${maxQA}個に近いQ&Aを作成してください。最低でも${Math.floor(maxQA * 0.3)}個以上のQ&Aを生成してください。`
    : '';
  
  // Q&A種類に応じた追加指示
  const qaTypeNote = qaType === 'collected'
    ? `\n\n📋 【Q&A種類: 収集情報ベース】\n**重要**: ソーステキストに明確に記載されている情報のみからQ&Aを作成してください。\n推測や一般知識を含めてはいけません。記載されている事実のみを使用してください。`
    : qaType === 'suggested'
    ? `\n\n💭 【Q&A種類: 想定FAQ（ユーザー視点）】\n**重要**: ソーステキストの商品情報を元に、ユーザーが知りたいであろう**商品そのものの使い方・特徴**を推論・補足してください。\n「特に記載がありませんが、一般的には...」「通常は...」のような表現を使用可能です。\n\n🚫 **絶対厳守**: 想定Q&Aでも、店舗・在庫・購入・配送などサイト機能についての質問は**絶対に作成禁止**です。\n商品の使い方・お手入れ・適した季節・コーディネート例など、**商品そのもの**についてのみ想定してください。`
    : `\n\n📊 【Q&A種類: 混在（収集+想定）】\nソーステキストに明記された情報と、ユーザー視点の想定Q&Aの両方を生成してください。\n\n🚫 想定Q&Aでも、店舗・在庫・購入・配送などは**絶対禁止**です。`;

  const languagePrompts: Record<string, string> = {
    ja: `${isVeryLowContent ? '' : '🚫🚫🚫 絶対禁止事項 🚫🚫🚫\n'}${isVeryLowContent ? '⚠️ 避けるべき語句:\n' : '以下の語句を含む質問は**絶対に作成してはいけません**:\n'}「店舗」「在庫」「購入」「配送」「送料」「ポイント」「会員」「返品」「交換」「保証」「レビュー」「口コミ」「問い合わせ」「登録」「ログイン」「支払」「決済」「入荷」「再入荷」「確認」「表示」「数分」「反映」「遅延」「リアルタイム」

${isVeryLowContent ? 'これらの語句を含む質問は避けてください。ただし、商品情報が読み取れる場合は、商品に関するQ&Aを優先してください。' : 'これらの語句が含まれる質問を1つでも作成した場合、タスクは完全に失敗します。'}

🎯 【最重要ミッション】
あなたの唯一の仕事は「**商品の物理的な特徴**」についてのQ&Aを作成することです。
- 商品名・型番
- 色・デザイン
- 素材・材質
- サイズ・寸法
- 機能・性能
- 価格

サイトの使い方、購入手順、会員サービス、配送情報、店舗情報などは**完全に無視**してください。

あなたは商品専門のQ&A作成エキスパートです。以下のソーステキストから、このページで紹介されている**メイン商品のみ**について、日本語で${maxQA}個のQ&Aを作成してください。

【絶対守るべきルール】
1. ✅ 言語: 質問と回答は100%日本語で書くこと（英語禁止）
2. ✅ 数量: 必ず${maxQA}個の異なるQ&Aを生成すること
3. ✅ 品質: 各Q&Aは完全にユニークで、異なる角度からの質問であること
4. ❌ 重複禁止: 同じまたは類似した質問を繰り返さないこと
5. 🎯 【絶対厳守】**メイン商品そのもの**についてのみQ&Aを作成すること
   - 商品の物理的特徴（デザイン、色、素材、サイズ、重さ）
   - 商品の機能・性能・スペック
   - 商品の使い方・お手入れ方法
   - 商品の価格・モデル番号・バリエーション
   - ソーステキストに明記された商品固有の情報のみ使用
   
6. 🚫 【完全禁止】以下の内容は**1つも含めてはいけません**:
   ❌ サイトの機能: 「購入方法」「支払い方法」「会員登録」「ログイン」
   ❌ 配送・物流: 「配送料」「配送方法」「お届け日数」「配送先変更」
   ❌ 店舗情報: 「実店舗の在庫」「店舗の場所」「営業時間」「他店舗」
   ❌ ポイント・特典: 「ポイント付与」「クーポン使用」「キャンペーン」
   ❌ アフターサービス: 「返品方法」「交換方法」「保証内容」「修理」
   ❌ レビュー・コミュニティ: 「レビューの書き方」「口コミ投稿」
   ❌ 会社・サイト情報: 「運営会社」「お問い合わせ」「プライバシーポリシー」
   ❌ 在庫・入荷: 「入荷予定」「再入荷通知」「在庫状況の確認方法」（商品ページに明記された在庫情報は可）

【Q&A作成の具体例】
✅ **良い質問の例（商品そのものについて）**:
- 「この商品の正式名称と型番は何ですか？」
- 「この商品の主な素材は何ですか？」
- 「このキャップのサイズ調整機能はありますか？」
- 「この商品のカラーバリエーションは何色ありますか？」
- 「この商品の重さはどのくらいですか？」
- 「この商品の価格はいくらですか？」
- 「このデザインの特徴的な部分はどこですか？」
- 「この商品はどのような場面で使用できますか？」
- 「この商品のお手入れ方法は？」
- 「このモデルと他のモデルの違いは何ですか？」

❌ **禁止されている質問の種類（絶対作成禁止）**:
- サイト機能に関する質問（例: 購入方法、会員登録手順など）
- 配送サービスに関する質問（例: 配送料、配送日数など）
- 店舗システムに関する質問（例: 実店舗の場所、営業時間など）
- 在庫管理に関する質問（例: 入荷予定、在庫確認方法など）
- 返品・交換ポリシーに関する質問
- ポイントサービスに関する質問
- レビュー投稿機能に関する質問

【Q&A作成の視点】（**商品の物理的・機能的特徴のみ**）
以下の情報を**ソーステキストから**抽出してQ&Aを作成:
1. **商品識別情報**: 正式名称、型番、ブランド、シリーズ名
2. **外観・デザイン**: 色、柄、形状、スタイル、ロゴ、装飾
3. **素材・材質**: 生地、素材の種類、質感、肌触り
4. **サイズ・寸法**: 具体的な寸法、調整可能範囲、フィット感
5. **機能・性能**: 特殊機能、防水性、通気性、耐久性
6. **使用方法**: 着用方法、お手入れ、保管方法、注意点
7. **価格・バリエーション**: 税込価格、色違い、サイズ違い
8. **ターゲット・用途**: 推奨ユーザー、使用シーン、季節
9. **他製品との比較**: 同シリーズ内での違い、特徴的な点

⚠️ **重要な注意**:
- もしソーステキストに商品情報が少なく、サイト機能の説明ばかりの場合でも、
  **絶対にサイト機能についてのQ&Aを作らないでください**
- その場合は、わずかな商品情報から可能な限りQ&Aを作成してください
- サイト機能の質問を作るくらいなら、Q&A数が少なくても構いません${contentNote}${qaTypeNote}

【出力フォーマット - 必ず守る】
${qaType === 'mixed' ? `
各Q&Aについて、以下のフォーマットで出力してください：

Q1: [日本語の質問]
A1: [日本語の詳細な回答 - ソーステキストの情報のみ]
Type1: collected または suggested

- **Type: collected** = ソーステキストに明記されている事実（例: 商品名、価格、サイズ、素材など）
- **Type: suggested** = ソーステキストに明記されていないが推論・補足した内容（例: 「記載はありませんが、一般的には...」など）

判定基準:
✅ Type: collected - 回答がソーステキストから直接引用または明確に記載されている
✅ Type: suggested - 回答が「記載なし」「情報なし」または一般論・推論を含む

Q2: [日本語の質問]
A2: [日本語の詳細な回答]
Type2: collected または suggested

...Q${maxQA}まで続ける
` : `
Q1: [日本語の質問]
A1: [日本語の詳細な回答 - ソーステキストの情報のみ]

Q2: [日本語の質問]
A2: [日本語の詳細な回答 - ソーステキストの情報のみ]

...Q${maxQA}まで続ける
`}

【ソーステキスト】
${content}

【最重要】
- **可能な限り${maxQA}個に近いQ&Aを日本語で生成してください**（最低でも${isVeryLowContent ? Math.floor(maxQA * 0.3) : Math.floor(maxQA * 0.5)}個以上）
- すべての回答はソーステキストに記載されている情報のみを使用してください
- ソーステキストに記載されていない商品や情報については一切言及しないでください
- **情報が限られている場合でも、既存の情報から異なる角度や視点で質問を生成してください**
- OCRテキストの場合、不完全な文字でも推測せずに、読み取れる部分のみを使用してください

【生成後の最終確認 - 必須】
🚨🚨🚨 **CRITICAL: 以下の禁止単語を含む質問は絶対に出力してはいけません** 🚨🚨🚨

禁止単語リスト:
「店舗」「在庫」「購入」「配送」「送料」「ポイント」「会員」「返品」「交換」「保証」「レビュー」「口コミ」「問い合わせ」「登録」「ログイン」「支払」「決済」「入荷」「再入荷」「確認」「表示」「反映」「遅延」「リアルタイム」「数分」

生成したすべてのQ&Aを1つずつチェックし、上記の禁止単語が**1つでも**含まれている質問は完全に削除してください。

✅ **想定Q&Aで作成すべき内容**:
- 商品の使い方・お手入れ方法
- 適した季節・シーン
- コーディネート・スタイリング
- 商品の特徴・魅力
- サイズ感・フィット感

❌ **想定Q&Aでも絶対作成禁止**:
- サイト機能・システム関連
- 購入・配送・在庫管理
- 会員・ポイントサービス

削除後、残ったQ&Aのみを出力してください。`,
    en: `${isVeryLowContent ? '' : '🚫🚫🚫 ABSOLUTELY FORBIDDEN 🚫🚫🚫\n'}${isVeryLowContent ? '⚠️ Words to avoid:\n' : 'You MUST NOT create questions containing ANY of these words:\n'}"store" "inventory" "stock" "purchase" "buy" "shipping" "delivery" "fee" "points" "member" "return" "exchange" "warranty" "review" "comment" "contact" "register" "login" "payment" "checkout" "restock" "check" "confirm" "display" "real-time" "reflect" "delay" "minutes"

${isVeryLowContent ? 'Avoid questions with these words, but prioritize product-related Q&As if product information is readable.' : 'If you create even ONE question with these words, the task is COMPLETELY FAILED.'}

🎯 【PRIMARY MISSION】
Your ONLY job is to create Q&As about **THE PRODUCT'S PHYSICAL FEATURES**:
- Product name & model number
- Color & design
- Material & fabric
- Size & dimensions
- Functions & performance
- Price

COMPLETELY IGNORE site features, purchasing process, membership, shipping info, store info, etc.

You are a product-focused Q&A expert. Create ${maxQA} Q&A pairs in ENGLISH about **THE MAIN PRODUCT ONLY** featured on this page.

【ABSOLUTE RULES】
1. ✅ LANGUAGE: Write 100% in ENGLISH (NO other languages)
2. ✅ QUANTITY: Generate EXACTLY ${maxQA} distinct Q&A pairs
3. ✅ QUALITY: Each Q&A must be completely unique with different angles
4. ❌ NO DUPLICATES: Do NOT repeat similar questions
5. 🎯 【STRICTLY ENFORCE】Create Q&A about **THE PRODUCT ITSELF** only:
   - Physical features (design, color, material, size, weight)
   - Functions, performance, specifications
   - Usage methods, care instructions
   - Price, model number, variations
   - ONLY use product information explicitly stated in source text
   
6. 🚫 【ABSOLUTELY FORBIDDEN】Do NOT include even ONE of these:
   ❌ Site features: "How to purchase" "Payment methods" "Registration" "Login"
   ❌ Shipping/Delivery: "Shipping fee" "Delivery method" "Delivery time" "Address change"
   ❌ Store info: "In-store stock" "Store location" "Business hours" "Other stores"
   ❌ Points/Benefits: "Point rewards" "Coupon usage" "Campaigns"
   ❌ After-sales: "Return method" "Exchange" "Warranty" "Repair"
   ❌ Reviews/Community: "How to write reviews" "Post comments"
   ❌ Company/Site: "Company info" "Contact" "Privacy policy"
   ❌ Stock/Restock: "Restock schedule" "Restock notification" "How to check stock"

【GOOD QUESTION EXAMPLES (About the product itself)】
✅ "What is the official name and model number of this product?"
✅ "What material is this product made of?"
✅ "Does this cap have size adjustment features?"
✅ "How many color variations are available?"
✅ "What is the weight of this product?"
✅ "What is the price of this product?"
✅ "What are the distinctive design features?"
✅ "What occasions is this product suitable for?"
✅ "How should I care for this product?"
✅ "What's the difference between this and other models?"

❌ **FORBIDDEN QUESTION TYPES (ABSOLUTELY PROHIBITED)**:
- Site functionality questions (e.g., purchase methods, registration procedures)
- Shipping service questions (e.g., shipping fees, delivery days)
- Store system questions (e.g., physical store locations, business hours)
- Inventory management questions (e.g., restock schedules, stock check methods)
- Return/exchange policy questions
- Point service questions
- Review posting functionality questions

【Q&A CREATION FOCUS】(**Physical & functional features ONLY**)
Extract from source text and create Q&As about:
1. **Product ID**: Official name, model number, brand, series
2. **Appearance**: Color, pattern, shape, style, logo, decoration
3. **Material**: Fabric type, material quality, texture
4. **Size/Dimensions**: Measurements, adjustability, fit
5. **Functions**: Special features, waterproof, breathability, durability
6. **Usage**: How to wear/use, care, storage, precautions
7. **Price/Variations**: Tax-included price, color options, size options
8. **Target/Purpose**: Recommended users, usage scenarios, season
9. **Comparisons**: Differences within series, unique features

⚠️ **IMPORTANT NOTE**:
- Even if source text contains mostly site feature descriptions with little product info,
  **NEVER create Q&As about site features**
- In that case, create as many Q&As as possible from the limited product information
- Better to have fewer Q&As than to include site feature questions${contentNote}

【OUTPUT FORMAT - MUST FOLLOW】
${qaType === 'mixed' ? `
For each Q&A, output in the following format:

Q1: [English question]
A1: [Detailed English answer - source text only]
Type1: collected or suggested

- **Type: collected** = Facts explicitly stated in source text (e.g., product name, price, size, material)
- **Type: suggested** = Content inferred/supplemented not explicitly in source (e.g., "The source text does not provide...")

Criteria:
✅ Type: collected - Answer is directly quoted or clearly stated in source text
✅ Type: suggested - Answer contains "not provided", "no information", or general advice/inference

Q2: [English question]
A2: [Detailed English answer]
Type2: collected or suggested

...continue to Q${maxQA}
` : `
Q1: [English question]
A1: [Detailed English answer - source text only]

Q2: [English question]
A2: [Detailed English answer - source text only]

...continue to Q${maxQA}
`}

【SOURCE TEXT】
${content}

【CRITICAL】
- **Generate as close to ${maxQA} Q&A pairs as possible** (minimum ${isVeryLowContent ? Math.floor(maxQA * 0.3) : Math.floor(maxQA * 0.5)}+)
- All answers must use ONLY information stated in the source text
- Do NOT mention any products not listed in the source text
- **Even with limited information, create questions from different angles and perspectives**
- For OCR text, use only readable parts without guessing incomplete characters

【FINAL VERIFICATION - MANDATORY】
🚨🚨🚨 **CRITICAL: NEVER output questions containing forbidden terms** 🚨🚨🚨

Forbidden terms list:
"store" "inventory" "stock" "purchase" "buy" "shipping" "delivery" "fee" "points" "member" "return" "exchange" "warranty" "review" "comment" "contact" "register" "login" "payment" "checkout" "restock" "check" "confirm" "display" "real-time" "reflect" "delay" "minutes"

Check ALL generated Q&As one by one, and completely delete any question containing **even one** forbidden term.

✅ **Suggested Q&A should create**:
- Product usage & care methods
- Suitable seasons & occasions
- Styling & coordination
- Product features & appeal
- Size feeling & fit

❌ **Absolutely prohibited even in Suggested Q&A**:
- Site features & system-related
- Purchase, shipping, inventory management
- Membership & point services

Output ONLY the remaining Q&As after deletion.`,
    zh: `🚫🚫🚫 绝对禁止事项 🚫🚫🚫
以下词语的问题**绝对不能创建**:
"店铺""库存""购买""配送""运费""积分""会员""退货""换货""保修""评论""留言""联系""注册""登录""支付""结账""补货""确认""显示""实时""反映""延迟""分钟"

如果创建了哪怕一个包含这些词语的问题，任务就完全失败。

🎯 【最重要使命】
你唯一的工作是创建关于**产品物理特征**的问答:
- 产品名称和型号
- 颜色和设计
- 材料和质地
- 尺寸和规格
- 功能和性能
- 价格

完全忽略网站功能、购买流程、会员服务、配送信息、店铺信息等。

你是专业的中文Q&A创作专家。请从下面的文本中精确生成${maxQA}个中文问答对。

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
- **尽可能生成接近${maxQA}个的问答对**（最少${isVeryLowContent ? Math.floor(maxQA * 0.3) : Math.floor(maxQA * 0.5)}个以上）
- 所有答案必须仅使用源文本中说明的信息
- 不要提及源文本中未列出的任何产品
- **即使信息有限，也要从不同角度和视角创建问题**
- 对于OCR文本，只使用可读部分，不要猜测不完整的字符

【最终验证 - 必须】
生成所有问答后，再次检查并删除包含以下术语的**所有问题**：
"店铺""库存""购买""配送""运费""积分""会员""退货""换货""保修""评论""留言""联系""注册""登录""支付""结账""补货""确认""显示""反映""延迟""实时""分钟"

删除后，仅输出剩余的问答。`
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
    
    // モデル選択: 常にgpt-4o-miniを使用（より賢く、安価）
    const model = 'gpt-4o-mini';
    const maxTokensLimit = 16384;
    const estimatedTokens = Math.min(maxQA * 120 + 1500, maxTokensLimit);
    
    console.log(`[MODEL SELECTION] model=${model}, maxTokensLimit=${maxTokensLimit}, estimatedTokens=${estimatedTokens}`);
    console.log(`[OpenAI] Model: ${model}, max_tokens: ${estimatedTokens}, target: ${maxQA} Q&As in ${targetLanguage}`);
    
    // タイムアウトを2分に統一
    const timeoutMs = 120000;
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
    
    // Q&Aをパース（Type情報も含む）
    const qaItems: Array<{question: string, answer: string, type?: 'collected' | 'suggested'}> = [];
    const lines = generatedText.split('\n');
    let currentQ = '';
    let currentA = '';
    let currentType: 'collected' | 'suggested' | undefined = undefined;
    let inAnswer = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Q1:, Q2: などの形式を検出（柔軟なマッチング）
      const qMatch = trimmed.match(/^Q\d+[:：]?\s*(.+)$/i);
      const aMatch = trimmed.match(/^A\d+[:：]?\s*(.+)$/i);
      const typeMatch = trimmed.match(/^Type\d+[:：]?\s*(collected|suggested)/i);
      
      if (qMatch) {
        // 前のQ&Aがあれば保存
        if (currentQ && currentA) {
          qaItems.push({ 
            question: currentQ.trim(), 
            answer: currentA.trim(),
            type: currentType
          });
        }
        currentQ = qMatch[1].trim();
        currentA = '';
        currentType = undefined;
        inAnswer = false;
      } else if (aMatch) {
        currentA = aMatch[1].trim();
        inAnswer = true;
      } else if (typeMatch) {
        // Type情報を取得（mixedモードのみ）
        currentType = typeMatch[1].toLowerCase() as 'collected' | 'suggested';
        console.log(`  Parsed type: ${currentType} for Q: "${currentQ.substring(0, 50)}..."`);
        inAnswer = false;
      } else if (inAnswer && currentA) {
        // 回答の続き
        currentA += ' ' + trimmed;
      } else if (!inAnswer && currentQ && !typeMatch) {
        // 質問の続き
        currentQ += ' ' + trimmed;
      }
    }
    
    // 最後のQ&Aを追加
    if (currentQ && currentA) {
      qaItems.push({ 
        question: currentQ.trim(), 
        answer: currentA.trim(),
        type: currentType
      });
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
    const uniqueQA: Array<{question: string, answer: string, type?: 'collected' | 'suggested'}> = [];
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
    
    // mixedモードの場合、LLMが返したtype情報をそのまま使用
    if (qaType === 'mixed') {
      console.log('🔀 Mixed mode: Using LLM-provided type classification');
      
      const finalQAs = uniqueQA.slice(0, maxQA);
      const suggestedCount = finalQAs.filter(qa => qa.type === 'suggested').length;
      const collectedCount = finalQAs.filter(qa => qa.type === 'collected').length;
      const undefinedCount = finalQAs.filter(qa => !qa.type).length;
      
      // typeが未定義のものはデフォルトでcollectedにする
      finalQAs.forEach(qa => {
        if (!qa.type) {
          qa.type = 'collected';
          console.log(`  ⚠️ Type undefined for Q: "${qa.question.substring(0, 60)}..." → defaulting to 'collected'`);
        }
      });
      
      console.log(`📊 Final: Returning ${finalQAs.length} Q&As (${suggestedCount} suggested + ${collectedCount} collected + ${undefinedCount} defaulted)`);
      return finalQAs;
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
    const includeTypes = req.body.includeTypes || { collected: true, suggested: false }; // Q&A types

    console.log('Parsed parameters:');
    console.log('  - url:', url);
    console.log('  - maxQA (raw):', requestMaxQA, 'type:', typeof requestMaxQA);
    console.log('  - maxQA (parsed):', maxQA, 'type:', typeof maxQA);
    console.log('  - language (raw):', requestLanguage, 'type:', typeof requestLanguage);
    console.log('  - language (parsed):', language, 'type:', typeof language);
    console.log('  - sourceCode provided:', !!sourceCode, 'length:', sourceCode?.length || 0);
    console.log('  - includeTypes:', includeTypes);

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
    
    // コンテンツが短すぎる場合は警告（ただし、50文字以上ならQ&A生成を試行）
    if (extractedContent.length < 50) {
      console.warn(`⚠️ Content too short: ${extractedContent.length} characters`);
      return res.status(400).json({
        success: false,
        error: 'コンテンツが短すぎます。HTMLソースコードが正しく貼り付けられているか確認してください。提案: ブラウザで「ページのソースを表示」から完全なHTMLをコピーしてください。',
        details: `Content length: ${extractedContent.length} characters. Preview: ${extractedContent.substring(0, 200)}`
      } as any);
    }
    
    // 50-200文字の場合は警告を出すが続行
    if (extractedContent.length < 200) {
      console.warn(`⚠️ WARNING: Content is quite short (${extractedContent.length} chars), Q&A generation might be limited`);
      console.log(`📄 Full content: ${extractedContent}`);
    }

    // ステップ3: OpenAI APIで複数のQ&Aを生成
    console.log(`[GENERATION] Starting Q&A generation with maxQA=${maxQA}, language=${language}`);
    console.log(`[GENERATION] Content length: ${extractedContent.length} characters`);
    console.log(`[GENERATION] Content preview:`, extractedContent.substring(0, 300));
    console.log(`[GENERATION] ============ FULL EXTRACTED CONTENT ============`);
    console.log(extractedContent);
    console.log(`[GENERATION] ================================================`);
    
    let qaList: Array<{question: string, answer: string, type?: 'collected' | 'suggested'}> = [];
    try {
      // Q&A種類を決定
      const qaType: 'collected' | 'suggested' | 'mixed' = 
        includeTypes.collected && includeTypes.suggested ? 'mixed' :
        includeTypes.suggested ? 'suggested' :
        'collected';
      
      console.log(`[GENERATION] Q&A Type: ${qaType}`);
      qaList = await generateQA(extractedContent, maxQA, language, effectiveUrl, false, qaType); // URL mode
      console.log(`[GENERATION] Generated ${qaList.length} Q&A items`);
      console.log(`[GENERATION] Q&A generation completed successfully`);
      console.log(`[GENERATION] ============ GENERATED Q&As ============`);
      qaList.forEach((qa, index) => {
        console.log(`Q${index + 1}: ${qa.question}`);
        console.log(`A${index + 1}: ${qa.answer.substring(0, 100)}...`);
      });
      console.log(`[GENERATION] ==========================================`);
      
      if (qaList.length === 0) {
        console.error('❌❌❌ CRITICAL: Q&A generation returned 0 items ❌❌❌');
        console.error('[GENERATION] Input content length:', extractedContent.length);
        console.error('[GENERATION] Requested maxQA:', maxQA);
        console.error('[GENERATION] Language:', language);
        console.error('[GENERATION] Full content:', extractedContent);
        
        return res.status(400).json({
          success: false,
          error: `Q&A生成に失敗しました。\n\n考えられる原因:\n1. コンテンツが短すぎる（${extractedContent.length}文字）\n2. OpenAI APIエラー（残高不足またはレート制限）\n3. プロンプトが厳しすぎる\n\nデバッグ情報:\n- コンテンツ長: ${extractedContent.length}文字\n- 要求Q&A数: ${maxQA}個\n- 使用言語: ${language}\n\nFly.ioログで詳細を確認してください。`,
          details: {
            contentLength: extractedContent.length,
            maxQA: maxQA,
            language: language,
            contentPreview: extractedContent.substring(0, 500)
          }
        } as any);
      }
    } catch (generateError) {
      console.error('❌ Q&A generation threw an error:', generateError);
      console.error('[GENERATION] Error details:', generateError instanceof Error ? generateError.message : String(generateError));
      console.error('[GENERATION] Error stack:', generateError instanceof Error ? generateError.stack : 'N/A');
      
      // エラーの種類を判定してユーザーフレンドリーなメッセージを返す
      let errorMessage = 'Q&A生成中にエラーが発生しました。';
      if (generateError instanceof Error) {
        if (generateError.message.includes('insufficient_quota') || generateError.message.includes('quota')) {
          errorMessage = 'OpenAI APIの残高が不足しています。API Keyを確認してください。';
        } else if (generateError.message.includes('timeout')) {
          errorMessage = 'Q&A生成がタイムアウトしました。maxQAの値を減らしてみてください。';
        } else if (generateError.message.includes('rate_limit')) {
          errorMessage = 'OpenAI APIのレート制限に達しました。しばらく待ってから再試行してください。';
        } else {
          errorMessage = `Q&A生成エラー: ${generateError.message}`;
        }
      }
      
      return res.status(500).json({
        success: false,
        error: errorMessage,
        details: {
          contentLength: extractedContent.length,
          maxQA: maxQA,
          language: language,
          errorType: generateError instanceof Error ? generateError.name : 'Unknown',
          errorMessage: generateError instanceof Error ? generateError.message : String(generateError)
        }
      } as any);
    }

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
    // source: ユーザーの選択に応じて設定
    // - includeTypes.collected のみ → 'collected' (Webサイト情報)
    // - includeTypes.suggested のみ → 'suggested' (想定FAQ)
    const qaItems = await Promise.all(qaList.map(async (qa, index) => {
      const needsVideo = needsVideoExplanation(qa.question, qa.answer);
      console.error(`DEBUG Q${index + 1} needsVideo: ${needsVideo} - Q: ${qa.question.substring(0, 50)}`);
      
      // Q&Aの種類を決定
      // 混在モードの場合: LLMが分類したtypeを使用
      // 単一モードの場合: ユーザーの選択を使用
      const qaSource: 'collected' | 'suggested' = 
        (includeTypes.collected && includeTypes.suggested) ? (qa.type || 'collected') :
        includeTypes.suggested ? 'suggested' :
        'collected';
      
      const item: any = {
        id: `${Date.now()}-${index}`,
        question: qa.question,
        answer: qa.answer,
        source: qaSource,  // ユーザー選択に応じたラベル
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
    const includeTypes = req.body.includeTypes ? JSON.parse(req.body.includeTypes) : { collected: true, suggested: false };
    
    console.log('  - URL:', url);
    console.log('  - Uploaded files:', files?.length || 0);
    console.log('  - includeTypes:', includeTypes);
    
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
    
    if (combinedText.length < 50) {
      return res.status(400).json({
        success: false,
        error: 'テキストの抽出に失敗しました。画像が不鮮明な可能性があります。または、画像に日本語テキストが少ない可能性があります。',
        data: {
          diagnostics: {
            extractedTextLength: combinedText.length,
            filesProcessed: files.length,
            extractedText: combinedText
          }
        }
      });
    }
    
    // 50-200文字の場合は警告を出すが続行
    if (combinedText.length < 200) {
      console.warn(`⚠️ WARNING: OCR extracted text is quite short (${combinedText.length} chars), Q&A generation might be limited`);
      console.log(`📄 Full OCR text: ${combinedText}`);
    }
    
    // OCRテキストに製品情報が含まれているかを判定
    const hasProductInfo = (text: string): boolean => {
      // 製品情報によく含まれるキーワード（日本語）
      const productKeywords = [
        '価格', '円', '¥', '$', 'JPY', 'USD',
        '素材', '材質', 'サイズ', 'cm', 'mm', 'g', 'kg',
        '色', 'カラー', '商品', '製品', 'モデル', '型番',
        '仕様', 'スペック', '機能', '特徴', '説明',
        'price', 'material', 'size', 'color', 'product', 'model', 'specification'
      ];
      
      // UI/ナビゲーション要素を示すキーワード
      const uiKeywords = [
        'ログイン', 'login', 'お気に入り', 'カート', 'cart',
        'ゲスト', 'guest', 'メニュー', 'menu', 'ナビ', 'navigation',
        'ヘッダー', 'header', 'フッター', 'footer'
      ];
      
      const lowercaseText = text.toLowerCase();
      const productCount = productKeywords.filter(kw => lowercaseText.includes(kw.toLowerCase())).length;
      const uiCount = uiKeywords.filter(kw => lowercaseText.includes(kw.toLowerCase())).length;
      
      // 製品キーワードが2個以上あり、UIキーワードよりも多い場合は製品情報あり
      return productCount >= 2 && productCount > uiCount;
    };
    
    const hasProduct = hasProductInfo(combinedText);
    console.log('  - Has product info detected:', hasProduct);
    console.log('  - Text analysis: manufacturing=', combinedText.match(/(価格|円|サイズ|素材|色|商品)/g)?.length || 0);
    console.log('  - Text analysis: UI elements=', combinedText.match(/(ログイン|カート|メニュー|ゲスト|ナビ)/g)?.length || 0);
    
    // Q&A生成（リクエストからmaxQAとlanguageを取得）
    let maxQA = req.body.maxQA ? parseInt(req.body.maxQA, 10) : 40;
    const language = req.body.language || 'ja';
    
    // 製品情報が検出されない場合、maxQAを大幅に削減（3個のみ）
    if (!hasProduct && combinedText.length < 2000) {
      console.warn(`⚠️ CRITICAL WARNING: OCR text appears to be mostly UI elements, not product info!`);
      console.warn(`  Reducing maxQA from ${maxQA} to 3 to avoid generating irrelevant Q&As`);
      maxQA = Math.min(maxQA, 3);
    }
    
    console.log('\n🤖 Q&A生成を開始...');
    console.log('  - maxQA (adjusted):', maxQA);
    console.log('  - language:', language);
    console.log('  - Combined text length:', combinedText.length, 'characters');
    console.log('  - Text preview:', combinedText.substring(0, 200));
    
    let qaList: Array<{question: string, answer: string, type?: 'collected' | 'suggested'}> = [];
    try {
      // Q&A種類を決定
      const qaType: 'collected' | 'suggested' | 'mixed' = 
        includeTypes.collected && includeTypes.suggested ? 'mixed' :
        includeTypes.suggested ? 'suggested' :
        'collected';
      
      console.log(`[OCR] Q&A Type: ${qaType}`);
      qaList = await generateQA(combinedText, maxQA, language, url, true, qaType); // OCR mode
      console.log(`✅ ${qaList.length}個のQ&Aを生成しました`);
      console.log('📊 Q&A生成結果の詳細:');
      console.log('  - 生成されたQ&A数:', qaList.length);
      console.log('  - 要求されたmaxQA:', maxQA);
      console.log('  - 使用言語:', language);
      console.log('  - 入力テキスト長:', combinedText.length);
      
      // Q&Aが0個の場合は詳細ログ
      if (qaList.length === 0) {
        console.error('❌❌❌ CRITICAL ERROR: No Q&As generated! ❌❌❌');
        console.error('  - maxQA requested:', maxQA);
        console.error('  - language:', language);
        console.error('  - text length:', combinedText.length);
        console.error('  - text sample:', combinedText.substring(0, 500));
        console.error('  - FULL TEXT:', combinedText);
        
        // エラーレスポンスを返す
        return res.status(400).json({
          success: false,
          error: `OCRからQ&Aを生成できませんでした。\n\n考えられる原因:\n1. 画像からのテキスト抽出量が不十分（${combinedText.length}文字）\n2. OpenAI APIエラー（残高不足またはレート制限）\n3. プロンプトが厳しすぎる\n\nデバッグ情報:\n- 抽出テキスト長: ${combinedText.length}文字\n- 要求Q&A数: ${maxQA}個\n- 使用言語: ${language}\n\nFly.ioログで詳細を確認してください。`,
          data: {
            diagnostics: {
              extractedTextLength: combinedText.length,
              filesProcessed: files.length,
              extractedText: combinedText,
              maxQA: maxQA,
              language: language
            }
          }
        });
      }
    } catch (generateError) {
      console.error('❌ OCR Q&A generation threw an error:', generateError);
      console.error('[OCR] Error details:', generateError instanceof Error ? generateError.message : String(generateError));
      
      let errorMessage = 'OCRテキストからQ&A生成中にエラーが発生しました。';
      if (generateError instanceof Error) {
        if (generateError.message.includes('insufficient_quota') || generateError.message.includes('quota')) {
          errorMessage = 'OpenAI APIの残高が不足しています。API Keyを確認してください。';
        } else if (generateError.message.includes('timeout')) {
          errorMessage = 'Q&A生成がタイムアウトしました。maxQAの値を減らしてみてください。';
        } else if (generateError.message.includes('rate_limit')) {
          errorMessage = 'OpenAI APIのレート制限に達しました。しばらく待ってから再試行してください。';
        } else {
          errorMessage = `OCR Q&A生成エラー: ${generateError.message}`;
        }
      }
      
      return res.status(500).json({
        success: false,
        error: errorMessage,
        data: {
          diagnostics: {
            extractedTextLength: combinedText.length,
            filesProcessed: files.length,
            maxQA: maxQA,
            language: language,
            errorType: generateError instanceof Error ? generateError.name : 'Unknown',
            errorMessage: generateError instanceof Error ? generateError.message : String(generateError)
          }
        }
      });
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
    // source: ユーザーの選択に応じて設定
    res.json({
      success: true,
      data: {
        url: url || 'ocr-images',
        extractedContent: combinedText.substring(0, 500) + '...',
        qaResult: qaList.map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`).join('\n\n'),
        qaItems: qaList.map((qa, index) => {
          const needsVideo = needsVideoExplanation(qa.question, qa.answer);
          // Q&Aの種類を決定
          // 混在モードの場合: LLMが分類したtypeを使用
          // 単一モードの場合: ユーザーの選択を使用
          const qaSource: 'collected' | 'suggested' = 
            (includeTypes.collected && includeTypes.suggested) ? (qa.type || 'collected') :
            includeTypes.suggested ? 'suggested' :
            'collected';
          return {
            id: String(index + 1),
            question: qa.question,
            answer: qa.answer,
            source: qaSource,  // ユーザー選択に応じたラベル
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
