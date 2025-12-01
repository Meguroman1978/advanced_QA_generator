import axios from 'axios';
import * as cheerio from 'cheerio';
import { CrawlResult } from './types';

export async function crawlPage(url: string): Promise<CrawlResult> {
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 30000,
      maxRedirects: 5,
      responseType: 'arraybuffer'
    });

    // 文字エンコーディングを正しく処理
    let html = response.data.toString('utf-8');
    
    // Shift_JISやEUC-JPの場合は変換が必要だが、一旦UTF-8で試す
    // Content-Typeヘッダーから文字エンコーディングをチェック
    const contentType = response.headers['content-type'] || '';
    if (contentType.toLowerCase().includes('shift_jis') || contentType.toLowerCase().includes('shift-jis')) {
      try {
        const iconv = require('iconv-lite');
        html = iconv.decode(response.data, 'Shift_JIS');
      } catch (e) {
        console.warn('Failed to decode as Shift_JIS, using UTF-8');
      }
    }

    const $ = cheerio.load(html, { decodeEntities: true });
    
    // スクリプト、スタイル、ナビゲーションなどを削除
    $('script, style, nav, header, footer, aside, noscript, iframe[src*="google"], iframe[src*="facebook"]').remove();
    
    // テキストコンテンツを抽出
    let content = $('body').text()
      .replace(/\s+/g, ' ')
      .replace(/[\r\n]+/g, ' ')
      .trim();
    
    // 空白のみの場合はメインコンテンツを試す
    if (!content || content.length < 100) {
      content = $('main, article, .content, #content, .main, #main').text()
        .replace(/\s+/g, ' ')
        .replace(/[\r\n]+/g, ' ')
        .trim();
    }
    
    // まだコンテンツが少ない場合は全体から取得
    if (!content || content.length < 50) {
      content = $.text()
        .replace(/\s+/g, ' ')
        .replace(/[\r\n]+/g, ' ')
        .trim();
    }
    
    // 画像URLを収集
    const images: string[] = [];
    $('img').each((_, elem) => {
      const src = $(elem).attr('src') || $(elem).attr('data-src') || $(elem).attr('data-lazy-src');
      if (src && !src.startsWith('data:')) {
        try {
          const imageUrl = new URL(src, url).href;
          // 有効なプロトコルのみ許可
          if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
            images.push(imageUrl);
          }
        } catch (e) {
          console.warn(`Invalid image URL: ${src}`);
        }
      }
    });
    
    // 動画URLを収集（iframe, video要素）
    const videos: string[] = [];
    $('iframe, video').each((_, elem) => {
      const src = $(elem).attr('src') || $(elem).find('source').attr('src');
      if (src) {
        try {
          const videoUrl = new URL(src, url).href;
          // YouTubeやVimeoなどの動画URLのみ追加
          if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
            videos.push(videoUrl);
          }
        } catch (e) {
          console.warn(`Invalid video URL: ${src}`);
        }
      }
    });
    
    // PDF URLを収集
    const pdfs: string[] = [];
    $('a[href$=".pdf"], a[href*=".pdf?"]').each((_, elem) => {
      const href = $(elem).attr('href');
      if (href) {
        try {
          const pdfUrl = new URL(href, url).href;
          if (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')) {
            pdfs.push(pdfUrl);
          }
        } catch (e) {
          console.warn(`Invalid PDF URL: ${href}`);
        }
      }
    });
    
    // リンクを収集（サブドメインクローリング用）
    const links: string[] = [];
    $('a[href]').each((_, elem) => {
      const href = $(elem).attr('href');
      if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('javascript:') && !href.startsWith('tel:')) {
        try {
          const linkUrl = new URL(href, url).href;
          if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://')) {
            links.push(linkUrl);
          }
        } catch (e) {
          // 無効なURLは無視
        }
      }
    });
    
    return {
      url,
      content,
      images: [...new Set(images)], // 重複を除去
      videos: [...new Set(videos)],
      pdfs: [...new Set(pdfs)],
      links: [...new Set(links)]
    };
  } catch (error: any) {
    console.error(`Failed to crawl ${url}:`, error);
    
    // エラーの詳細情報を含める
    let errorMessage = 'Failed to crawl page';
    if (error.response) {
      errorMessage = `HTTP ${error.response.status}: ${error.response.statusText}`;
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused - server may be down';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Request timed out';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    throw new Error(`Failed to crawl page: ${errorMessage}`);
  }
}

export function isSameDomain(url1: string, url2: string): boolean {
  try {
    const domain1 = new URL(url1).hostname;
    const domain2 = new URL(url2).hostname;
    
    // サブドメインも含めて同じドメインかチェック
    const mainDomain1 = domain1.split('.').slice(-2).join('.');
    const mainDomain2 = domain2.split('.').slice(-2).join('.');
    
    return mainDomain1 === mainDomain2;
  } catch (error) {
    return false;
  }
}

export async function crawlSubdomain(
  startUrl: string,
  maxPages: number = 50
): Promise<CrawlResult[]> {
  const visited = new Set<string>();
  const toVisit = [startUrl];
  const results: CrawlResult[] = [];
  
  while (toVisit.length > 0 && visited.size < maxPages) {
    const url = toVisit.shift()!;
    
    if (visited.has(url)) continue;
    visited.add(url);
    
    try {
      console.log(`Crawling: ${url} (${visited.size}/${maxPages})`);
      const result = await crawlPage(url);
      results.push(result);
      
      // 同じドメインのリンクをキューに追加
      for (const link of result.links) {
        if (!visited.has(link) && isSameDomain(startUrl, link)) {
          toVisit.push(link);
        }
      }
      
      // レート制限
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error crawling ${url}:`, error);
    }
  }
  
  return results;
}
