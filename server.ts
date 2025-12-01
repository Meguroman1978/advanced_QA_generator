import express, { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import PDFDocument from 'pdfkit';
import fs from 'fs';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// 静的ファイルのパスを定義（後で使用）
const distPath = path.join(process.cwd(), 'dist');

interface WorkflowRequest {
  url: string;
  maxQA?: number;
  language?: string;
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
}

// HTTPリクエストを実行してHTMLを取得（通常のブラウザとして振る舞う）
async function fetchWebsite(url: string): Promise<string> {
  try {
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
        'Cache-Control': 'max-age=0'
      },
      timeout: 15000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500 // 500未満のステータスコードを受け入れる
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to fetch website: ${error}`);
  }
}

// HTMLからテキストコンテンツを抽出
function extractContent(html: string): string {
  const $ = cheerio.load(html);
  
  // スクリプト、スタイル、ナビゲーションなどを削除
  $('script, style, nav, header, footer').remove();
  
  // bodyタグのテキストを取得
  const content = $('body').text();
  
  // 余分な空白を削除して整形
  return content
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 4000); // OpenAI APIの制限を考慮して4000文字に制限
}

// OpenAI APIを使用して複数のQ&Aを生成
async function generateQA(content: string, maxQA: number = 5, language: string = 'ja'): Promise<Array<{question: string, answer: string}>> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  console.log('API Key check:', apiKey ? `Found (length: ${apiKey.length})` : 'NOT FOUND');
  console.log('Generating Q&A:', { maxQA, language, contentLength: content.length });
  
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured');
  }

  const openai = new OpenAI({
    apiKey: apiKey
  });

  const languagePrompts: Record<string, string> = {
    ja: `以下のWebサイトのテキストから、異なる重要なポイントについて高品質なQ&A（質問と回答）を作成してください。

重要な注意事項：
- 各Q&Aは完全にユニークで、異なるトピックを扱うこと
- 同じ質問や類似した質問を繰り返さないこと
- 同じ回答や類似した回答を繰り返さないこと
- 質の高いQ&Aのみを作成し、無理に数を増やさないこと
- コンテンツから得られる情報が少ない場合は、少ない数でも構いません
- 目標: 最大${maxQA}個（質が高ければそれ以下でも可）

形式：
Q1: [ユニークな質問]
A1: [具体的な回答]

Q2: [Q1とは異なる質問]
A2: [具体的な回答]

テキスト:
${content}`,
    en: `Create high-quality, unique Q&A pairs about different important points from the following website text.

CRITICAL REQUIREMENTS:
- Each Q&A must be completely unique and cover different topics
- Do NOT repeat the same or similar questions
- Do NOT repeat the same or similar answers
- Focus on quality over quantity - don't force creation of low-quality Q&As
- If the content has limited information, fewer Q&As are acceptable
- Target: Up to ${maxQA} pairs (fewer is fine if quality is maintained)

Format:
Q1: [unique question]
A1: [specific answer]

Q2: [different question from Q1]
A2: [specific answer]

Text:
${content}`,
    zh: `从以下网站文本中创建关于不同重要要点的高质量问答对。

关键要求：
- 每个问答必须完全独特，涵盖不同主题
- 不要重复相同或相似的问题
- 不要重复相同或相似的答案
- 注重质量而非数量 - 不要强制创建低质量问答
- 如果内容信息有限，较少的问答是可以接受的
- 目标：最多${maxQA}对（如果保持质量，较少也可以）

格式：
Q1: [独特问题]
A1: [具体答案]

Q2: [与Q1不同的问题]
A2: [具体答案]

文本：
${content}`
  };

  try {
    const prompt = languagePrompts[language] || languagePrompts['ja'];
    
    // maxQAに応じてmax_tokensを調整（1つのQ&Aにつき約60トークン+バッファ）
    // gpt-3.5-turboの最大出力トークンは4096、gpt-4は8192
    const estimatedTokens = Math.min(maxQA * 80 + 1000, 4096);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: estimatedTokens
    });

    const generatedText = response.choices[0]?.message?.content || '';
    console.log(`OpenAI response length: ${generatedText.length} characters`);
    
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
    
    console.log(`Parsed ${qaItems.length} Q&A items from response`);
    
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
    
    // 不足している場合は警告
    if (uniqueQA.length < maxQA * 0.7) {
      console.warn(`Warning: Requested ${maxQA} Q&As but only generated ${uniqueQA.length} unique items`);
    }
    
    // maxQAの数に制限（超過分はカット）
    return uniqueQA.slice(0, maxQA);
  } catch (error) {
    throw new Error(`Failed to generate Q&A: ${error}`);
  }
}

// メインワークフローエンドポイント
app.post('/api/workflow', async (req: Request<{}, {}, WorkflowRequest>, res: Response<WorkflowResponse>) => {
  console.log('=== Workflow Request Started ===');
  console.error('RECEIVED REQUEST:', req.body);
  console.log('Request body:', req.body);
  console.log('Request headers:', req.headers);
  
  try {
    const { url, maxQA = 5, language = 'ja' } = req.body;

    if (!url) {
      console.log('Error: URL is missing');
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    console.log('Request params:', { url, maxQA, language });

    // ステップ1: HTTPリクエストでWebページを取得
    console.log('Fetching website:', url);
    const html = await fetchWebsite(url);

    // ステップ2: HTMLからコンテンツを抽出
    console.log('Extracting content...');
    const extractedContent = extractContent(html);

    // ステップ3: OpenAI APIで複数のQ&Aを生成
    console.log(`Generating ${maxQA} Q&A items...`);
    const qaList = await generateQA(extractedContent, maxQA, language);

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

    // qaItemsを生成（動画推奨情報を含む）
    const qaItems = qaList.map((qa, index) => {
      const needsVideo = needsVideoExplanation(qa.question, qa.answer);
      console.error(`DEBUG Q${index + 1} needsVideo: ${needsVideo} - Q: ${qa.question.substring(0, 50)}`);
      
      const item: any = {
        id: `${Date.now()}-${index}`,
        question: qa.question,
        answer: qa.answer,
        source: 'collected' as const,
        sourceType: 'text' as const,
        timestamp: Date.now(),
        needsVideo: needsVideo
      };
      
      if (needsVideo) {
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
            : 'Demonstration video of the operation',
          language === 'ja'
            ? '実際の使用例を示す動画'
            : language === 'zh'
            ? '实际使用示例视频'
            : 'Video showing actual usage examples'
        ];
      }
      
      return item;
    });

    // 全Q&Aを結合した文字列も生成（後方互換性のため）
    const qaResult = qaList.map((qa, i) => `Q${i+1}: ${qa.question}\nA${i+1}: ${qa.answer}`).join('\n\n');

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
        }
      }
    };
    
    console.log(`Response: Generated ${qaItems.length} Q&A items`);
    res.json(responseData);
  } catch (error) {
    console.error('Workflow error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// PDFエクスポートエンドポイント（シンプル版）
app.post('/api/export/single', async (req: Request, res: Response) => {
  try {
    const { qaItems, format } = req.body;
    
    console.log(`Export request: format=${format}, items=${qaItems?.length}`);
    
    if (!qaItems || !Array.isArray(qaItems) || qaItems.length === 0) {
      return res.status(400).json({ error: 'Q&A items are required' });
    }
    
    if (format === 'pdf') {
      console.log('Starting PDF generation...');
      // PDFKitを使用してPDFを生成（同期的に）
      // 複数のパスを試行
      const fontPaths = [
        '/home/user/webapp/fonts/NotoSansJP-Regular.ttf',
        path.join(process.cwd(), 'fonts', 'NotoSansJP-Regular.ttf'),
        path.join(__dirname, 'fonts', 'NotoSansJP-Regular.ttf')
      ];
      console.log('Trying font paths:', fontPaths);
      
      let fontPath = '';
      for (const p of fontPaths) {
        if (fs.existsSync(p)) {
          fontPath = p;
          console.log(`Font found at: ${fontPath}`);
          break;
        }
      }
      
      if (!fontPath) {
        console.error('Font not found in any of these paths:', fontPaths);
        return res.status(500).json({ error: 'Font file not found' });
      }
      
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      
      // イベントハンドラを先に設定
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        console.log(`PDF generated: ${pdfBuffer.length} bytes`);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="qa-collection.pdf"');
        res.send(pdfBuffer);
      });
      
      // エラーハンドラ
      doc.on('error', (err: Error) => {
        console.error('PDF generation error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'PDF generation failed' });
        }
      });
      
      try {
        // フォント登録
        doc.registerFont('NotoSans', fontPath);
        doc.font('NotoSans');
        console.log('Font registered successfully');
        
        // タイトル
        doc.fontSize(20).text('Q&A Collection', { align: 'center' });
        doc.moveDown(2);
        
        // Q&Aを追加
        qaItems.forEach((item: any, index: number) => {
          doc.fontSize(14).fillColor('blue').text(`Q${index + 1}: ${item.question}`);
          doc.moveDown(0.5);
          doc.fontSize(12).fillColor('black').text(`A: ${item.answer}`);
          doc.moveDown(1.5);
          
          // 動画推奨情報
          if (item.needsVideo) {
            doc.fontSize(10).fillColor('red').text('🎥 Video Recommended');
            if (item.videoReason) {
              doc.fontSize(9).fillColor('gray').text(`Reason: ${item.videoReason}`);
            }
            if (item.videoExamples && item.videoExamples.length > 0) {
              doc.fontSize(9).fillColor('gray').text(`Examples: ${item.videoExamples.join(', ')}`);
            }
            doc.moveDown(1);
          }
        });
        
        // PDF終了
        doc.end();
      } catch (error) {
        console.error('PDF content generation error:', error);
        doc.end();
        if (!res.headersSent) {
          res.status(500).json({ error: 'PDF content generation failed' });
        }
      }
    } else if (format === 'text') {
      // テキストとして返す
      let textContent = 'Q&A Collection\n\n';
      qaItems.forEach((item: any, index: number) => {
        textContent += `Q${index + 1}: ${item.question}\n`;
        textContent += `A${index + 1}: ${item.answer}\n\n`;
      });
      
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', 'attachment; filename="qa-collection.txt"');
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

// 静的ファイルを提供（APIルートの後に配置）
app.use(express.static(distPath));

// すべての非APIルートでindex.htmlを返す（SPA用）
// Express 5では * の代わりに /.* を使用
app.get(/^(?!\/api).*$/, (req: Request, res: Response) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${port}`);
  console.log('Environment:', process.env.NODE_ENV);
  console.log('Dist path:', distPath);
  console.log('API Key configured:', !!process.env.OPENAI_API_KEY);
});
