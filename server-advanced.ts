import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';
import path from 'path';
import fs from 'fs';
import { checkRobotsAllowed } from './server/robotsChecker';
import { crawlPage, crawlSubdomain } from './server/crawler';
import { generateQAFromCrawlResults } from './server/qaGenerator';
import { exportToExcel, exportToWord, exportToText, exportToPDF, exportToZip } from './server/exporter';
import { WorkflowConfig, WorkflowResponse, QAItem } from './server/types';
import * as cheerio from 'cheerio';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// 静的ファイルのパスを定義（後で使用）
const distPath = path.resolve(process.cwd(), 'dist');
console.log('📦 Dist path:', distPath);
console.log('📦 Dist exists:', fs.existsSync(distPath));

if (fs.existsSync(distPath)) {
  const distFiles = fs.readdirSync(distPath);
  console.log('📦 Files in dist:', distFiles);
}

// OpenAIクライアントを遅延初期化
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set. Please configure it in Render.com Dashboard > Environment.');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// CORS設定（セキュリティ強化版）
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176', 'http://localhost:5177', 'http://localhost:5178', 'http://localhost:5179'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    // Sandbox環境のURLパターンをチェック
    if (origin.includes('sandbox.novita.ai')) return callback(null, true);
    
    // 許可されたオリジンをチェック
    if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
      return callback(null, true);
    }
    
    // 開発環境では全て許可（本番環境では削除推奨）
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));

// レート制限設定（悪用防止）
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX) : 100, // 最大100リクエスト/15分
  message: { 
    success: false, 
    error: 'Too many requests from this IP, please try again later.' 
  },
  standardHeaders: true,
  legacyHeaders: false,
  // 一時API Keyを使用しているユーザーはより緩い制限
  skip: (req) => {
    const tempApiKey = req.headers['x-temp-api-key'] as string | undefined;
    return !!tempApiKey && tempApiKey.startsWith('sk-');
  }
});

// Q&A生成エンドポイント用の厳しいレート制限
const qaGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1時間
  max: process.env.QA_GENERATION_LIMIT ? parseInt(process.env.QA_GENERATION_LIMIT) : 20, // 最大20回/時間
  message: { 
    success: false, 
    error: 'Too many Q&A generation requests. Please try again later or use your own API Key.' 
  },
  standardHeaders: true,
  legacyHeaders: false,
  // 一時API Keyを使用しているユーザーは制限なし
  skip: (req) => {
    const tempApiKey = req.headers['x-temp-api-key'] as string | undefined;
    return !!tempApiKey && tempApiKey.startsWith('sk-');
  }
});

// 全エンドポイントに基本的なレート制限を適用
app.use('/api/', apiLimiter);

// オプション：簡易的な認証ミドルウェア（API KEYを持たないユーザー向け）
const authenticateRequest = (req: Request, res: Response, next: any) => {
  // 一時API Keyが提供されている場合は認証不要
  const tempApiKey = req.headers['x-temp-api-key'] as string | undefined;
  if (tempApiKey && tempApiKey.startsWith('sk-')) {
    console.log('[Auth] Using temporary API Key');
    return next();
  }
  
  // サーバーにAPI KEYが設定されている場合は認証不要（あなた専用）
  if (process.env.OPENAI_API_KEY) {
    console.log('[Auth] Using server API Key');
    return next();
  }
  
  // どちらもない場合はエラー
  console.log('[Auth] No API Key found');
  return res.status(401).json({ 
    success: false, 
    error: 'API Key required. Please provide your OpenAI API Key.' 
  });
};

// Q&Aストレージ（本番環境ではデータベースを使用）
const qaStorage = new Map<string, QAItem[]>();

// メインワークフローエンドポイント（レート制限適用）
app.post('/api/workflow/advanced', qaGenerationLimiter, authenticateRequest, async (req: Request<{}, {}, WorkflowConfig>, res: Response<WorkflowResponse>) => {
  try {
    const config = req.body;
    const tempApiKey = req.headers['x-temp-api-key'] as string | undefined;

    // URLsを正規化（後方互換性のためconfig.urlもサポート）
    const urls = config.urls || (config.url ? [config.url] : []);
    const validUrls = urls.filter(url => url && url.trim().length > 0);

    if (validUrls.length === 0 && !config.sourceCode) {
      return res.status(400).json({
        success: false,
        error: 'URLまたはソースコードが必要です'
      });
    }

    let results: any[] = [];
    let robotsAllowed = true;
    const processedUrls: string[] = [];

    // ソースコードから直接解析
    if (config.sourceCode) {
      console.log('Analyzing source code...');
      const $ = cheerio.load(config.sourceCode);
      
      $('script, style').remove();
      const content = $('body').text().replace(/\s+/g, ' ').trim();
      
      results.push({
        url: 'direct-source',
        content,
        images: [],
        videos: [],
        pdfs: [],
        links: []
      });
      processedUrls.push('source-code');
    }
    // URLからクローリング（最大3つ）
    else if (validUrls.length > 0) {
      console.log(`Processing ${validUrls.length} URL(s)...`);
      
      for (const url of validUrls.slice(0, 3)) {
        console.log(`Processing URL: ${url}`);
        
        // robots.txtチェック
        const urlAllowed = await checkRobotsAllowed(url);
        
        if (!urlAllowed) {
          console.log(`Robots.txt blocked: ${url}`);
          robotsAllowed = false;
          continue;
        }

        // クローリング実行
        try {
          if (config.scope === 'subdomain') {
            console.log(`Crawling subdomain for: ${url}`);
            const subdomainResults = await crawlSubdomain(url, 20);
            results.push(...subdomainResults);
          } else {
            console.log(`Crawling single page: ${url}`);
            const result = await crawlPage(url);
            results.push(result);
          }
          processedUrls.push(url);
        } catch (error) {
          console.error(`Error crawling ${url}:`, error);
        }
      }

      // すべてのURLがrobots.txtでブロックされた場合
      if (results.length === 0 && !robotsAllowed) {
        return res.json({
          success: true,
          data: {
            urls: validUrls,
            qaItems: [],
            stats: {
              totalPages: 0,
              imagesAnalyzed: 0,
              videosAnalyzed: 0,
              pdfsAnalyzed: 0,
              reviewsAnalyzed: 0
            },
            robotsAllowed: false
          }
        });
      }
    }

    // Q&A生成
    console.log('Generating Q&A...');
    const language = (req.body as any).language || 'ja'; // Get language from request
    const qaItems = await generateQAFromCrawlResults(
      results,
      config.maxQA,
      config.includeTypes,
      tempApiKey,
      language
    );

    // セッションIDを生成してQ&Aを保存
    const sessionId = Date.now().toString();
    qaStorage.set(sessionId, qaItems);

    // 統計情報
    const stats = {
      totalPages: results.length,
      imagesAnalyzed: results.reduce((sum, r) => sum + (r.images?.length || 0), 0),
      videosAnalyzed: results.reduce((sum, r) => sum + (r.videos?.length || 0), 0),
      pdfsAnalyzed: results.reduce((sum, r) => sum + (r.pdfs?.length || 0), 0),
      reviewsAnalyzed: 0
    };

    res.json({
      success: true,
      data: {
        urls: processedUrls.length > 0 ? processedUrls : ['source-code'],
        qaItems,
        stats,
        robotsAllowed
      }
    });
  } catch (error) {
    console.error('Workflow error:', error);
    
    let errorMessage = 'Unknown error occurred';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      
      // OpenAI APIエラーの詳細な検出
      if (errorMessage.includes('insufficient_quota') || 
          errorMessage.includes('quota exceeded') ||
          errorMessage.includes('You exceeded your current quota')) {
        errorMessage = 'OpenAI APIの残高が不足しています。別のAPI Keyを使用してください。';
      } else if (errorMessage.includes('invalid_api_key') || 
                 errorMessage.includes('Incorrect API key')) {
        errorMessage = 'OpenAI API Keyが無効です。正しいAPI Keyを入力してください。';
      } else if (errorMessage.includes('rate_limit')) {
        errorMessage = 'OpenAI APIのレート制限に達しました。しばらく待ってから再試行してください。';
      }
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage
    });
  }
});

// Q&A編集エンドポイント
app.put('/api/qa/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { sessionId, question, answer } = req.body;

    const qaItems = qaStorage.get(sessionId);
    if (!qaItems) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const item = qaItems.find(qa => qa.id === id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Q&A not found' });
    }

    item.question = question;
    item.answer = answer;

    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update Q&A' });
  }
});

// Q&A削除エンドポイント
app.delete('/api/qa/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { sessionId } = req.body;

    const qaItems = qaStorage.get(sessionId);
    if (!qaItems) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const index = qaItems.findIndex(qa => qa.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Q&A not found' });
    }

    qaItems.splice(index, 1);
    qaStorage.set(sessionId, qaItems);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete Q&A' });
  }
});

// 直接エクスポートエンドポイント（編集済みデータを受け取る）
// 個別ファイルエクスポート（PDF, Text）
app.post('/api/export/single', async (req: Request, res: Response) => {
  try {
    const { qaItems, format, includeLabels = true, includeVideoInfo = true, language = 'ja' } = req.body;
    
    console.log('[/api/export/single] Export request - language:', language, 'format:', format, 'includeLabels:', includeLabels, 'includeVideoInfo:', includeVideoInfo);

    if (!qaItems || !Array.isArray(qaItems)) {
      return res.status(400).json({ success: false, error: 'Invalid Q&A items' });
    }

    let buffer: Buffer | string;
    let contentType: string;
    let filename: string;

    switch (format) {
      case 'pdf':
        console.log('[/api/export/single] Generating PDF...');
        buffer = await exportToPDF(qaItems, includeLabels, includeVideoInfo, language);
        contentType = 'application/pdf';
        filename = 'qa-collection.pdf';
        break;
      case 'text':
        console.log('[/api/export/single] Generating Text...');
        buffer = exportToText(qaItems, includeLabels, includeVideoInfo, language);
        contentType = 'text/plain; charset=utf-8';
        filename = 'qa-collection.txt';
        break;
      default:
        return res.status(400).json({ success: false, error: 'Invalid format. Only pdf and text are supported.' });
    }

    console.log(`[/api/export/single] Successfully generated ${format} (${Buffer.isBuffer(buffer) ? buffer.length : buffer.length} bytes)`);
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('[/api/export/single] Export error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[/api/export/single] Error details:', errorMessage);
    if (error instanceof Error && error.stack) {
      console.error('[/api/export/single] Stack trace:', error.stack);
    }
    res.status(500).json({ success: false, error: `Export failed: ${errorMessage}` });
  }
});

// 翻訳エンドポイント
app.post('/api/translate', async (req: Request, res: Response) => {
  try {
    const { text, fromLang, toLang } = req.body;
    
    if (!text || !toLang) {
      return res.status(400).json({ success: false, error: 'Missing text or toLang' });
    }

    // 同じ言語の場合はそのまま返す
    if (fromLang === toLang) {
      return res.json({ success: true, translatedText: text });
    }

    const languageNames: { [key: string]: string } = {
      'ja': 'Japanese',
      'en': 'English',
      'zh': 'Chinese'
    };

    // OpenAI APIで翻訳
    const tempApiKey = req.headers['x-temp-api-key'] as string | undefined;
    const client = tempApiKey ? new OpenAI({ apiKey: tempApiKey }) : getOpenAIClient();

    const prompt = `Translate the following text from ${languageNames[fromLang] || fromLang} to ${languageNames[toLang] || toLang}. Only return the translated text without any additional explanation:\n\n${text}`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a professional translator. Translate the given text accurately and naturally.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const translatedText = response.choices[0]?.message?.content?.trim() || text;

    res.json({ success: true, translatedText });
  } catch (error) {
    console.error('[/api/translate] Translation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: `Translation failed: ${errorMessage}` });
  }
});

// 旧ZIPエクスポート（互換性のため残す）
app.post('/api/export/direct', async (req: Request, res: Response) => {
  try {
    const { qaItems, format, formats, includeLabels = true, language = 'ja' } = req.body;
    
    console.log('Export request - language:', language, 'formats:', formats);

    if (!qaItems || !Array.isArray(qaItems)) {
      return res.status(400).json({ success: false, error: 'Invalid Q&A items' });
    }

    // 常にZIPで返す（シンプル化）
    const exportFormats = formats && Array.isArray(formats) && formats.length > 0 ? formats : ['excel'];
    console.log('Exporting as ZIP with formats:', exportFormats);
    
    const buffer = await exportToZip(qaItems, exportFormats, includeLabels, language);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="qa-collection.zip"');
    res.send(buffer);
  } catch (error) {
    console.error('[/api/export/direct] Export error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[/api/export/direct] Error details:', errorMessage);
    if (error instanceof Error && error.stack) {
      console.error('[/api/export/direct] Stack trace:', error.stack);
    }
    res.status(500).json({ success: false, error: `Export failed: ${errorMessage}` });
  }
});

// エクスポートエンドポイント（セッションベース）
app.post('/api/export', async (req: Request, res: Response) => {
  try {
    const { sessionId, format, language = 'ja' } = req.body;

    const qaItems = qaStorage.get(sessionId);
    if (!qaItems) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    let buffer: Buffer | string;
    let contentType: string;
    let filename: string;

    switch (format) {
      case 'excel':
        buffer = await exportToExcel(qaItems, true, language);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = 'qa-collection.xlsx';
        break;
      case 'word':
        buffer = await exportToWord(qaItems, true, language);
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        filename = 'qa-collection.docx';
        break;
      case 'pdf':
        buffer = await exportToPDF(qaItems, true, language);
        contentType = 'application/pdf';
        filename = 'qa-collection.pdf';
        break;
      case 'text':
        buffer = exportToText(qaItems, true, language);
        contentType = 'text/plain';
        filename = 'qa-collection.txt';
        break;
      default:
        return res.status(400).json({ success: false, error: 'Invalid format' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('[/api/export] Export error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[/api/export] Error details:', errorMessage);
    if (error instanceof Error && error.stack) {
      console.error('[/api/export] Stack trace:', error.stack);
    }
    res.status(500).json({ success: false, error: `Export failed: ${errorMessage}` });
  }
});

// ヘルスチェック
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', version: '2.0' });
});

// 静的ファイルを提供（APIルートの後に配置）
app.use(express.static(distPath, { 
  maxAge: '1d',
  etag: true
}));

// すべての非APIルートでindex.htmlを返す（SPA用）- ルートパスを明示的に処理
app.get('/', (req: Request, res: Response) => {
  console.log('Serving index.html for root path');
  const indexPath = path.join(distPath, 'index.html');
  
  if (!fs.existsSync(indexPath)) {
    console.error('❌ index.html not found at:', indexPath);
    return res.status(500).send('Application not found');
  }
  
  res.sendFile(indexPath);
});

// その他すべての非APIルートでindex.htmlを返す（Express 5互換の正規表現を使用）
app.get(/^(?!\/api).*$/, (req: Request, res: Response) => {
  console.log('Serving index.html for path:', req.path);
  const indexPath = path.join(distPath, 'index.html');
  
  if (!fs.existsSync(indexPath)) {
    console.error('❌ index.html not found at:', indexPath);
    return res.status(500).send('Application not found');
  }
  
  res.sendFile(indexPath);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Advanced Q&A Server is running on http://0.0.0.0:${port}`);
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Dist path:', distPath);
  
  // distフォルダの存在確認
  if (fs.existsSync(distPath)) {
    console.log('✅ Dist folder exists');
    const files = fs.readdirSync(distPath);
    console.log('Dist folder contents:', files);
    
    if (fs.existsSync(path.join(distPath, 'index.html'))) {
      console.log('✅ index.html exists');
    } else {
      console.error('❌ index.html NOT FOUND in dist folder!');
    }
  } else {
    console.error('❌ Dist folder NOT FOUND:', distPath);
  }
  
  // APIキーのチェック
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('');
    console.error('⚠️  WARNING: OPENAI_API_KEY is not configured!');
    console.error('');
    console.error('Please set it in Render.com Dashboard:');
    console.error('1. Go to your service dashboard');
    console.error('2. Click "Environment" in the left sidebar');
    console.error('3. Click "Add Environment Variable"');
    console.error('4. Key: OPENAI_API_KEY');
    console.error('5. Value: sk-proj-...');
    console.error('6. Click "Save Changes"');
    console.error('');
    console.error('The API will not work until OPENAI_API_KEY is configured.');
    console.error('');
  } else {
    console.log('✅ API Key configured successfully');
  }
});
