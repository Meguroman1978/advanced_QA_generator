import express, { Request, Response } from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

interface WorkflowRequest {
  url: string;
}

interface WorkflowResponse {
  success: boolean;
  data?: {
    url: string;
    extractedContent: string;
    qaResult: string;
  };
  error?: string;
}

// HTTPリクエストを実行してHTMLを取得
async function fetchWebsite(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
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

// OpenAI APIを使用してQ&Aを生成
async function generateQA(content: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured');
  }

  const openai = new OpenAI({
    apiKey: apiKey
  });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'user',
          content: `以下のWebサイトのテキストからQ&Aを作ってください。\n\n${content}`
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    return response.choices[0]?.message?.content || 'No response generated';
  } catch (error) {
    throw new Error(`Failed to generate Q&A: ${error}`);
  }
}

// メインワークフローエンドポイント
app.post('/api/workflow', async (req: Request<{}, {}, WorkflowRequest>, res: Response<WorkflowResponse>) => {
  try {
    const { url } = req.body;

    if (!url) {
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

    // ステップ3: OpenAI APIでQ&Aを生成
    console.log('Generating Q&A...');
    const qaResult = await generateQA(extractedContent);

    res.json({
      success: true,
      data: {
        url,
        extractedContent: extractedContent.substring(0, 500) + '...', // 最初の500文字のみ返す
        qaResult
      }
    });
  } catch (error) {
    console.error('Workflow error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// ヘルスチェックエンドポイント
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
