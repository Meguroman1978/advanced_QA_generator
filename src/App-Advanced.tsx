import { useState } from 'react';
import './App.css';
import './App-Apple.css';
import { getTranslation } from './i18n';
import type { Language } from './i18n';

interface QAItem {
  id: string;
  question: string;
  answer: string;
  source: 'collected' | 'suggested';
  sourceType?: 'text' | 'image' | 'video' | 'pdf';
  sourceUrl?: string;
  timestamp: number;
  needsVideo?: boolean;
  videoReason?: string;
  videoExamples?: string[];
}

interface WorkflowConfig {
  urls: string[];
  scope: 'single' | 'subdomain';
  sourceCode?: string;
  maxQA: number;
  includeTypes: {
    collected: boolean;
    suggested: boolean;
  };
}

interface WorkflowResult {
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
  cost?: number;
}

type ProcessStage = 'collecting' | 'organizing' | 'generating' | 'completed';

function AppAdvanced() {
  const [config, setConfig] = useState<WorkflowConfig>({
    urls: [''],
    scope: 'single',
    sourceCode: '',
    maxQA: 40,
    includeTypes: {
      collected: true,
      suggested: true
    }
  });

  const [exportFormats, setExportFormats] = useState<Set<'pdf' | 'text'>>(new Set(['pdf']));
  const [includeLabels, setIncludeLabels] = useState(false);
  const [includeVideoInfo, setIncludeVideoInfo] = useState(true); // 動画推奨情報を含めるかどうか
  const [loading, setLoading] = useState(false);
  const [processStage, setProcessStage] = useState<ProcessStage>('collecting');
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [_sessionId, setSessionId] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ question: '', answer: '' });
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const [language, setLanguage] = useState<Language>('ja');
  const [originalLanguage, setOriginalLanguage] = useState<Language>('ja');
  const [translatedVideoInfo, setTranslatedVideoInfo] = useState<Map<string, { videoReason?: string; videoExamples?: string[] }>>(new Map());
  const [useSourceCode, setUseSourceCode] = useState(false);
  const [sourceCodeInput, setSourceCodeInput] = useState('');
  const [useImageOCR, setUseImageOCR] = useState(false);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [botBypassOpen, setBotBypassOpen] = useState(false);

  // API URLを環境に応じて設定
  // VITE_API_URLが設定されている場合はそれを使用
  // 設定されていない場合は、hostnameで判定
  const getApiUrl = () => {
    if (import.meta.env.VITE_API_URL) {
      console.log('[API_URL] Using VITE_API_URL:', import.meta.env.VITE_API_URL);
      return import.meta.env.VITE_API_URL;
    }
    // runtime判定: localhostの場合のみ別ポートを使用
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      console.log('[API_URL] Detected localhost, using:', 'http://localhost:3001');
      return 'http://localhost:3001';
    }
    // 本番環境では空文字（相対パス）
    console.log('[API_URL] Using relative path (empty string) for hostname:', typeof window !== 'undefined' ? window.location.hostname : 'SSR');
    return '';
  };
  const API_URL = getApiUrl();
  console.log('[API_URL] Final API_URL:', API_URL);
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(language, key);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setImageFiles(files);
    }
  };

  // 動画推奨情報を翻訳する関数
  const translateVideoInfo = async (text: string, fromLang: Language, toLang: Language): Promise<string> => {
    if (fromLang === toLang || !text) return text;
    
    console.log(`[Translation] From ${fromLang} to ${toLang}: "${text.substring(0, 50)}..."`);
    
    try {
      const response = await fetch(`${API_URL}/api/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, fromLang, toLang })
      });
      
      if (!response.ok) {
        console.error('[Translation] API request failed:', response.status);
        return text; // 翻訳失敗時は元のテキストを返す
      }
      
      const data = await response.json();
      const translatedText = data.translatedText || text;
      console.log(`[Translation] Result: "${translatedText.substring(0, 50)}..."`);
      return translatedText;
    } catch (error) {
      console.error('[Translation] Error:', error);
      return text; // エラー時は元のテキストを返す
    }
  };

  // 言語変更時に動画推奨情報を翻訳
  const handleLanguageChange = async (newLanguage: Language) => {
    const oldLanguage = language;
    setLanguage(newLanguage);
    
    // Q&Aが存在し、言語が変わった場合のみ翻訳を実行
    if (result && oldLanguage !== newLanguage) {
      const newTranslations = new Map(translatedVideoInfo);
      
      // すべてのアイテムの翻訳を並列実行
      const translationPromises = result.qaItems
        .filter(item => item.videoReason || item.videoExamples)
        .map(async (item) => {
          const key = item.id;
          
          // videoReasonとvideoExamplesを並列翻訳
          const [translatedReason, translatedExamples] = await Promise.all([
            item.videoReason 
              ? translateVideoInfo(item.videoReason, originalLanguage, newLanguage)
              : Promise.resolve(undefined),
            item.videoExamples && item.videoExamples.length > 0
              ? Promise.all(item.videoExamples.map(ex => translateVideoInfo(ex, originalLanguage, newLanguage)))
              : Promise.resolve(undefined)
          ]);
          
          return {
            key,
            translation: {
              videoReason: translatedReason,
              videoExamples: translatedExamples
            }
          };
        });
      
      // すべての翻訳が完了するまで待つ
      const translations = await Promise.all(translationPromises);
      
      // 翻訳結果をMapに格納
      translations.forEach(({ key, translation }) => {
        newTranslations.set(key, translation);
      });
      
      console.log(`[handleLanguageChange] Translation completed. ${translations.length} items translated from ${originalLanguage} to ${newLanguage}`);
      console.log('[handleLanguageChange] Translation map:', newTranslations);
      
      setTranslatedVideoInfo(newTranslations);
    }
  };

  // 翻訳された動画情報を取得する関数
  const getVideoInfo = (item: QAItem) => {
    // 元の言語と同じ場合は翻訳不要
    if (language === originalLanguage) {
      console.log(`[getVideoInfo] Using original language (${language})`);
      return { videoReason: item.videoReason, videoExamples: item.videoExamples };
    }
    
    // 翻訳キャッシュを確認
    const translated = translatedVideoInfo.get(item.id);
    if (translated && (translated.videoReason || translated.videoExamples)) {
      console.log(`[getVideoInfo] Using translated version (${language})`, translated);
      return translated;
    }
    
    // 翻訳がない場合は元のテキストを返す（翻訳中の可能性）
    console.log(`[getVideoInfo] No translation found, using original`);
    return { videoReason: item.videoReason, videoExamples: item.videoExamples };
  };

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate: At least one URL, source code, or images is required
    const hasValidUrl = config.urls.some(url => url && url.trim().length > 0);
    const hasSourceCode = (config.sourceCode && config.sourceCode.trim().length > 0) || (sourceCodeInput && sourceCodeInput.trim().length > 0);
    const hasImages = useImageOCR && imageFiles.length > 0;
    
    if (!hasValidUrl && !hasSourceCode && !hasImages) {
      setError(t('errorInputRequired'));
      return;
    }
    
    // キャッシュクリア：前回の結果を完全にクリア
    setLoading(true);
    setError(null);
    setResult(null);
    setSessionId('');  // セッションIDもクリア
    setProcessStage('collecting');

    try {
      // Stage 1: 情報収集中
      setProcessStage('collecting');
      await new Promise(resolve => setTimeout(resolve, 500));

      // 画像OCRモードの場合
      if (useImageOCR && imageFiles.length > 0) {
        const formData = new FormData();
        formData.append('url', config.urls[0] || '');
        formData.append('maxQA', config.maxQA.toString());
        formData.append('language', language);
        imageFiles.forEach((file, index) => {
          formData.append(`image${index}`, file);
        });
        
        const response = await fetch(`${API_URL}/api/workflow-ocr`, {
          method: 'POST',
          headers: {
            ...(tempApiKey && { 'X-Temp-API-Key': tempApiKey })
          },
          body: formData,
        });

        console.log('[OCR] Response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[OCR] Error response:', errorText);
          throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        // Stage 2: 情報整理中
        setProcessStage('organizing');
        await new Promise(resolve => setTimeout(resolve, 500));

        const data = await response.json();
        console.log('[OCR] Response data:', data);
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to process OCR workflow');
        }

        // Stage 3: Q&A生成中
        setProcessStage('generating');
        await new Promise(resolve => setTimeout(resolve, 500));

        setResult(data.data);
        setSessionId(Date.now().toString());
        setOriginalLanguage(language);
        setTranslatedVideoInfo(new Map());

        // Stage 4: 完了
        setProcessStage('completed');
        setLoading(false);
        return;
      }

      // 通常のモードまたはソースコード挿入モード
      const requestUrl = `${API_URL}/api/workflow`;
      const requestBody: any = { 
        url: config.urls[0] || '',
        maxQA: config.maxQA,
        language: language,
        includeTypes: config.includeTypes // Q&A types configuration
      };
      
      // ソースコード挿入モードの場合
      if (useSourceCode && sourceCodeInput) {
        requestBody.sourceCode = sourceCodeInput;
        console.log('[FETCH] Source code mode active, code length:', sourceCodeInput.length);
      } else if (config.sourceCode) {
        requestBody.sourceCode = config.sourceCode;
        console.log('[FETCH] Legacy source code mode, code length:', config.sourceCode.length);
      }
      
      console.log('[FETCH] Has valid URL:', hasValidUrl, 'URL:', requestBody.url);
      console.log('[FETCH] Has source code:', hasSourceCode);
      console.log('[FETCH] Include Types:', requestBody.includeTypes);
      
      console.log('[FETCH] Request URL:', requestUrl);
      console.log('[FETCH] Request body:', requestBody);
      console.log('[FETCH] Full URL:', API_URL ? requestUrl : window.location.origin + requestUrl);
      
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tempApiKey && { 'X-Temp-API-Key': tempApiKey })
        },
        body: JSON.stringify(requestBody),
      });
      
      console.log('[FETCH] Response status:', response.status);
      console.log('[FETCH] Response ok:', response.ok);

      // Stage 2: 情報整理中
      setProcessStage('organizing');
      await new Promise(resolve => setTimeout(resolve, 500));

      // レスポンスの詳細ログ
      const contentType = response.headers.get('content-type');
      console.log('[FETCH] Response Content-Type:', contentType);
      console.log('[FETCH] Response status:', response.status);
      console.log('[FETCH] Response ok:', response.ok);
      console.log('[FETCH] Response headers:', {
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length'),
        server: response.headers.get('server')
      });
      
      // まずレスポンステキストを取得
      let responseText = '';
      try {
        responseText = await response.text();
        console.log('[FETCH] Response text length:', responseText.length);
        console.log('[FETCH] Response text preview:', responseText.substring(0, 500));
      } catch (textError) {
        console.error('[FETCH] Failed to read response text:', textError);
        throw new Error('サーバーからのレスポンスを読み取れませんでした。ネットワーク接続を確認してください。');
      }
      
      // レスポンステキストをJSONとしてパース
      let data;
      try {
        data = JSON.parse(responseText);
        console.log('[FETCH] Successfully parsed JSON:', data);
      } catch (jsonError) {
        console.error('[FETCH] JSON parse error:', jsonError);
        console.error('[FETCH] Full response text:', responseText);
        
        // Content-Typeをチェック
        if (!contentType || !contentType.includes('application/json')) {
          console.error('[FETCH] Response Content-Type is not JSON:', contentType);
          
          // HTMLエラーページの可能性
          if (contentType && contentType.includes('text/html')) {
            console.error('[FETCH] Server returned HTML error page');
            // HTMLから<title>タグを抽出して表示
            const titleMatch = responseText.match(/<title[^>]*>([^<]+)<\/title>/i);
            const title = titleMatch ? titleMatch[1] : 'Unknown Error';
            throw new Error(`サーバーエラー: ${title}\n\nソースコードの内容が正しいか確認してください。\n\nエラー詳細:\n- Content-Type: ${contentType}\n- Status: ${response.status}\n\nブラウザコンソール（F12）で完全なエラー内容を確認してください。`);
          }
          
          throw new Error(`サーバーから無効なレスポンスが返されました。\n\nContent-Type: ${contentType}\nStatus: ${response.status}\n\nレスポンス内容: ${responseText.substring(0, 200)}...\n\nブラウザコンソール（F12）で詳細を確認してください。`);
        }
        
        throw new Error(`JSONパースエラー: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}\n\nレスポンス内容: ${responseText.substring(0, 200)}...`);
      }

      if (!response.ok || !data.success) {
        // OpenAI API残高不足エラーの検出
        if (data.error && (
          data.error.includes('insufficient_quota') || 
          data.error.includes('quota') ||
          data.error.includes('billing') ||
          data.error.includes('残高不足')
        )) {
          setError('OpenAI APIの残高が不足しています。別のAPI Keyを使用してください。');
          setShowApiKeyInput(true);
          throw new Error(data.error);
        }
        throw new Error(data.error || 'Failed to process workflow');
      }

      // Stage 3: Q&A生成中
      setProcessStage('generating');
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('[RESPONSE] Full data:', data);
      console.log('[RESPONSE] data.data:', data.data);
      console.log('[RESPONSE] qaItems count:', data.data?.qaItems?.length || 0);
      console.log('[RESPONSE] First 3 questions:', 
        data.data?.qaItems?.slice(0, 3).map((q: any) => q.question) || []
      );

      setResult(data.data);
      setSessionId(Date.now().toString());
      setOriginalLanguage(language); // Q&A生成時の言語を記録
      setTranslatedVideoInfo(new Map()); // 翻訳情報をクリア
      
      // Check if no Q&A were generated and show helpful message
      if (!data.data?.qaItems || data.data.qaItems.length === 0) {
        console.warn('[WARNING] No Q&A items generated');
        console.warn('[WARNING] Response data:', JSON.stringify(data.data, null, 2));
        if (useImageOCR) {
          setError('画像からQ&Aを生成できませんでした。\n\n考えられる原因:\n1. 画像のテキストが不鮮明\n2. OpenAI APIエラー\n3. API残高不足\n\nブラウザコンソール（F12）で詳細を確認してください。');
        } else if (hasValidUrl) {
          setError('URLからQ&Aを生成できませんでした。サイトがアクセス制限されている可能性があります。「クローラーアクセス禁止サイトを対象にする際の作業方法」をお試しください。');
        } else {
          setError('Q&Aを生成できませんでした。入力内容を確認してください。');
        }
      }

      // Stage 4: 完了
      setProcessStage('completed');
    } catch (err) {
      console.error('[FETCH] Error occurred:', err);
      console.error('[FETCH] Error type:', err instanceof Error ? 'Error' : typeof err);
      console.error('[FETCH] Error details:', err instanceof Error ? {
        message: err.message,
        stack: err.stack,
        name: err.name
      } : err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item: QAItem) => {
    setEditingId(item.id);
    setEditForm({ question: item.question, answer: item.answer });
  };

  const handleSaveEdit = async (id: string) => {
    try {
      // フロントエンド側で直接状態を更新
      setResult(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          qaItems: prev.qaItems.map(item =>
            item.id === id ? { ...item, ...editForm } : item
          )
        };
      });
      setEditingId(null);
      showSuccess(`✅ ${t('successSaved')}`);
    } catch (err) {
      console.error('Failed to save edit:', err);
      alert(t('errorSaveFailed'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このQ&Aを削除しますか？')) return;

    try {
      // フロントエンド側で直接状態を更新
      setResult(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          qaItems: prev.qaItems.filter(item => item.id !== id)
        };
      });
      showSuccess(`🗑️ ${t('successDeleted')}`);
    } catch (err) {
      console.error('Failed to delete:', err);
      alert(t('errorDeleteFailed'));
    }
  };

  const handleExport = async () => {
    if (!result || !result.qaItems || result.qaItems.length === 0) {
      alert(t('errorNoQA'));
      return;
    }

    if (exportFormats.size === 0) {
      alert(t('errorNoExportFormat'));
      return;
    }

    try {
      console.log('Starting individual file exports with API_URL:', API_URL);
      const formats = Array.from(exportFormats);
      console.log('Export formats:', formats);
      
      // 各形式を個別にダウンロード
      for (const format of formats) {
        try {
          const response = await fetch(`${API_URL}/api/export/single`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(tempApiKey && { 'X-Temp-API-Key': tempApiKey })
            },
            body: JSON.stringify({ 
              qaItems: result.qaItems,
              format: format,
              includeLabels,
              includeVideoInfo,
              language
            }),
          });

          console.log(`✅ Export response for ${format}:`, response.status, response.statusText);
          
          if (response.ok) {
            const contentType = response.headers.get('Content-Type');
            console.log(`📄 Content-Type for ${format}:`, contentType);
            
            const blob = await response.blob();
            console.log(`📦 Blob size for ${format}:`, blob.size, 'bytes');
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            const extension = format === 'pdf' ? 'pdf' : 'txt';
            a.download = `qa-collection.${extension}`;
            
            document.body.appendChild(a);
            a.click();
            console.log(`✅ Download triggered for ${format}`);
            
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            // 少し待機して次のダウンロードへ
            await new Promise(resolve => setTimeout(resolve, 500));
          } else {
            const errorText = await response.text();
            console.error(`❌ Export failed for ${format}:`, response.status, errorText);
            throw new Error(`${format} export failed: ${response.status} - ${errorText}`);
          }
        } catch (formatErr) {
          console.error(`Failed to export ${format}:`, formatErr);
          alert(`${format.toUpperCase()} ${t('errorExportFailed')}`);
        }
      }
      
      showSuccess(`💾 ${formats.length} file(s) downloaded successfully`);
    } catch (err) {
      console.error('Failed to export:', err);
      if (err instanceof Error) {
        alert(`${t('errorExportFailed')}: ${err.message}`);
      } else {
        alert(t('errorExportFailed'));
      }
    }
  };

  const toggleExportFormat = (format: 'pdf' | 'text') => {
    setExportFormats(prev => {
      const newSet = new Set(prev);
      if (newSet.has(format)) {
        newSet.delete(format);
      } else {
        newSet.add(format);
      }
      return newSet;
    });
  };

  const getSourceTypeLabel = (type?: string) => {
    const labels: Record<string, string> = {
      text: t('badgeText'),
      image: t('badgeImage'),
      video: t('badgeVideo'),
      pdf: t('badgePdf')
    };
    return type ? labels[type] : t('badgeText');
  };

  const getSourceLabel = (source: string) => {
    return source === 'collected' ? t('badgeCollected') : t('badgeSuggested');
  };

  const getQACountByType = (type: 'text' | 'image' | 'video' | 'pdf') => {
    if (!result) return 0;
    return result.qaItems.filter(item => (item.sourceType || 'text') === type).length;
  };

  const getMediaQACount = () => {
    // 画像と動画を合算
    if (!result) return 0;
    const imageCount = result.qaItems.filter(item => item.sourceType === 'image').length;
    const videoCount = result.qaItems.filter(item => item.sourceType === 'video').length;
    return imageCount + videoCount;
  };

  const stages = [
    { id: 'collecting', label: t('statusCollecting'), icon: '🔍' },
    { id: 'organizing', label: t('statusOrganizing'), icon: '📊' },
    { id: 'generating', label: t('statusGenerating'), icon: '🤖' },
    { id: 'completed', label: t('statusCompleted'), icon: '✅' }
  ];

  const getStageIndex = (stage: ProcessStage) => {
    return stages.findIndex(s => s.id === stage);
  };

  return (
    <div className="app">
      <div className="container-apple">
        <header className="header-apple">
          <h1>Advanced Q&A Generator</h1>
          <p className="subtitle-apple">AI-Powered Question & Answer Generation from Web Content</p>
        </header>

        {loading && (
          <div className="progress-flow-apple">
            {stages.map((stage, index) => (
              <div key={stage.id} className="progress-stage-container-apple">
                <div 
                  className={`progress-stage-apple ${
                    index <= getStageIndex(processStage) ? 'active' : ''
                  } ${index < getStageIndex(processStage) ? 'completed' : ''}`}
                >
                  <div className="stage-icon-apple">{stage.icon}</div>
                  <div className="stage-label-apple">{stage.label}</div>
                </div>
                {index < stages.length - 1 && (
                  <div className={`progress-arrow-apple ${
                    index < getStageIndex(processStage) ? 'active' : ''
                  }`}>→</div>
                )}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="form-apple">
          {/* 言語選択 */}
          <div className="form-section-apple language-selection-apple">
            <h3 className="section-title-apple">🌐 Language Settings</h3>
            <div className="input-group-apple">
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value as Language)}
                className="language-select-apple"
                disabled={loading}
              >
                <option value="ja">Japanese</option>
                <option value="en">English</option>
                <option value="zh">Chinese</option>
              </select>
            </div>
          </div>

          <div className="form-section-apple">
            <h3 className="section-title-apple">🔗 {t('urlLabel')}</h3>
            
            <div className="input-group-apple">
              <label htmlFor="url1">{t('urlLabel')} 1:</label>
              <input
                type="url"
                id="url1"
                value={config.urls[0] || ''}
                onChange={(e) => {
                  const newUrls = [...config.urls];
                  newUrls[0] = e.target.value;
                  setConfig({ ...config, urls: newUrls });
                }}
                placeholder={t('urlPlaceholder')}
                disabled={loading}
              />
            </div>

            <div className="input-group-apple">
              <label htmlFor="url2">{t('urlLabel')} 2 (Optional):</label>
              <input
                type="url"
                id="url2"
                value={config.urls[1] || ''}
                onChange={(e) => {
                  const newUrls = [...config.urls];
                  newUrls[1] = e.target.value;
                  setConfig({ ...config, urls: newUrls });
                }}
                placeholder={t('urlPlaceholder')}
                disabled={loading}
              />
            </div>

            <div className="input-group-apple">
              <label htmlFor="url3">{t('urlLabel')} 3 (Optional):</label>
              <input
                type="url"
                id="url3"
                value={config.urls[2] || ''}
                onChange={(e) => {
                  const newUrls = [...config.urls];
                  newUrls[2] = e.target.value;
                  setConfig({ ...config, urls: newUrls });
                }}
                placeholder={t('urlPlaceholder')}
                disabled={loading}
              />
            </div>

            <div className="input-group-apple">
              <label htmlFor="scope">{t('scopeLabel')}:</label>
              <select
                id="scope"
                value={config.scope}
                onChange={(e) => setConfig({ ...config, scope: e.target.value as 'single' | 'subdomain' })}
                disabled={loading || useSourceCode || useImageOCR}
              >
                <option value="single">{t('scopeSingle')}</option>
                <option value="subdomain">{t('scopeSubdomain')}</option>
              </select>
            </div>
          </div>

          {/* クローラーアクセス禁止サイト対応セクション - 生成設定の直前に配置 */}
          <div className="form-section-apple bot-bypass-section-apple">
            <div 
              onClick={() => setBotBypassOpen(!botBypassOpen)}
              style={{ 
                cursor: 'pointer', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                userSelect: 'none'
              }}
            >
              <h3 className="section-title-apple" style={{ margin: 0 }}>
                🔓 {t('botBypassTitle')}
              </h3>
              <span style={{ fontSize: '20px', color: 'var(--apple-gray)', transition: 'transform 0.3s', transform: botBypassOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                ▼
              </span>
            </div>
            
            {botBypassOpen && (
              <div style={{ marginTop: '20px', animation: 'fadeIn 0.3s ease-out' }}>
                <p style={{ fontSize: '15px', marginBottom: '16px', color: 'var(--apple-gray)' }}>
                  <strong>{t('botBypassInstructions')}</strong>
                </p>
                <ol style={{ fontSize: '14px', marginBottom: '20px', paddingLeft: '24px', lineHeight: '1.8', color: 'var(--apple-gray)' }}>
                  <li>{t('botBypassStep1')}</li>
                  <li>{t('botBypassStep2')}</li>
                  <li><strong>{t('botBypassStep3')}</strong></li>
                  <li>{t('botBypassStep4')}</li>
                  <li>{t('botBypassStep5')}</li>
                  <li><strong>{t('botBypassStep6')}</strong></li>
                  <li>{t('botBypassStep7')}</li>
                </ol>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setUseSourceCode(!useSourceCode);
                      setUseImageOCR(false);
                    }}
                    className="button-apple"
                    style={{
                      width: 'auto',
                      padding: '12px 24px',
                      backgroundColor: useSourceCode ? 'var(--apple-blue)' : '#34c759',
                    }}
                  >
                    {useSourceCode ? t('botBypassButtonSourceCodeActive') : `📝 ${t('botBypassButtonSourceCode')}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUseImageOCR(!useImageOCR);
                      setUseSourceCode(false);
                    }}
                    className="button-apple"
                    style={{
                      width: 'auto',
                      padding: '12px 24px',
                      backgroundColor: useImageOCR ? 'var(--apple-blue)' : 'var(--apple-gray)',
                    }}
                  >
                    {useImageOCR ? t('botBypassButtonOCRActive') : `📷 ${t('botBypassButtonOCR')}`}
                  </button>
                </div>
                <details style={{ fontSize: '14px', cursor: 'pointer', color: 'var(--apple-gray)' }}>
                  <summary style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--apple-black)' }}>
                    {t('botBypassExtensionInstall')}
                  </summary>
                  <div style={{ marginTop: '16px', marginBottom: '12px' }}>
                    <a 
                      href="/BROWSER_EXTENSION.zip" 
                      download="BROWSER_EXTENSION.zip"
                      className="button-apple button-primary-apple"
                      style={{
                        display: 'inline-block',
                        width: 'auto',
                        padding: '12px 24px',
                        textDecoration: 'none',
                        backgroundColor: '#34c759',
                        marginBottom: '16px'
                      }}
                    >
                      📥 {t('botBypassDownloadExtension')}
                    </a>
                  </div>
                  <ol style={{ paddingLeft: '24px', lineHeight: '1.6', marginTop: '12px' }}>
                    <li>{t('botBypassExtensionStep1')}</li>
                    <li>{t('botBypassExtensionStep2').replace('chrome://extensions/', '')}<code style={{ background: 'var(--apple-bg)', padding: '2px 6px', borderRadius: '4px' }}>chrome://extensions/</code></li>
                    <li>{t('botBypassExtensionStep3')}</li>
                    <li>{t('botBypassExtensionStep4')}</li>
                    <li>{t('botBypassExtensionStep5')}</li>
                  </ol>
                </details>
                
                {/* 画像OCRモード - セクション内に表示 */}
                {useImageOCR && (
                  <div className="image-ocr-section-apple" style={{
                    marginTop: '20px',
                    background: 'linear-gradient(135deg, #e3f2fd 0%, #e8f4f8 100%)',
                    border: '2px solid var(--apple-blue)',
                    padding: '24px',
                    borderRadius: '16px'
                  }}>
                    <h4 style={{ marginTop: 0, color: 'var(--apple-blue)', fontSize: '19px', fontWeight: '600' }}>
                      📷 {t('ocrModeTitle')}
                    </h4>
                    <p style={{ fontSize: '15px', marginBottom: '20px', lineHeight: '1.6', color: 'var(--apple-gray)' }}>
                      {t('ocrModeDescription')}<br/>
                      <strong>{t('ocrModeBenefit')}</strong>
                    </p>
                    
                    <div style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#fff3e0', borderRadius: '12px', fontSize: '14px' }}>
                      <strong style={{ color: '#1d1d1f' }}>📸 {t('ocrScreenshotTitle')}</strong>
                      <ul style={{ marginTop: '8px', marginBottom: '0', paddingLeft: '24px', color: 'var(--apple-gray)' }}>
                        <li>{t('ocrScreenshotMac')}</li>
                        <li>{t('ocrScreenshotWindows')}</li>
                        <li><strong>{t('ocrScreenshotRecommend')}</strong></li>
                      </ul>
                    </div>

                    <label htmlFor="imageUpload" style={{ display: 'block', marginBottom: '12px', fontWeight: '600', color: 'var(--apple-blue)', fontSize: '15px' }}>
                      📁 {t('ocrUploadLabel')}
                    </label>
                    <input
                      type="file"
                      id="imageUpload"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      style={{
                        display: 'block',
                        marginBottom: '16px',
                        padding: '12px',
                        border: '2px dashed var(--apple-blue)',
                        borderRadius: '12px',
                        width: '100%',
                        cursor: 'pointer',
                        backgroundColor: 'white',
                        boxSizing: 'border-box'
                      }}
                    />
                    
                    {imageFiles.length > 0 && (
                      <div style={{ marginTop: '16px' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, padding: '16px', backgroundColor: '#e8f5e9', borderRadius: '12px' }}>
                            <strong style={{ color: '#2e7d32', fontSize: '15px' }}>
                              ✅ {t('ocrUploadedLabel').replace('{count}', imageFiles.length.toString())}
                            </strong>
                            <ul style={{ marginTop: '12px', fontSize: '14px', paddingLeft: '24px', color: 'var(--apple-gray)', marginBottom: 0 }}>
                              {imageFiles.map((file, index) => (
                                <li key={index}>{file.name} ({(file.size / 1024).toFixed(2)} KB)</li>
                              ))}
                            </ul>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setImageFiles([]);
                              // ファイル入力もリセット
                              const fileInput = document.getElementById('imageUpload') as HTMLInputElement;
                              if (fileInput) fileInput.value = '';
                              showSuccess(`🗑️ ${t('imagesDeleted')}`);
                            }}
                            className="button-apple"
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#ff3b30',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: '600',
                              whiteSpace: 'nowrap',
                              minWidth: 'auto'
                            }}
                          >
                            🗑️ {t('deleteButton')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ソースコード挿入モード - セクション内に表示 */}
                {useSourceCode && (
                  <div className="source-code-section-apple" style={{
                    marginTop: '20px',
                    background: 'linear-gradient(135deg, #fff3e0 0%, #fff8e1 100%)',
                    border: '2px solid #ff9500',
                    padding: '24px',
                    borderRadius: '16px'
                  }}>
                    <label htmlFor="sourceCode" style={{ display: 'block', marginBottom: '12px', fontWeight: '600', color: '#e65100', fontSize: '15px' }}>
                      📋 {t('sourceCodeModeTitle')}
                    </label>
                    <div style={{ marginBottom: '16px', padding: '16px', backgroundColor: '#fff8e1', borderRadius: '12px', fontSize: '14px' }}>
                      <strong style={{ color: '#1d1d1f' }}>{t('sourceCodeModePasteInstructions')}</strong>
                    </div>
                    <textarea
                      id="sourceCode"
                      value={sourceCodeInput}
                      onChange={(e) => setSourceCodeInput(e.target.value)}
                      placeholder={t('sourceCodeModePlaceholder')}
                      style={{
                        width: '100%',
                        minHeight: '250px',
                        padding: '16px',
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        borderRadius: '12px',
                        border: sourceCodeInput ? '2px solid #4caf50' : '2px dashed #ff9500',
                        backgroundColor: sourceCodeInput ? '#f1f8e9' : 'white',
                        boxSizing: 'border-box'
                      }}
                    />
                    {sourceCodeInput && (
                      <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ flex: 1, padding: '16px', backgroundColor: '#e8f5e9', borderRadius: '12px', fontSize: '14px', color: '#2e7d32' }}>
                          ✅ {t('sourceCodeModePasted').replace('{size}', (sourceCodeInput.length / 1024).toFixed(2))}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSourceCodeInput('');
                            showSuccess(`🗑️ ${t('sourceCodeDeleted')}`);
                          }}
                          className="button-apple"
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#ff3b30',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: '600',
                            whiteSpace: 'nowrap',
                            minWidth: 'auto'
                          }}
                        >
                          🗑️ {t('sourceCodeDeleteButton')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="form-section-apple">
            <h3 className="section-title-apple">⚙️ {t('generationSettingsLabel')}</h3>
            
            <div className="input-group-apple">
              <label htmlFor="maxQA">{t('maxQALabel')}:</label>
              <select
                id="maxQA"
                value={config.maxQA}
                onChange={(e) => setConfig({ ...config, maxQA: parseInt(e.target.value) })}
                disabled={loading}
              >
                {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200].map(num => (
                  <option key={num} value={num}>{num}</option>
                ))}
              </select>
            </div>

            <div className="input-group-apple">
              <label>{t('qaTypesLabel')}:</label>
              <div className="checkbox-group-apple">
                <label className="checkbox-label-apple">
                  <input
                    type="checkbox"
                    checked={config.includeTypes.collected}
                    onChange={(e) => setConfig({
                      ...config,
                      includeTypes: { ...config.includeTypes, collected: e.target.checked }
                    })}
                    disabled={loading}
                  />
                  <span>{t('collectedQALabel')}</span>
                </label>
                <label className="checkbox-label-apple">
                  <input
                    type="checkbox"
                    checked={config.includeTypes.suggested}
                    onChange={(e) => setConfig({
                      ...config,
                      includeTypes: { ...config.includeTypes, suggested: e.target.checked }
                    })}
                    disabled={loading}
                  />
                  <span>{t('suggestedQALabel')}</span>
                </label>
              </div>
            </div>
          </div>

          <div className="form-section-apple">
            <h3 className="section-title-apple">📥 {t('exportSettingsLabel')}</h3>
            <div className="input-group-apple">
              <label>{t('fileFormatLabel')}:</label>
              <div className="checkbox-group-apple">
                <label className="checkbox-label-apple">
                  <input
                    type="checkbox"
                    checked={exportFormats.has('pdf')}
                    onChange={() => toggleExportFormat('pdf')}
                  />
                  <span>📕 PDF</span>
                </label>
                <label className="checkbox-label-apple">
                  <input
                    type="checkbox"
                    checked={exportFormats.has('text')}
                    onChange={() => toggleExportFormat('text')}
                  />
                  <span>📄 Text (txt)</span>
                </label>
              </div>
            </div>
            <div className="checkbox-group-apple">
              <label className="checkbox-label-apple">
                <input
                  type="checkbox"
                  checked={includeLabels}
                  onChange={(e) => {
                    setIncludeLabels(e.target.checked);
                    // ラベルをOFFにした時は動画情報もOFFにする
                    if (!e.target.checked) {
                      setIncludeVideoInfo(false);
                    }
                  }}
                />
                <span>{t('includeLabelsText')}</span>
              </label>
              
              {/* includeLabelsがtrueの場合のみ表示 */}
              {includeLabels && (
                <label className="checkbox-label-apple" style={{marginLeft: '24px', marginTop: '8px'}}>
                  <input
                    type="checkbox"
                    checked={includeVideoInfo}
                    onChange={(e) => setIncludeVideoInfo(e.target.checked)}
                  />
                  <span>{t('includeVideoInfoText')}</span>
                </label>
              )}
            </div>
          </div>

          <button type="submit" disabled={loading} className="button-apple button-primary-apple">
            {loading ? `${t('processingLabel')}` : `${t('startGenerationButton')}`}
          </button>
        </form>

        {successMessage && (
          <div className="success-message-apple">
            <p>{successMessage}</p>
          </div>
        )}

        {error && (
          <div className="error-apple">
            <h3>❌ {t('errorLabel')}</h3>
            <p>{error}</p>
          </div>
        )}

        {showApiKeyInput && (
          <div className="api-key-input-apple">
            <h3>🔑 {t('apiKeyInputTitle')}</h3>
            <p style={{color: '#86868b', fontSize: '15px', marginBottom: '20px'}}>
              {t('apiKeyInputNote')}
            </p>
            <div className="input-group-apple">
              <label htmlFor="tempApiKey">OpenAI API Key:</label>
              <input
                type="password"
                id="tempApiKey"
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                placeholder="sk-proj-..."
                className="api-key-input"
                style={{fontFamily: 'monospace'}}
              />
            </div>
            <div style={{display: 'flex', gap: '12px', marginTop: '20px'}}>
              <button 
                onClick={() => {
                  setShowApiKeyInput(false);
                  setError(null);
                }}
                className="button-apple button-secondary-apple"
              >
                {t('cancelButton')}
              </button>
              <button 
                onClick={() => {
                  if (tempApiKey.trim()) {
                    setShowApiKeyInput(false);
                    setError(null);
                    // フォームを再送信
                    const form = document.querySelector('form');
                    if (form) {
                      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                    }
                  } else {
                    alert(t('apiKeyInputRequired') || 'Please enter API Key');
                  }
                }}
                className="button-apple button-primary-apple"
                disabled={!tempApiKey.trim()}
              >
                {t('retryWithApiKeyButton')}
              </button>
            </div>
          </div>
        )}

        {result && (
          <>
            {!result.robotsAllowed && (
              <div className="warning-apple">
                <h3>⚠️ {t('robotsBlockedTitle')}</h3>
                <p>{t('robotsBlockedText1')}</p>
                <p>{t('robotsBlockedText2')}</p>
              </div>
            )}

            {result.robotsAllowed && (
              <>
                <div className="stats-apple">
                  <h3 className="stats-title-apple">📊 {t('referenceStatsTitle')}</h3>
                  <div className="stats-grid-apple">
                    <div className="stat-item-apple">
                      <div className="stat-icon-apple">📄</div>
                      <div className="stat-value-apple">{result.stats.totalPages}</div>
                      <div className="stat-label-apple">{t('totalPagesLabel')}</div>
                    </div>
                    <div className="stat-item-apple">
                      <div className="stat-icon-apple">💬</div>
                      <div className="stat-value-apple">{result.qaItems.length}</div>
                      <div className="stat-label-apple">{t('generatedQACountLabel')}</div>
                    </div>
                    <div className="stat-item-apple">
                      <div className="stat-icon-apple">📝</div>
                      <div className="stat-value-apple">{getQACountByType('text')}</div>
                      <div className="stat-label-apple">{t('textLabel')}</div>
                    </div>
                    <div className="stat-item-apple">
                      <div className="stat-icon-apple">🎬</div>
                      <div className="stat-value-apple">{getMediaQACount()}</div>
                      <div className="stat-label-apple">{t('imageVideoLabel')}</div>
                    </div>
                    <div className="stat-item-apple">
                      <div className="stat-icon-apple">📦</div>
                      <div className="stat-value-apple">{getQACountByType('pdf')}</div>
                      <div className="stat-label-apple">{t('otherPdfLabel')}</div>
                    </div>
                    <div className="stat-item-apple">
                      <div className="stat-icon-apple">⭐</div>
                      <div className="stat-value-apple">{result.stats.reviewsAnalyzed}</div>
                      <div className="stat-label-apple">{t('reviewsLabel')}</div>
                    </div>
                    {result.cost && (
                      <div className="stat-item-apple stat-highlight-apple">
                        <div className="stat-icon-apple">💰</div>
                        <div className="stat-value-apple">${result.cost.toFixed(4)}</div>
                        <div className="stat-label-apple">{t('apiCostLabel')}</div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="qa-list-apple">
                  <div className="qa-list-header-apple">
                    <h3>📋 {t('generatedQAListTitle')}</h3>
                    <div className="export-controls-apple">
                      <button onClick={handleExport} className="button-apple button-primary-apple">
                        💾 {t('downloadButton')}
                      </button>
                    </div>
                  </div>

                  {result.qaItems.map((item, index) => (
                    <div key={item.id} className="qa-item-apple">
                      <div className="qa-number-apple">Q{index + 1}</div>
                      <div className="qa-content-apple">
                        {editingId === item.id ? (
                          <div className="qa-edit-form-apple">
                            <input
                              type="text"
                              value={editForm.question}
                              onChange={(e) => setEditForm({ ...editForm, question: e.target.value })}
                              className="edit-input-apple"
                              placeholder={t('questionPlaceholder')}
                            />
                            <textarea
                              value={editForm.answer}
                              onChange={(e) => setEditForm({ ...editForm, answer: e.target.value })}
                              className="edit-textarea-apple"
                              placeholder={t('answerPlaceholder')}
                              rows={3}
                            />
                            <div className="edit-actions-apple">
                              <button onClick={() => handleSaveEdit(item.id)} className="button-apple button-success-apple">
                                💾 {t('saveButton')}
                              </button>
                              <button onClick={() => setEditingId(null)} className="button-apple button-secondary-apple">
                                ❌ {t('cancelButton')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="qa-question-apple">
                              <strong>Q:</strong> {item.question}
                            </div>
                            <div className="qa-answer-apple">
                              <strong>A:</strong> {item.answer}
                            </div>
                            <div className="qa-meta-apple">
                              <span className={`badge-apple badge-${item.source}-apple`}>
                                {getSourceLabel(item.source)}
                              </span>
                              <span className="badge-apple badge-type-apple">
                                {getSourceTypeLabel(item.sourceType)}
                              </span>
                              {item.needsVideo && (() => {
                                const videoInfo = getVideoInfo(item);
                                return (
                                  <span 
                                    className="badge-apple badge-video-apple" 
                                    title={videoInfo.videoReason || videoInfo.videoExamples ? (t('videoLabelClickHint') || 'Click to show details') : ''}
                                    onClick={videoInfo.videoReason || videoInfo.videoExamples ? () => {
                                      const details = [
                                        `🎥 ${t('videoRecommendationTitle')}`,
                                        '',
                                        videoInfo.videoReason ? `📌 ${t('videoReasonTitle')}:\n${videoInfo.videoReason}` : '',
                                        '',
                                        videoInfo.videoExamples && videoInfo.videoExamples.length > 0 ? `🎬 ${t('videoExamplesTitle')}:\n${videoInfo.videoExamples.map((ex: string) => `  • ${ex}`).join('\n')}` : ''
                                      ].filter(Boolean).join('\n');
                                      alert(details);
                                    } : undefined}
                                    style={{cursor: videoInfo.videoReason || videoInfo.videoExamples ? 'pointer' : 'default'}}
                                  >
                                    🎥 {t('videoRecommendedBadge')}
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="qa-actions-apple">
                              <button onClick={() => handleEdit(item)} className="button-apple button-secondary-apple">
                                ✏️ {t('editButton')}
                              </button>
                              <button onClick={() => handleDelete(item.id)} className="button-apple button-danger-apple">
                                🗑️ {t('deleteButton')}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AppAdvanced;
