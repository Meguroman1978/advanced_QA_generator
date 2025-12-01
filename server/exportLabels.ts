// Export labels translation module
export type Language = 'ja' | 'en' | 'zh';

export const exportLabels = {
  ja: {
    worksheetName: 'Q&A集',
    numberLabel: 'No',
    question: '質問',
    answer: '回答',
    source: 'ソース',
    sourceType: '情報源タイプ',
    url: 'URL',
    needsVideo: '動画素材推奨',
    videoReason: '動画素材を用意した方が良い理由',
    videoExamples: '推奨する作成動画例',
    collectedInfo: 'Webサイト情報',
    suggestedQA: '想定Q&A',
    text: 'テキスト',
    image: '画像',
    video: '動画',
    pdf: 'PDF',
    yes: 'はい',
    noLabel: 'いいえ',
    qaCollectionTitle: 'Q&A集',
    videoRecommendTitle: '関連動画の素材準備を推奨',
    videoReasonTitle: '動画素材を用意した方が良い理由',
    videoExamplesTitle: '推奨する作成動画例',
    videoRecommendationNarrative: '※このQ&Aに対応する動画の作成をお勧めします※',
  },
  en: {
    worksheetName: 'Q&A Collection',
    numberLabel: 'No',
    question: 'Question',
    answer: 'Answer',
    source: 'Source',
    sourceType: 'Source Type',
    url: 'URL',
    needsVideo: 'Video Recommended',
    videoReason: 'Reason for Video Recommendation',
    videoExamples: 'Recommended Video Examples',
    collectedInfo: 'Website Info',
    suggestedQA: 'Suggested Q&A',
    text: 'Text',
    image: 'Image',
    video: 'Video',
    pdf: 'PDF',
    yes: 'Yes',
    noLabel: 'No',
    qaCollectionTitle: 'Q&A Collection',
    videoRecommendTitle: 'Video Material Preparation Recommended',
    videoReasonTitle: 'Reason for Video Recommendation',
    videoExamplesTitle: 'Recommended Video Examples',
    videoRecommendationNarrative: '※We recommend creating a video for this Q&A※',
  },
  zh: {
    worksheetName: '问答集',
    numberLabel: '编号',
    question: '问题',
    answer: '答案',
    source: '来源',
    sourceType: '来源类型',
    url: '网址',
    needsVideo: '推荐视频',
    videoReason: '推荐视频的原因',
    videoExamples: '推荐视频示例',
    collectedInfo: '网站信息',
    suggestedQA: '建议问答',
    text: '文本',
    image: '图片',
    video: '视频',
    pdf: 'PDF',
    yes: '是',
    noLabel: '否',
    qaCollectionTitle: '问答集',
    videoRecommendTitle: '建议准备相关视频素材',
    videoReasonTitle: '推荐视频的原因',
    videoExamplesTitle: '推荐视频示例',
    videoRecommendationNarrative: '※建议为此问答制作视频※',
  }
};

export function getLabel(lang: Language, key: keyof typeof exportLabels.ja): string {
  return exportLabels[lang][key] || exportLabels.ja[key];
}

export function translateSource(source: string, lang: Language): string {
  if (source === 'collected') return getLabel(lang, 'collectedInfo');
  if (source === 'suggested') return getLabel(lang, 'suggestedQA');
  return source;
}

export function translateSourceType(sourceType: string | undefined, lang: Language): string {
  if (!sourceType) return '';
  if (sourceType === 'text') return getLabel(lang, 'text');
  if (sourceType === 'image') return getLabel(lang, 'image');
  if (sourceType === 'video') return getLabel(lang, 'video');
  if (sourceType === 'pdf') return getLabel(lang, 'pdf');
  return sourceType;
}
