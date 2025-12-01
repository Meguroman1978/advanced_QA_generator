// Language type definition
export type Language = 'ja' | 'en' | 'zh';

export const translations = {
  ja: {
    // 言語選択
    languageLabel: '言語選択',
    japanese: '日本語',
    english: '英語',
    chinese: '中国語',
    
    // タイトル
    appTitle: '高度なQ&Aジェネレーター',
    
    // URL入力
    urlLabel: 'URL',
    urlPlaceholder: 'https://example.com',
    
    // スコープ選択
    scopeLabel: 'クロール範囲',
    scopeSingle: '単一ページのみ',
    scopeSubdomain: 'サブドメイン全体',
    
    // ソースコード
    sourceCodeLabel: 'ソースコード（オプション）',
    sourceCodePlaceholder: 'HTMLソースコードを直接貼り付け（robots.txtをバイパス）',
    sourceCodeNote: '※ソースコードを入力した場合、URL入力は無視されます',
    
    // 生成設定
    generationSettingsLabel: '生成設定',
    maxQALabel: '生成するQ&Aの上限数',
    qaTypesLabel: '出力するQ&Aの種類',
    collectedQALabel: '収集した情報ベースのQ&A',
    suggestedQALabel: '想定Q&A（ユーザー視点）',
    
    // エクスポート設定
    exportSettingsLabel: 'エクスポート設定',
    fileFormatLabel: 'ファイル形式（複数選択可）',
    includeLabelsText: '出力するPDF/Word/Textファイルにラベル（ソース、情報源タイプ、URL）を含める',
    includeVideoInfoText: '推奨作成動画例などの情報も含める',
    includeLabelsNote: '※Excelと画面表示は常にラベルを表示します',
    
    // ボタン
    startGenerationButton: 'Q&A生成を開始',
    processingLabel: '処理中...',
    
    // エラー
    errorLabel: 'エラー',
    
    // API Key
    apiKeyInputTitle: '利用可能なOpenAI API Keyを入力してください',
    apiKeyInputNote: '※このAPI Keyは保存されず、今回の処理にのみ使用されます',
    apiKeyInputRequired: 'API Keyを入力してください',
    retryWithApiKeyButton: 'このAPI Keyで再試行',
    
    // robots.txt警告
    robotsBlockedTitle: 'クローラーによるアクセスが禁止されています',
    robotsBlockedText1: 'このサイトのrobots.txtでクローラーアクセスが禁止されています。',
    robotsBlockedText2: 'ソースコードを直接貼り付けて解析することをお勧めします。',
    
    // 統計
    referenceStatsTitle: '参照リソース統計',
    totalPagesLabel: '調査対象ページ数',
    generatedQACountLabel: '生成Q&A数',
    textLabel: 'テキスト',
    imageVideoLabel: '画像・動画',
    otherPdfLabel: 'その他PDFなど',
    reviewsLabel: 'レビュー',
    apiCostLabel: 'API使用料金',
    
    // Q&Aリスト
    generatedQAListTitle: '生成されたQ&A集',
    questionPlaceholder: '質問',
    answerPlaceholder: '回答',
    
    // 動画推奨
    videoLabelClickHint: 'クリックして詳細を表示',
    videoRecommendationTitle: '関連動画の素材準備を推奨',
    videoReasonTitle: '動画素材を用意した方が良い理由',
    videoExamplesTitle: '推奨する作成動画例',
    videoRecommendedBadge: '動画推奨',
    videoRecommendationNarrative: '※このQ&Aに対応する動画の作成をお勧めします※',
    
    // Q&A数
    qaCountLabel: '生成するQ&A数',
    
    // Q&Aタイプ
    qaTypeLabel: 'Q&Aタイプ',
    qaTypeCollected: '収集した情報ベースのQ&A',
    qaTypeSuggested: '想定Q&A（カテゴリ別の一般的な質問）',
    
    // エクスポート形式
    exportFormatLabel: 'エクスポート形式',
    formatExcel: 'Excel',
    formatWord: 'Word',
    formatPdf: 'PDF',
    formatText: 'テキスト',
    
    // ラベル
    includeLabelLabel: 'ラベルを含める（Word/PDF/Text）',
    includeLabelNote: '※Excelは常に全情報を含みます',
    
    // ボタン
    startButton: '生成開始',
    downloadButton: 'ダウンロード',
    editButton: '編集',
    deleteButton: '削除',
    saveButton: '保存',
    cancelButton: 'キャンセル',
    
    // ステータス
    statusCollecting: '情報収集中...',
    statusOrganizing: '情報整理中...',
    statusGenerating: 'Q&A生成中...',
    statusCompleted: '完了',
    
    // 統計
    statsTitle: '参照リソース統計',
    statsTotalPages: '調査対象ページ数',
    statsQACount: '生成Q&A数',
    statsText: 'テキスト',
    statsMedia: '画像・動画',
    statsOther: 'その他PDFなど',
    statsReviews: 'レビュー',
    statsApiCost: 'API使用料金',
    
    // Q&Aリスト
    qaListTitle: '生成されたQ&A集',
    questionLabel: 'Q:',
    answerLabel: 'A:',
    
    // バッジ
    badgeCollected: 'Webサイト情報',
    badgeSuggested: '想定Q&A',
    badgeText: 'テキスト',
    badgeImage: '画像',
    badgeVideo: '動画',
    badgePdf: 'PDF',
    badgeVideoRecommend: '動画推奨',
    
    // ポップアップ
    videoRecommendTitle: '関連動画の素材準備を推奨',
    videoReasonLabel: '動画素材を用意した方が良い理由:',
    videoExamplesLabel: '推奨する作成動画例:',
    
    // エラーメッセージ
    errorNoUrl: 'URLを入力してください',
    errorInvalidUrl: '有効なURLを入力してください',
    errorNoQAType: '少なくとも1つのQ&Aタイプを選択してください',
    errorNoExportFormat: 'エクスポートする形式を少なくとも1つ選択してください',
    errorNoQA: 'エクスポートするQ&Aがありません',
    errorExportFailed: 'エクスポートに失敗しました',
    errorGenerationFailed: 'Q&A生成に失敗しました',
    
    // 成功メッセージ
    successGenerated: 'Q&Aが生成されました',
    successSaved: '保存完了しました',
    successDeleted: '削除完了しました',
    successExported: 'ダウンロード完了しました',
    successExportedZip: '個のファイルをZIPでダウンロードしました',
    
    // エラーメッセージ（追加）
    errorSaveFailed: '保存に失敗しました',
    errorDeleteFailed: '削除に失敗しました',
    errorInputRequired: 'URLまたはソースコードを入力してください',
  },
  
  en: {
    // Language Selection
    languageLabel: 'Language Setting',
    japanese: 'Japanese',
    english: 'English',
    chinese: 'Chinese',
    
    // Title
    appTitle: 'Advanced Q&A Generator',
    
    // URL Input
    urlLabel: 'URL',
    urlPlaceholder: 'https://example.com',
    
    // Scope Selection
    scopeLabel: 'Crawl Scope',
    scopeSingle: 'Single Page Only',
    scopeSubdomain: 'Entire Subdomain',
    
    // Source Code
    sourceCodeLabel: 'Source Code (Optional)',
    sourceCodePlaceholder: 'Paste HTML source code directly (bypass robots.txt)',
    sourceCodeNote: '※If source code is entered, URL input will be ignored',
    
    // Generation Settings
    generationSettingsLabel: 'Generation Settings',
    maxQALabel: 'Max Q&A Count',
    qaTypesLabel: 'Q&A Types',
    collectedQALabel: 'Collected Information-based Q&A',
    suggestedQALabel: 'Suggested Q&A (User Perspective)',
    
    // Export Settings
    exportSettingsLabel: 'Export Settings',
    fileFormatLabel: 'File Format (Multiple Selection Allowed)',
    includeLabelsText: 'Include labels (Source, Type, URL) in exported PDF/Word/Text files',
    includeVideoInfoText: 'Include video example info',
    includeLabelsNote: '※Excel and screen display always show labels',
    
    // Buttons
    startGenerationButton: 'Start Q&A Generation',
    processingLabel: 'Processing...',
    
    // Error
    errorLabel: 'Error',
    
    // API Key
    apiKeyInputTitle: 'Please enter a valid OpenAI API Key',
    apiKeyInputNote: '※This API Key will not be saved and will only be used for this process',
    apiKeyInputRequired: 'Please enter API Key',
    retryWithApiKeyButton: 'Retry with this API Key',
    
    // robots.txt warning
    robotsBlockedTitle: 'Crawler Access Prohibited',
    robotsBlockedText1: 'Crawler access is prohibited by this site\'s robots.txt.',
    robotsBlockedText2: 'We recommend pasting the source code directly for analysis.',
    
    // Statistics
    referenceStatsTitle: 'Reference Resource Statistics',
    totalPagesLabel: 'Total Pages Surveyed',
    generatedQACountLabel: 'Generated Q&A Count',
    textLabel: 'Text',
    imageVideoLabel: 'Image/Video',
    otherPdfLabel: 'Other PDF etc.',
    reviewsLabel: 'Reviews',
    apiCostLabel: 'API Usage Cost',
    
    // Q&A List
    generatedQAListTitle: 'Generated Q&A Collection',
    questionPlaceholder: 'Question',
    answerPlaceholder: 'Answer',
    
    // Video Recommendation
    videoLabelClickHint: 'Click to show details',
    videoRecommendationTitle: 'Video Material Preparation Recommended',
    videoReasonTitle: 'Reason why video is recommended',
    videoExamplesTitle: 'Recommended video examples',
    videoRecommendedBadge: 'Video Recommended',
    videoRecommendationNarrative: '※We recommend creating a video for this Q&A※',
    
    // Q&A Count
    qaCountLabel: 'Number of Q&As to Generate',
    
    // Q&A Type
    qaTypeLabel: 'Q&A Type',
    qaTypeCollected: 'Q&As Based on Collected Information',
    qaTypeSuggested: 'Suggested Q&As (Category-based common questions)',
    
    // Export Format
    exportFormatLabel: 'Export Format',
    formatExcel: 'Excel',
    formatWord: 'Word',
    formatPdf: 'PDF',
    formatText: 'Text',
    
    // Labels
    includeLabelLabel: 'Include Labels (Word/PDF/Text)',
    includeLabelNote: '※Excel always includes all information',
    
    // Buttons
    startButton: 'Start Generation',
    downloadButton: 'Download',
    editButton: 'Edit',
    deleteButton: 'Delete',
    saveButton: 'Save',
    cancelButton: 'Cancel',
    
    // Status
    statusCollecting: 'Collecting information...',
    statusOrganizing: 'Organizing information...',
    statusGenerating: 'Generating Q&As...',
    statusCompleted: 'Completed',
    
    // Statistics
    statsTitle: 'Resource Statistics',
    statsTotalPages: 'Pages Surveyed',
    statsQACount: 'Q&As Generated',
    statsText: 'Text',
    statsMedia: 'Images & Videos',
    statsOther: 'PDFs & Others',
    statsReviews: 'Reviews',
    statsApiCost: 'API Usage Cost',
    
    // Q&A List
    qaListTitle: 'Generated Q&A Collection',
    questionLabel: 'Q:',
    answerLabel: 'A:',
    
    // Badges
    badgeCollected: 'Website Info',
    badgeSuggested: 'Suggested Q&A',
    badgeText: 'Text',
    badgeImage: 'Image',
    badgeVideo: 'Video',
    badgePdf: 'PDF',
    badgeVideoRecommend: 'Video Recommended',
    
    // Popup
    videoRecommendTitle: 'Video Content Preparation Recommended',
    videoReasonLabel: 'Why video content is recommended:',
    videoExamplesLabel: 'Recommended video examples:',
    
    // Error Messages
    errorNoUrl: 'Please enter a URL',
    errorInvalidUrl: 'Please enter a valid URL',
    errorNoQAType: 'Please select at least one Q&A type',
    errorNoExportFormat: 'Please select at least one export format',
    errorNoQA: 'No Q&As available for export',
    errorExportFailed: 'Export failed',
    errorGenerationFailed: 'Q&A generation failed',
    
    // Success Messages
    successGenerated: 'Q&As generated successfully',
    successSaved: 'Saved successfully',
    successDeleted: 'Deleted successfully',
    successExported: 'Downloaded successfully',
    successExportedZip: 'files downloaded as ZIP',
    
    // Error Messages (Additional)
    errorSaveFailed: 'Save failed',
    errorDeleteFailed: 'Delete failed',
    errorInputRequired: 'Please enter URL or source code',
  },
  
  zh: {
    // 语言选择
    languageLabel: '语言设置',
    japanese: '日语',
    english: '英语',
    chinese: '中文',
    
    // 标题
    appTitle: '高级问答生成器',
    
    // URL输入
    urlLabel: '网址',
    urlPlaceholder: 'https://example.com',
    
    // 范围选择
    scopeLabel: '爬取范围',
    scopeSingle: '仅单个页面',
    scopeSubdomain: '整个子域名',
    
    // 源代码
    sourceCodeLabel: '源代码（可选）',
    sourceCodePlaceholder: '直接粘贴HTML源代码（绕过robots.txt）',
    sourceCodeNote: '※如果输入源代码，将忽略URL输入',
    
    // 生成设置
    generationSettingsLabel: '生成设置',
    maxQALabel: '生成问答上限数',
    qaTypesLabel: '输出问答类型',
    collectedQALabel: '基于收集信息的问答',
    suggestedQALabel: '建议问答（用户视角）',
    
    // 导出设置
    exportSettingsLabel: '导出设置',
    fileFormatLabel: '文件格式（可多选）',
    includeLabelsText: '在导出的PDF/Word/文本文件中包含标签（来源、类型、URL）',
    includeVideoInfoText: '包含推荐视频示例等信息',
    includeLabelsNote: '※Excel和屏幕显示始终显示标签',
    
    // 按钮
    startGenerationButton: '开始问答生成',
    processingLabel: '处理中...',
    
    // 错误
    errorLabel: '错误',
    
    // API Key
    apiKeyInputTitle: '请输入有效的OpenAI API Key',
    apiKeyInputNote: '※此API Key不会被保存，仅用于本次处理',
    apiKeyInputRequired: '请输入API Key',
    retryWithApiKeyButton: '使用此API Key重试',
    
    // robots.txt警告
    robotsBlockedTitle: '禁止爬虫访问',
    robotsBlockedText1: '该网站的robots.txt禁止爬虫访问。',
    robotsBlockedText2: '我们建议直接粘贴源代码进行分析。',
    
    // 统计
    referenceStatsTitle: '参考资源统计',
    totalPagesLabel: '调查页面数',
    generatedQACountLabel: '生成问答数',
    textLabel: '文本',
    imageVideoLabel: '图片/视频',
    otherPdfLabel: '其他PDF等',
    reviewsLabel: '评论',
    apiCostLabel: 'API使用费用',
    
    // 问答列表
    generatedQAListTitle: '生成的问答集',
    questionPlaceholder: '问题',
    answerPlaceholder: '答案',
    
    // 视频推荐
    videoLabelClickHint: '点击查看详情',
    videoRecommendationTitle: '建议准备相关视频素材',
    videoReasonTitle: '建议准备视频素材的原因',
    videoExamplesTitle: '推荐视频示例',
    videoRecommendedBadge: '推荐视频',
    videoRecommendationNarrative: '※建议为此问答制作视频※',
    
    // 问答数量
    qaCountLabel: '生成问答数量',
    
    // 问答类型
    qaTypeLabel: '问答类型',
    qaTypeCollected: '基于收集信息的问答',
    qaTypeSuggested: '建议问答（基于类别的常见问题）',
    
    // 导出格式
    exportFormatLabel: '导出格式',
    formatExcel: 'Excel',
    formatWord: 'Word',
    formatPdf: 'PDF',
    formatText: '文本',
    
    // 标签
    includeLabelLabel: '包含标签（Word/PDF/文本）',
    includeLabelNote: '※Excel始终包含所有信息',
    
    // 按钮
    startButton: '开始生成',
    downloadButton: '下载',
    editButton: '编辑',
    deleteButton: '删除',
    saveButton: '保存',
    cancelButton: '取消',
    
    // 状态
    statusCollecting: '正在收集信息...',
    statusOrganizing: '正在整理信息...',
    statusGenerating: '正在生成问答...',
    statusCompleted: '已完成',
    
    // 统计
    statsTitle: '资源统计',
    statsTotalPages: '调查页面数',
    statsQACount: '生成问答数',
    statsText: '文本',
    statsMedia: '图片和视频',
    statsOther: 'PDF等其他',
    statsReviews: '评论',
    statsApiCost: 'API使用费用',
    
    // 问答列表
    qaListTitle: '生成的问答集',
    questionLabel: '问：',
    answerLabel: '答：',
    
    // 徽章
    badgeCollected: '网站信息',
    badgeSuggested: '建议问答',
    badgeText: '文本',
    badgeImage: '图片',
    badgeVideo: '视频',
    badgePdf: 'PDF',
    badgeVideoRecommend: '推荐视频',
    
    // 弹出窗口
    videoRecommendTitle: '建议准备相关视频素材',
    videoReasonLabel: '建议准备视频素材的原因：',
    videoExamplesLabel: '推荐制作视频示例：',
    
    // 错误消息
    errorNoUrl: '请输入网址',
    errorInvalidUrl: '请输入有效的网址',
    errorNoQAType: '请至少选择一种问答类型',
    errorNoExportFormat: '请至少选择一种导出格式',
    errorNoQA: '没有可导出的问答',
    errorExportFailed: '导出失败',
    errorGenerationFailed: '问答生成失败',
    
    // 成功消息
    successGenerated: '问答生成成功',
    successSaved: '保存成功',
    successDeleted: '删除成功',
    successExported: '下载成功',
    successExportedZip: '个文件已打包为ZIP下载',
    
    // 错误消息（附加）
    errorSaveFailed: '保存失败',
    errorDeleteFailed: '删除失败',
    errorInputRequired: '请输入网址或源代码',
  }
};

export function getTranslation(lang: Language, key: keyof typeof translations.ja): string {
  return translations[lang][key] || translations.ja[key];
}
