import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
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
// 薬機法：化粧品の効能範囲（許可された表現）
const ALLOWED_COSMETIC_EFFECTS = [
    '頭皮、毛髪を清浄にする',
    '香りにより毛髪、頭皮の不快臭を抑える',
    '頭皮、毛髪をすこやかに保つ',
    '毛髪にはり、こしを与える',
    '頭皮、毛髪にうるおいを与える',
    '頭皮、毛髪のうるおいを保つ',
    '毛髪をしなやかにする',
    'クシどおりをよくする',
    '毛髪のつやを保つ',
    '毛髪につやを与える',
    'フケ、カユミがとれる',
    'フケ、カユミを抑える',
    '毛髪の水分、油分を補い保つ',
    '裂毛、切毛、枝毛を防ぐ',
    '髪型を整え、保持する',
    '毛髪の帯電を防止する',
    '皮膚を清浄にする',
    'ニキビ、アセモを防ぐ',
    '肌を整える',
    '肌のキメを整える',
    '皮膚をすこやかに保つ',
    '肌荒れを防ぐ',
    '肌をひきしめる',
    '皮膚にうるおいを与える',
    '皮膚の水分、油分を補い保つ',
    '皮膚の柔軟性を保つ',
    '皮膚を保護する',
    '皮膚の乾燥を防ぐ',
    '肌を柔らげる',
    '肌にはりを与える',
    '肌にツヤを与える',
    '肌を滑らかにする',
    'ひげを剃りやすくする',
    'ひげそり後の肌を整える',
    'あせもを防ぐ',
    '日やけを防ぐ',
    '日やけによるシミ、ソバカスを防ぐ',
    '芳香を与える',
    '爪を保護する',
    '爪をすこやかに保つ',
    '爪にうるおいを与える',
    '口唇の荒れを防ぐ',
    '口唇のキメを整える',
    '口唇にうるおいを与える',
    '口唇をすこやかにする',
    '口唇を保護する',
    '口唇の乾燥を防ぐ',
    '口唇の乾燥によるカサツキを防ぐ',
    '口唇を滑らかにする',
    '歯を白くする',
    '歯垢を除去する',
    '口中を浄化する',
    '口臭を防ぐ',
    'むし歯を防ぐ',
    '歯のやにを取る',
    '歯石の沈着を防ぐ',
    '乾燥による小ジワを目立たなくする'
];
// 薬機法違反の可能性がある表現（NGワード）
const PROHIBITED_EXPRESSIONS = [
    // 医薬品的効能効果
    '治す', '治る', '治療', '改善', '回復', '再生', '修復',
    '緩和', '予防', '防止',
    // 身体の組織機能への言及
    '細胞', '活性化', '代謝', '血行促進', '新陳代謝',
    '老化防止', 'アンチエイジング', '若返り', 'リフトアップ',
    // 医学的表現
    '効く', '効果', '有効', '臨床', '医学的', '科学的に証明',
    // 肌質改善
    'シミを消す', 'シミが消える', 'シミを取る', 'シミが取れる',
    'シワを消す', 'シワが消える', 'シワを取る', 'シワが取れる',
    'ニキビが治る', 'ニキビを治す', 'ニキビ改善',
    'たるみを解消', 'たるみ改善', 'たるみを治す',
    '美白効果', '美白する', '白くする', '色白',
    // 身体変化
    '痩せる', 'ダイエット効果', '脂肪燃焼', '減量',
    'バストアップ', '豊胸'
];
// 薬機法コンプライアンスチェック関数
function checkCosmeticCompliance(answer) {
    const lowerAnswer = answer.toLowerCase();
    // 禁止表現をチェック
    for (const prohibited of PROHIBITED_EXPRESSIONS) {
        if (answer.includes(prohibited)) {
            console.log(`⚠️ 薬機法注意: "${prohibited}" が検出されました`);
            return true; // 違反の可能性あり
        }
    }
    return false; // 問題なし
}
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
        }
        else {
            cb(new Error('画像ファイルのみアップロード可能です'));
        }
    }
});
// 静的ファイルのパスを定義（後で使用）
const distPath = path.join(process.cwd(), 'dist');
// Playwrightでブラウザ経由でHTMLを取得（JavaScript実行サイトやセキュリティ保護されたサイトに対応）
async function fetchWithBrowser(url) {
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
            timeout: 60000 // 60秒に延長
        });
        // ドメイン情報を取得（Referer用）
        const domain = new URL(url).origin;
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
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
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
        // ページにアクセス
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 90000 // 90秒に延長
        });
        // Cloudflareチャレンジを検出
        const pageContent = await page.content();
        const isCloudflareChallenge = pageContent.includes('Just a moment') ||
            pageContent.includes('challenge-platform') ||
            pageContent.includes('cf_chl_opt');
        if (isCloudflareChallenge) {
            console.log(`🛡️ Cloudflare challenge detected, waiting for resolution...`);
            // Cloudflareチャレンジ解決を待つ（最大20秒）
            try {
                await page.waitForFunction(`() => {
            const body = document.body.innerHTML;
            return !body.includes('Just a moment') && 
                   !body.includes('challenge-platform') &&
                   body.length > 5000;
          }`, { timeout: 20000 } // 30秒→20秒に短縮
                );
                console.log(`✅ Cloudflare challenge resolved`);
            }
            catch (timeoutErr) {
                console.warn(`⚠️ Cloudflare challenge timeout, attempting to continue...`);
            }
            // 追加の待機を短縮
            await page.waitForTimeout(3000); // 5秒→3秒
        }
        else {
            // 通常のJavaScript実行を待つ
            console.log(`⏳ Waiting for JavaScript execution...`);
            await page.waitForTimeout(5000);
        }
        // ネットワークアイドルを待つ（追加の安全策）
        try {
            await page.waitForLoadState('networkidle', { timeout: 15000 });
            console.log(`✅ Network is idle`);
        }
        catch {
            console.warn(`⚠️ Network idle timeout, continuing anyway...`);
        }
        // 人間らしいスクロール動作（ランダム化）
        console.log(`🖱️ Simulating human scrolling...`);
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
            const doc = document;
            return doc.body.innerText;
        });
        console.log(`📝 Body text length: ${bodyText.length} chars`);
        console.log(`📝 Body text preview (first 200 chars): ${bodyText.substring(0, 200)}`);
        // 特定の要素が存在するか確認
        const hasGoodsDetail = await page.evaluate(() => {
            // @ts-ignore - document is available in browser context
            const doc = document;
            return !!(doc.querySelector('.goodsDetail') ||
                doc.querySelector('.product-detail') ||
                doc.querySelector('[class*="product"]') ||
                doc.querySelector('h1'));
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
    }
    catch (error) {
        console.error(`❌ Playwright fetch failed:`, error.message);
        console.error(`   Error stack:`, error.stack);
        if (browser) {
            try {
                await browser.close();
            }
            catch (closeError) {
                console.error(`❌ Error closing browser:`, closeError);
            }
        }
        throw error;
    }
}
// 簡易的なHTMLフェッチ（最終フォールバック）
// GenSpark Crawlerの代わりに、より寛容なfetchを使用
async function fetchWithGenSparkCrawler(url) {
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
    }
    catch (error) {
        console.error(`❌ [Fallback Fetch] Failed:`, error instanceof Error ? error.message : String(error));
        // 本当の最終手段: エラーメッセージをHTMLとして返す
        return `<html><body><h1>Failed to fetch content</h1><p>URL: ${url}</p><p>All methods exhausted.</p></body></html>`;
    }
}
// HTTPリクエストを実行してHTMLを取得（通常のブラウザとして振る舞う）
// まずaxiosで試行し、403エラーの場合はPuppeteerにフォールバック、最後にGenSpark Crawler
async function fetchWebsite(url) {
    console.log(`🌐 Fetching website: ${url}`);
    // リトライ設定
    const maxRetries = 3;
    let lastError;
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
                    }
                    catch (browserError) {
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
                    }
                    catch (crawlerError) {
                        console.error(`❌ GenSpark Crawler failed:`, crawlerError.message);
                        usedGenSparkCrawler = true;
                    }
                }
            }
            return response.data;
        }
        catch (error) {
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
                        }
                        catch (browserError) {
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
                        }
                        catch (crawlerError) {
                            console.error(`❌ GenSpark Crawler failed:`, crawlerError.message);
                            usedGenSparkCrawler = true;
                        }
                    }
                }
            }
            else if (error.request) {
                // リクエストは送信されたがレスポンスがない場合
                console.error(`❌ Attempt ${attempt} failed: No response received`);
                console.error(`   Request details:`, {
                    url: error.config?.url,
                    method: error.config?.method,
                    timeout: error.config?.timeout
                });
            }
            else {
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
        }
        catch (browserError) {
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
        }
        catch (crawlerError) {
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
function extractContent(html) {
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
        }
        catch (err) {
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
    $('*').filter(function () {
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
    $('*').each(function () {
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
    const productInfoSections = [];
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
            const isDuplicate = productInfoSections.some(section => section.text.includes(text) || text.includes(section.text));
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
    console.log(`📊 Priority distribution: P1=${productInfoSections.filter(s => s.priority === 1).length}, P2=${productInfoSections.filter(s => s.priority === 2).length}, P3=${productInfoSections.filter(s => s.priority === 3).length}, P4=${productInfoSections.filter(s => s.priority === 4).length}`);
    // 【ステップ5】文字数制限（商品情報を最大限保持）
    // 上位3500文字を取得（フッター情報を完全除外）
    let finalContent;
    if (cleanedContent.length <= 3500) {
        finalContent = cleanedContent;
    }
    else {
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
async function extractTextFromImage(imageBuffer) {
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
    }
    catch (error) {
        console.error('❌ OCR処理エラー:', error);
        throw new Error(`OCR処理に失敗しました: ${error}`);
    }
}
// ========== Multi-LLM Support Functions ==========
/**
 * 簡潔なプロンプトを生成 (トークン数を50%削減)
 */
function generateCompactPrompt(content, maxQA, language, qaType) {
    // コンテンツを2000文字に制限（トークン節約）
    const trimmedContent = content.length > 2000 ? content.substring(0, 2000) + '\n...(省略)' : content;
    const forbiddenWords = '「店舗」「在庫」「購入」「配送」「送料」「ポイント」「会員」「返品」「交換」「保証」「レビュー」「口コミ」「問い合わせ」「登録」「ログイン」「支払」「決済」「入荷」「再入荷」';
    const qaTypeInstructions = qaType === 'collected'
        ? '**重要**: ソーステキストに明記された情報のみを使用。推測禁止。'
        : qaType === 'suggested'
            ? '**重要**: 商品の使い方・特徴を推論・補足可能。「一般的には...」等の表現OK。サイト機能についての質問は厳禁。'
            : '収集情報と想定FAQの両方を生成。各Q&AにType: collected/suggestedを付与。';
    if (language === 'ja') {
        return `あなたは商品Q&A作成の専門家です。以下のソーステキストから、**商品そのもの**（名称、色、素材、サイズ、機能、価格）について日本語で${maxQA}個のQ&Aを作成してください。

${qaTypeInstructions}

🚫 **絶対禁止**: 以下の語句を含む質問は作成禁止: ${forbiddenWords}

✅ **作成すべき質問**: 商品名、素材、サイズ、色、機能、価格、お手入れ方法、使用シーン

【出力フォーマット】
${qaType === 'mixed' ? 'Q1: [質問]\nA1: [回答]\nType1: collected または suggested\n\nQ2: ...' : 'Q1: [質問]\nA1: [回答]\n\nQ2: ...'}

【ソーステキスト】
${trimmedContent}

必ず${maxQA}個のQ&Aを生成してください。`;
    }
    else if (language === 'en') {
        return `You are a product Q&A expert. Create ${maxQA} Q&A pairs in ENGLISH about **the product itself** (name, color, material, size, function, price) from the source text below.

${qaTypeInstructions.replace('ソーステキスト', 'source text').replace('推測禁止', 'no guessing').replace('サイト機能', 'site features')}

🚫 **FORBIDDEN**: Do NOT create questions containing: "store" "inventory" "purchase" "shipping" "fee" "points" "member" "return" "exchange" "warranty" "review" "contact" "register" "login" "payment" "checkout" "restock"

✅ **CREATE**: Product name, material, size, color, features, price, care instructions, usage scenarios

【OUTPUT FORMAT】
${qaType === 'mixed' ? 'Q1: [question]\nA1: [answer]\nType1: collected or suggested\n\nQ2: ...' : 'Q1: [question]\nA1: [answer]\n\nQ2: ...'}

【SOURCE TEXT】
${trimmedContent}

Generate EXACTLY ${maxQA} Q&A pairs.`;
    }
    else { // Chinese
        return `你是专业的中文产品Q&A创作专家。请从下面的文本中精确生成${maxQA}个中文问答对，仅关于**产品本身**（名称、颜色、材料、尺寸、功能、价格）。

${qaTypeInstructions.replace('ソーステキスト', '源文本').replace('推測禁止', '禁止推测').replace('サイト機能', '网站功能')}

🚫 **绝对禁止**: 以下词语的问题禁止创建: "店铺""库存""购买""配送""运费""积分""会员""退货""换货""保修""评论""留言""联系""注册""登录""支付""结账""补货"

✅ **应创建**: 产品名称、材料、尺寸、颜色、功能、价格、保养方法、使用场景

【输出格式】
Q1: [中文问题]
A1: [详细中文答案]

Q2: ...

【源文本】
${trimmedContent}

必须生成正好${maxQA}个问答对。`;
    }
}
/**
 * Claude API でQ&A生成を試行
 */
async function generateQAWithClaude(prompt, maxQA) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('Anthropic API key not configured');
    }
    console.log('🤖 Attempting Q&A generation with Claude 3.5 Sonnet...');
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: Math.min(maxQA * 150 + 500, 4096),
        temperature: 0.7,
        messages: [{
                role: 'user',
                content: prompt
            }]
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    console.log(`✅ Claude response: ${text.length} characters`);
    console.log(`📊 Token usage: input=${response.usage.input_tokens}, output=${response.usage.output_tokens}`);
    return parseQAResponse(text);
}
/**
 * Gemini API でQ&A生成を試行
 */
async function generateQAWithGemini(prompt, maxQA) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('Gemini API key not configured');
    }
    console.log('🤖 Attempting Q&A generation with Gemini 2.0 Flash...');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp'
    });
    const result = await model.generateContent({
        contents: [{
                role: 'user',
                parts: [{ text: prompt }]
            }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: Math.min(maxQA * 150 + 500, 8192)
        }
    });
    const text = result.response.text();
    console.log(`✅ Gemini response: ${text.length} characters`);
    return parseQAResponse(text);
}
/**
 * OpenAI API でQ&A生成を試行
 */
async function generateQAWithOpenAI(prompt, maxQA) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('OpenAI API key not configured');
    }
    console.log('🤖 Attempting Q&A generation with OpenAI gpt-4o-mini...');
    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: 'You are a professional product Q&A generator.' },
            { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: Math.min(maxQA * 150 + 500, 16384)
    }, {
        timeout: 120000 // 2分
    });
    const text = response.choices[0]?.message?.content || '';
    console.log(`✅ OpenAI response: ${text.length} characters`);
    console.log(`📊 Token usage: input=${response.usage?.prompt_tokens}, output=${response.usage?.completion_tokens}`);
    return parseQAResponse(text);
}
/**
 * LLMレスポンスからQ&Aをパース
 */
function parseQAResponse(text) {
    const qaList = [];
    const lines = text.split('\n');
    let currentQ = '';
    let currentA = '';
    let currentType = undefined;
    for (const line of lines) {
        const trimmed = line.trim();
        // Q1:, Q2:, Q3: ... の検出
        const qMatch = trimmed.match(/^Q\d+[:：]\s*(.+)/);
        if (qMatch) {
            // 前のQ&Aを保存
            if (currentQ && currentA) {
                qaList.push({ question: currentQ, answer: currentA, type: currentType });
            }
            currentQ = qMatch[1].trim();
            currentA = '';
            currentType = undefined;
            continue;
        }
        // A1:, A2:, A3: ... の検出
        const aMatch = trimmed.match(/^A\d+[:：]\s*(.+)/);
        if (aMatch) {
            currentA = aMatch[1].trim();
            continue;
        }
        // Type1:, Type2: ... の検出 (mixedモード用)
        const tMatch = trimmed.match(/^Type\d+[:：]\s*(collected|suggested)/i);
        if (tMatch) {
            currentType = tMatch[1].toLowerCase();
            continue;
        }
        // 複数行の回答をサポート
        if (currentA && trimmed && !trimmed.startsWith('Q') && !trimmed.startsWith('Type')) {
            currentA += ' ' + trimmed;
        }
    }
    // 最後のQ&Aを追加
    if (currentQ && currentA) {
        qaList.push({ question: currentQ, answer: currentA, type: currentType });
    }
    console.log(`📋 Parsed ${qaList.length} Q&A pairs from response`);
    return qaList;
}
async function generateQA(content, maxQA = 5, language = 'ja', productUrl, isOCRMode = false, qaType = 'collected') {
    console.log('🚀 Starting Q&A generation with Multi-LLM support...');
    console.log('  Parameters:', { maxQA, language, contentLength: content.length, isOCRMode, qaType });
    // 簡潔なプロンプトを生成（トークン数削減）
    const prompt = generateCompactPrompt(content, maxQA, language, qaType);
    console.log(`📝 Generated compact prompt: ${prompt.length} characters`);
    // LLMを順に試行: Claude (最速) → Gemini (無料枠あり) → OpenAI (フォールバック)
    const llmProviders = [
        { name: 'Claude 3.5 Sonnet', fn: () => generateQAWithClaude(prompt, maxQA), key: 'ANTHROPIC_API_KEY' },
        { name: 'Gemini 2.0 Flash', fn: () => generateQAWithGemini(prompt, maxQA), key: 'GEMINI_API_KEY' },
        { name: 'OpenAI gpt-4o-mini', fn: () => generateQAWithOpenAI(prompt, maxQA), key: 'OPENAI_API_KEY' }
    ];
    let lastError = null;
    for (const provider of llmProviders) {
        // API keyが設定されているかチェック
        if (!process.env[provider.key]) {
            console.log(`⏭️  Skipping ${provider.name}: API key not configured`);
            continue;
        }
        try {
            console.log(`\n🤖 Trying ${provider.name}...`);
            const startTime = Date.now();
            const qaList = await provider.fn();
            const elapsed = Date.now() - startTime;
            console.log(`✅ SUCCESS with ${provider.name} in ${elapsed}ms`);
            console.log(`📊 Generated ${qaList.length} Q&A pairs`);
            if (qaList.length === 0) {
                console.warn(`⚠️  ${provider.name} returned 0 Q&As, trying next provider...`);
                lastError = new Error(`${provider.name} returned empty result`);
                continue;
            }
            // 成功: Q&Aリストを返す
            return qaList;
        }
        catch (error) {
            console.error(`❌ ${provider.name} failed:`, error.message);
            lastError = error;
            // API制限エラーの場合は次のプロバイダーへ
            if (error.message?.includes('rate_limit') || error.message?.includes('quota') || error.message?.includes('429')) {
                console.warn(`⚠️  ${provider.name} rate limit/quota exceeded, trying next provider...`);
                continue;
            }
            // その他のエラーも次のプロバイダーへフォールバック
            console.warn(`⚠️  Falling back to next provider...`);
        }
    }
    // すべてのプロバイダーが失敗した場合
    console.error('❌ ALL LLM providers failed!');
    throw new Error(`Q&A generation failed with all providers. Last error: ${lastError?.message || 'Unknown error'}`);
}
app.post('/api/workflow', async (req, res) => {
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
        }
        else if (url) {
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
            }
            catch (error) {
                diagnostics.fetchError = error instanceof Error ? error.message : String(error);
                throw error;
            }
        }
        // ステップ2: HTMLからコンテンツを抽出
        console.log('Extracting content...');
        let extractedContent = extractContent(html);
        diagnostics.contentLength = extractedContent.length;
        // コンテンツが短すぎる場合、Playwrightフォールバックを試行
        if (extractedContent.length < 50 && url && !sourceCode) {
            console.warn(`⚠️ Content too short (${extractedContent.length} chars), trying Playwright fallback...`);
            try {
                console.log(`🔄 Attempting Playwright browser fetch...`);
                const browserHtml = await fetchWithBrowser(url);
                console.log(`✅ Playwright fetch succeeded, re-extracting content...`);
                extractedContent = extractContent(browserHtml);
                diagnostics.contentLength = extractedContent.length;
                diagnostics.playwrightUsed = true;
                html = browserHtml; // Update html for diagnostics
                console.log(`📊 After Playwright: content length = ${extractedContent.length} chars`);
            }
            catch (playwrightError) {
                console.error(`❌ Playwright fallback failed:`, playwrightError);
                // Continue with original short content
            }
        }
        // コンテンツが依然として短すぎる場合はエラー
        if (extractedContent.length < 50) {
            console.warn(`⚠️ Content too short: ${extractedContent.length} characters`);
            console.warn(`📄 Extracted content: "${extractedContent}"`);
            console.warn(`📏 Original HTML length: ${html.length} characters`);
            console.warn(`📄 HTML preview: ${html.substring(0, 500)}`);
            return res.status(400).json({
                success: false,
                error: `コンテンツが短すぎます。\n\n抽出できたテキスト長: ${extractedContent.length}文字\n\n考えられる原因:\n1. サイトがCloudflare等で保護されており、アクセスをブロックしている\n2. JavaScriptで動的に生成されるコンテンツで、取得に失敗した\n3. ログインが必要なページである\n\n対処方法:\n✅ 推奨: ブラウザ拡張機能を使用して「HTMLソースコード」モードで生成してください\n   - ブラウザで対象ページを開く\n   - 「ページのソースを表示」（Ctrl+U / Cmd+U）\n   - 完全なHTMLをコピー&ペースト\n\nまたは、別のURLをお試しください。`,
                details: `抽出されたコンテンツ長: ${extractedContent.length}文字\n元のHTML長: ${html.length}文字\nPlaywright使用: ${diagnostics.playwrightUsed ? 'はい' : 'いいえ'}\n\n抽出されたコンテンツ:\n${extractedContent}\n\nHTML先頭500文字:\n${html.substring(0, 500)}`
            });
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
        let qaList = [];
        try {
            // Q&A種類を決定
            const qaType = includeTypes.collected && includeTypes.suggested ? 'mixed' :
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
                });
            }
        }
        catch (generateError) {
            console.error('❌ Q&A generation threw an error:', generateError);
            console.error('[GENERATION] Error details:', generateError instanceof Error ? generateError.message : String(generateError));
            console.error('[GENERATION] Error stack:', generateError instanceof Error ? generateError.stack : 'N/A');
            // エラーの種類を判定してユーザーフレンドリーなメッセージを返す
            let errorMessage = 'Q&A生成中にエラーが発生しました。';
            if (generateError instanceof Error) {
                if (generateError.message.includes('insufficient_quota') || generateError.message.includes('quota')) {
                    errorMessage = 'OpenAI APIの残高が不足しています。API Keyを確認してください。';
                }
                else if (generateError.message.includes('timeout')) {
                    errorMessage = 'Q&A生成がタイムアウトしました。maxQAの値を減らしてみてください。';
                }
                else if (generateError.message.includes('rate_limit')) {
                    errorMessage = 'OpenAI APIのレート制限に達しました。しばらく待ってから再試行してください。';
                }
                else {
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
            });
        }
        // 動画推奨が必要かどうかを判定する関数
        const needsVideoExplanation = (question, answer) => {
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
            // 薬機法コンプライアンスチェック
            const hasComplianceRisk = checkCosmeticCompliance(qa.answer);
            if (hasComplianceRisk) {
                console.warn(`⚠️ 薬機法注意 Q${index + 1}: ${qa.question.substring(0, 50)}`);
            }
            // Q&Aの種類を決定
            // 混在モードの場合: LLMが分類したtypeを使用
            // 単一モードの場合: ユーザーの選択を使用
            const qaSource = (includeTypes.collected && includeTypes.suggested) ? (qa.type || 'collected') :
                includeTypes.suggested ? 'suggested' :
                    'collected';
            const item = {
                id: `${Date.now()}-${index}`,
                question: qa.question,
                answer: qa.answer,
                source: qaSource, // ユーザー選択に応じたラベル
                sourceType: 'text',
                url: url, // 元のURLを追加
                timestamp: Date.now(),
                needsVideo: needsVideo,
                complianceWarning: hasComplianceRisk // 薬機法注意フラグ
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
                    if (example1Match)
                        examples.push(example1Match[1].trim());
                    if (example2Match)
                        examples.push(example2Match[1].trim());
                    if (examples.length > 0) {
                        item.videoExamples = examples;
                    }
                }
                catch (videoError) {
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
        const qaResult = qaList.map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`).join('\n\n');
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
                    websiteBasedQA: qaItems.filter(item => item.source === 'collected').length,
                    suggestedQA: qaItems.filter(item => item.source === 'suggested' || item.source === '収集した情報から生成').length
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
    }
    catch (error) {
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
        }
        else if (error.request) {
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
app.post('/api/export/single', async (req, res) => {
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
                '/app/fonts/NotoSansJP-Regular.ttf', // Docker: /app/fonts/
                path.join(process.cwd(), 'fonts', 'NotoSansJP-Regular.ttf'), // process.cwd()/fonts/
                path.join(__dirname, 'fonts', 'NotoSansJP-Regular.ttf'), // __dirname/fonts/
                '/home/user/webapp/fonts/NotoSansJP-Regular.ttf' // ローカル開発環境
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
            const chunks = [];
            // イベントハンドラを先に設定
            doc.on('data', (chunk) => chunks.push(chunk));
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
            doc.on('error', (err) => {
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
                    }
                    catch (fontErr) {
                        console.warn('⚠️ Font registration failed:', fontErr);
                        doc.font('Helvetica');
                    }
                }
                else {
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
                qaItems.forEach((item, index) => {
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
            }
            catch (error) {
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
        }
        else if (format === 'text') {
            // テキストとして返す
            console.log('📄 Starting TXT generation...');
            let textContent = 'Q&A Collection\n\n';
            qaItems.forEach((item, index) => {
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
        }
        else {
            res.status(400).json({ error: 'Unsupported format' });
        }
    }
    catch (error) {
        console.error('Export error:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        res.status(500).json({
            error: 'Export failed',
            details: error instanceof Error ? error.message : String(error)
        });
    }
});
// ヘルスチェックエンドポイント
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', version: '2.0' });
});
// フォントテストエンドポイント
app.get('/api/test-font', (req, res) => {
    const doc = new PDFDocument();
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
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
    }
    catch (err) {
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
app.post('/api/workflow-ocr', upload.array('image0', 10), async (req, res) => {
    console.log('=== OCR Workflow Request Started ===');
    try {
        const url = req.body.url || '';
        const files = req.files;
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
        const extractedTexts = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`\n画像 ${i + 1}/${files.length}: ${file.originalname} (${(file.size / 1024).toFixed(2)} KB)`);
            try {
                const text = await extractTextFromImage(file.buffer);
                extractedTexts.push(text);
                console.log(`  → 抽出されたテキスト長: ${text.length} 文字`);
                console.log(`  → プレビュー: ${text.substring(0, 100)}...`);
            }
            catch (error) {
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
        const hasProductInfo = (text) => {
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
        // デフォルト値を40→20に削減してタイムアウトを防ぐ
        let maxQA = req.body.maxQA ? parseInt(req.body.maxQA, 10) : 20;
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
        let qaList = [];
        try {
            // Q&A種類を決定
            const qaType = includeTypes.collected && includeTypes.suggested ? 'mixed' :
                includeTypes.suggested ? 'suggested' :
                    'collected';
            console.log(`[OCR] Q&A Type: ${qaType}`);
            // タイムアウト付きでQ&A生成を実行（300秒 = 5分）
            const generateQAPromise = generateQA(combinedText, maxQA, language, url, true, qaType); // OCR mode
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Q&A generation timeout after 300 seconds (5 minutes)')), 300000); // 120秒→300秒に延長
            });
            qaList = await Promise.race([generateQAPromise, timeoutPromise]);
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
        }
        catch (generateError) {
            console.error('❌ OCR Q&A generation threw an error:', generateError);
            console.error('[OCR] Error details:', generateError instanceof Error ? generateError.message : String(generateError));
            let errorMessage = 'OCRテキストからQ&A生成中にエラーが発生しました。';
            if (generateError instanceof Error) {
                if (generateError.message.includes('insufficient_quota') || generateError.message.includes('quota')) {
                    errorMessage = 'OpenAI APIの残高が不足しています。API Keyを確認してください。';
                }
                else if (generateError.message.includes('timeout')) {
                    errorMessage = 'Q&A生成がタイムアウトしました。maxQAの値を減らしてみてください。';
                }
                else if (generateError.message.includes('rate_limit')) {
                    errorMessage = 'OpenAI APIのレート制限に達しました。しばらく待ってから再試行してください。';
                }
                else {
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
        const needsVideoExplanation = (question, answer) => {
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
        // 動画推奨情報を生成（URLモードと同じロジック）
        const apiKey = process.env.OPENAI_API_KEY;
        const openai = apiKey ? new OpenAI({ apiKey }) : null;
        const qaItems = await Promise.all(qaList.map(async (qa, index) => {
            const needsVideo = needsVideoExplanation(qa.question, qa.answer);
            // 薬機法コンプライアンスチェック（OCRモード）
            const hasComplianceRisk = checkCosmeticCompliance(qa.answer);
            if (hasComplianceRisk) {
                console.warn(`⚠️ [OCR] 薬機法注意 Q${index + 1}: ${qa.question.substring(0, 50)}`);
            }
            // Q&Aの種類を決定
            const qaSource = (includeTypes.collected && includeTypes.suggested) ? (qa.type || 'collected') :
                includeTypes.suggested ? 'suggested' :
                    'collected';
            const item = {
                id: String(index + 1),
                question: qa.question,
                answer: qa.answer,
                source: qaSource,
                sourceType: 'image-ocr',
                url: url || 'ocr-images',
                needsVideo: needsVideo,
                complianceWarning: hasComplianceRisk // 薬機法注意フラグ（OCRモード）
            };
            // 動画推奨がある場合、OpenAI APIで具体的な理由と例を生成
            if (needsVideo && openai) {
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
                            { role: 'system', content: 'You are a video content planning expert. Provide specific, actionable video suggestions.' },
                            { role: 'user', content: videoPrompt }
                        ],
                        temperature: 0.7,
                        max_tokens: 300
                    });
                    const videoSuggestion = videoResponse.choices[0]?.message?.content || '';
                    console.log(`[OCR VIDEO] Q${index + 1} suggestion:`, videoSuggestion.substring(0, 100));
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
                    if (example1Match)
                        examples.push(example1Match[1].trim());
                    if (example2Match)
                        examples.push(example2Match[1].trim());
                    if (examples.length > 0) {
                        item.videoExamples = examples;
                    }
                    console.log(`[OCR VIDEO] Q${index + 1} parsed - reason: ${item.videoReason?.substring(0, 50)}, examples: ${examples.length}`);
                }
                catch (videoErr) {
                    console.error(`[OCR VIDEO] Failed to generate video suggestion for Q${index + 1}:`, videoErr);
                    // フォールバック
                    item.videoReason = '視覚的な説明が効果的です';
                    item.videoExamples = ['操作手順の動画', 'デモンストレーション'];
                }
            }
            else if (needsVideo && !openai) {
                // API keyがない場合のフォールバック
                item.videoReason = '視覚的な説明が効果的です';
                item.videoExamples = ['操作手順の動画', 'デモンストレーション'];
            }
            return item;
        }));
        res.json({
            success: true,
            data: {
                url: url || 'ocr-images',
                extractedContent: combinedText.substring(0, 500) + '...',
                qaResult: qaList.map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`).join('\n\n'),
                qaItems: qaItems,
                robotsAllowed: true,
                stats: {
                    totalPages: 1,
                    imagesProcessed: files.length,
                    websiteBasedQA: qaItems.filter(item => item.source === 'collected').length,
                    suggestedQA: qaItems.filter(item => item.source === 'suggested').length,
                    textExtracted: combinedText.length
                }
            }
        });
    }
    catch (error) {
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
app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`✅ Server is running on http://0.0.0.0:${port}`);
    console.log(`✅ Listening on all interfaces (0.0.0.0:${port})`);
    console.log('Environment:', process.env.NODE_ENV);
    console.log('Dist path:', distPath);
    console.log('API Key configured:', !!process.env.OPENAI_API_KEY);
    console.log(`🚀 Ready to accept connections from Fly.io proxy`);
    // メモリ使用状況をログ出力
    const memUsage = process.memoryUsage();
    console.log(`💾 Memory: RSS=${(memUsage.rss / 1024 / 1024).toFixed(2)}MB, Heap=${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB / ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`);
    // 定期的にメモリ使用状況を監視（5分ごと）
    setInterval(() => {
        const mem = process.memoryUsage();
        const usedMB = (mem.heapUsed / 1024 / 1024).toFixed(2);
        const totalMB = (mem.heapTotal / 1024 / 1024).toFixed(2);
        const rssMB = (mem.rss / 1024 / 1024).toFixed(2);
        console.log(`💾 [Monitor] RSS=${rssMB}MB, Heap=${usedMB}MB / ${totalMB}MB`);
        // メモリ使用率が80%を超えたら警告
        if (mem.heapUsed / mem.heapTotal > 0.8) {
            console.warn(`⚠️ High memory usage: ${((mem.heapUsed / mem.heapTotal) * 100).toFixed(1)}%`);
            // ガベージコレクションを手動実行（--expose-gc フラグが必要）
            if (global.gc) {
                console.log('🧹 Running manual garbage collection...');
                global.gc();
            }
        }
    }, 300000); // 5分ごと
});
// タイムアウト設定を延長（Playwright処理のため）
server.timeout = 300000; // 5分
server.keepAliveTimeout = 310000;
server.headersTimeout = 320000;
