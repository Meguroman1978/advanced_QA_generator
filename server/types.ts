export interface QAItem {
  id: string;
  question: string;
  answer: string;
  source: 'collected' | 'suggested';
  sourceType?: 'text' | 'image' | 'video' | 'pdf';
  sourceUrl?: string;
  timestamp: number;
  needsVideo?: boolean;  // 関連動画の素材準備を推奨
  videoReason?: string;  // 動画素材を用意した方が良い理由
  videoExamples?: string[];  // 推奨する作成動画例
}

export interface WorkflowConfig {
  urls?: string[];
  url?: string; // Backward compatibility
  scope: 'single' | 'subdomain';
  sourceCode?: string;
  maxQA: number;
  includeTypes: {
    collected: boolean;
    suggested: boolean;
  };
  exportFormat?: 'excel' | 'word' | 'pdf' | 'text';
}

export interface CrawlResult {
  url: string;
  content: string;
  images: string[];
  videos: string[];
  pdfs: string[];
  links: string[];
}

export interface WorkflowResponse {
  success: boolean;
  data?: {
    urls: string[];
    qaItems: QAItem[];
    stats: {
      totalPages: number;
      imagesAnalyzed: number;
      videosAnalyzed: number;
      pdfsAnalyzed: number;
      reviewsAnalyzed: number;
    };
    robotsAllowed: boolean;
    cost?: number;  // OpenAI API コスト（ドル）
  };
  error?: string;
}
