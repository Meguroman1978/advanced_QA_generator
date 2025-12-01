// Q&Aアイテムの型定義
export interface QAItem {
  id: string;
  question: string;
  answer: string;
  source: 'collected' | 'suggested'; // 収集された情報 or 想定Q&A
  sourceType?: 'text' | 'image' | 'video' | 'pdf'; // 情報源のタイプ
  sourceUrl?: string; // 情報源のURL
  timestamp: number;
}

// ワークフロー設定
export interface WorkflowConfig {
  url: string;
  scope: 'single' | 'subdomain'; // 単一URL or サブドメイン全体
  sourceCode?: string; // ソースコード直接貼り付け用
  maxQA: number; // 生成するQ&Aの上限数
  includeTypes: {
    collected: boolean; // 収集情報ベースのQ&A
    suggested: boolean; // 想定Q&A
  };
  exportFormat: 'excel' | 'word' | 'pdf' | 'text';
}

// APIレスポンス型
export interface WorkflowResponse {
  success: boolean;
  data?: {
    url: string;
    qaItems: QAItem[];
    stats: {
      totalPages: number;
      imagesAnalyzed: number;
      videosAnalyzed: number;
      pdfsAnalyzed: number;
    };
    robotsAllowed: boolean;
  };
  error?: string;
}

// クローリング結果
export interface CrawlResult {
  url: string;
  content: string;
  images: string[];
  videos: string[];
  pdfs: string[];
  links: string[];
}
