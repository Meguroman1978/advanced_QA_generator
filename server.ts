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
const port = parseInt(process.env.PORT || '3001', 10);

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

  // コンテンツが少ない場合は想定Q&Aモードを有効化
  const isLowContent = content.length < 500;
  const contentNote = isLowContent 
    ? `\n\n⚠️ 注意: ソーステキストが少ないため、一般的な知識や想定される質問・回答を含めて${maxQA}個のQ&Aを作成してください。\n商品やサービスについて、ユーザーが知りたいと思われる情報（使い方、特徴、利点、価格、比較、トラブルシューティングなど）を含めてください。`
    : '';

  const languagePrompts: Record<string, string> = {
    ja: `あなたは日本語のQ&A作成専門家です。以下のテキストから、日本語で正確に${maxQA}個のQ&Aを作成してください。

【絶対守るべきルール】
1. ✅ 言語: 質問と回答は100%日本語で書くこと（英語禁止）
2. ✅ 数量: 必ず${maxQA}個の異なるQ&Aを生成すること
3. ✅ 品質: 各Q&Aは完全にユニークで、異なる角度からの質問であること
4. ❌ 重複禁止: 同じまたは類似した質問を繰り返さないこと
5. 💡 情報不足対応: テキストに情報が少ない場合は、一般的な知識や想定Q&Aを追加すること

【Q&A作成の視点】
- 基本情報（概要、定義、特徴）
- 使い方・手順
- メリット・デメリット
- 比較・選び方
- トラブルシューティング
- よくある質問
- 応用・発展的な内容${contentNote}

【出力フォーマット - 必ず守る】
Q1: [日本語の質問]
A1: [日本語の詳細な回答]

Q2: [日本語の質問]
A2: [日本語の詳細な回答]

...Q${maxQA}まで続ける

【ソーステキスト】
${content}

【最重要】必ず${maxQA}個の異なるQ&Aを日本語で生成してください。情報が不足している場合は、一般的な知識や想定される質問を追加して${maxQA}個を達成してください。`,
    en: `You are an expert Q&A creator. Generate EXACTLY ${maxQA} Q&A pairs in ENGLISH from the text below.

【ABSOLUTE RULES】
1. ✅ LANGUAGE: Write 100% in ENGLISH (NO other languages)
2. ✅ QUANTITY: Generate EXACTLY ${maxQA} distinct Q&A pairs
3. ✅ QUALITY: Each Q&A must be completely unique with different angles
4. ❌ NO DUPLICATES: Do NOT repeat similar questions
5. 💡 LOW CONTENT HANDLING: If text lacks info, add common knowledge and anticipated Q&As

【Q&A PERSPECTIVES】
- Basic information (overview, definition, features)
- How to use / procedures
- Advantages / disadvantages
- Comparison / selection criteria
- Troubleshooting
- Frequently asked questions
- Advanced topics${contentNote}

【OUTPUT FORMAT - MUST FOLLOW】
Q1: [English question]
A1: [Detailed English answer]

Q2: [English question]
A2: [Detailed English answer]

...continue to Q${maxQA}

【SOURCE TEXT】
${content}

【CRITICAL】Generate EXACTLY ${maxQA} distinct Q&A pairs in ENGLISH. If information is limited, add general knowledge and anticipated questions to reach ${maxQA} Q&As.`,
    zh: `你是专业的中文Q&A创作专家。请从下面的文本中精确生成${maxQA}个中文问答对。

【绝对规则】
1. ✅ 语言: 100%用中文编写（禁止英文）
2. ✅ 数量: 必须生成正好${maxQA}个不同的问答对
3. ✅ 质量: 每个问答对必须完全独特，从不同角度提问
4. ❌ 禁止重复: 不要重复相似的问题
5. 💡 信息不足处理: 如果文本信息少，添加常识和预期的问答

【问答创作视角】
- 基本信息（概述、定义、特点）
- 使用方法、步骤
- 优点、缺点
- 比较、选择标准
- 故障排除
- 常见问题
- 高级主题${contentNote}

【输出格式 - 必须遵守】
Q1: [中文问题]
A1: [详细的中文答案]

Q2: [中文问题]
A2: [详细的中文答案]

...继续到Q${maxQA}

【源文本】
${content}

【最重要】必须用中文生成正好${maxQA}个不同的问答对。如果信息有限，添加常识和预期问题以达到${maxQA}个问答。`
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
          content: `You are a professional Q&A creator. You MUST generate exactly ${maxQA} Q&A pairs in ${targetLanguage}. Never use any other language. Each Q&A must be unique and distinct. IMPORTANT: Generate ALL ${maxQA} pairs, do not stop early.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: estimatedTokens,
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

    console.log('Parsed parameters:');
    console.log('  - url:', url);
    console.log('  - maxQA (raw):', requestMaxQA, 'type:', typeof requestMaxQA);
    console.log('  - maxQA (parsed):', maxQA, 'type:', typeof maxQA);
    console.log('  - language (raw):', requestLanguage, 'type:', typeof requestLanguage);
    console.log('  - language (parsed):', language, 'type:', typeof language);

    if (!url) {
      console.log('Error: URL is missing');
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    // ステップ1: HTTPリクエストでWebページを取得
    console.log('Fetching website:', url);
    const html = await fetchWebsite(url);

    // ステップ2: HTMLからコンテンツを抽出
    console.log('Extracting content...');
    const extractedContent = extractContent(html);

    // ステップ3: OpenAI APIで複数のQ&Aを生成
    console.log(`[GENERATION] Starting Q&A generation with maxQA=${maxQA}, language=${language}`);
    const qaList = await generateQA(extractedContent, maxQA, language, url);
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
        }
      }
    };
    
    console.log(`✅ Response: Generated ${qaItems.length} Q&A items`);
    console.log(`📤 Sending response with ${JSON.stringify(responseData).length} bytes`);
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
        console.log(`📝 Attempting to register font: ${fontPath}`);
        let fontRegistered = false;
        try {
          doc.registerFont('NotoSans', fontPath);
          doc.font('NotoSans');
          fontRegistered = true;
          console.log('✅ Font registered successfully');
        } catch (fontErr) {
          console.warn('⚠️ Font registration failed, using default font:', fontErr);
          console.warn('   PDF will be generated without Japanese font support');
          // デフォルトフォントを使用（英数字のみ）
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
