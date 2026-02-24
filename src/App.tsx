import { useState } from 'react';
import './App.css';
import { TestOCRButton } from './test-component';

interface WorkflowResult {
  url: string;
  extractedContent: string;
  qaResult: string;
  qaItems?: Array<{
    id: string;
    question: string;
    answer: string;
    needsVideo?: boolean;
    videoReason?: string;
    videoExamples?: string[];
    complianceWarning?: boolean;  // 薬機法注意フラグ
  }>;
}

function App() {
  const [url, setUrl] = useState('https://n8n.io');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [includeVideoInfo, setIncludeVideoInfo] = useState(false);
  const [useSourceCode, setUseSourceCode] = useState(false);
  const [sourceCodeInput, setSourceCodeInput] = useState('');
  const [useImageOCR, setUseImageOCR] = useState(false); // Image OCR mode state
  const [imageFiles, setImageFiles] = useState<File[]>([]); // Uploaded images

  // API URLを環境に応じて設定
  // VITE_API_URLが設定されている場合はそれを使用
  // 設定されていない場合は、hostnameで判定
  const getApiUrl = () => {
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL;
    }
    // runtime判定: localhostの場合のみ別ポートを使用
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      return 'http://localhost:3001';
    }
    // 本番環境では空文字（相対パス）
    return '';
  };
  const API_URL = getApiUrl();

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setImageFiles(files);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      console.log('Sending request to:', `${API_URL}/api/workflow`);
      
      // 画像OCRモードの場合
      if (useImageOCR && imageFiles.length > 0) {
        const formData = new FormData();
        formData.append('url', url);
        imageFiles.forEach((file, index) => {
          formData.append(`image${index}`, file);
        });
        
        const response = await fetch(`${API_URL}/api/workflow-ocr`, {
          method: 'POST',
          body: formData,
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Error response:', errorText);
          throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('OCR Response data:', data);
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to process OCR workflow');
        }

        setResult(data.data);
        console.log('Result set with qaItems:', data.data?.qaItems?.length, 'items');
        return;
      }
      
      // 通常のモード
      const requestBody = useSourceCode && sourceCodeInput
        ? { url, sourceCode: sourceCodeInput }
        : { url };
      
      const response = await fetch(`${API_URL}/api/workflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error response:', errorText);
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Response data:', data);
      console.log('Response data.data:', data.data);
      console.log('Response data.data.qaItems:', data.data?.qaItems);
      console.log('qaItems length:', data.data?.qaItems?.length);
      
      // 🔍 診断情報の詳細ログ
      console.log('🔍 DIAGNOSTICS CHECK:');
      console.log('  - Has diagnostics?', !!data.data?.diagnostics);
      console.log('  - Diagnostics object:', data.data?.diagnostics);
      console.log('  - QA count:', data.data?.qaItems?.length);

      if (!data.success) {
        throw new Error(data.error || 'Failed to process workflow');
      }

      // 🔍 Q&A数が0の場合、診断情報を表示
      if (data.data?.qaItems?.length === 0) {
        console.log('⚠️ Zero Q&As detected, checking diagnostics...');
        
        if (data.data?.diagnostics) {
          console.log('✅ Diagnostics found, displaying error message');
          const diag = data.data.diagnostics;
          let errorMsg = '❌ Q&A生成に失敗しました\n\n';
          errorMsg += '【診断情報】\n';
          errorMsg += `・ページタイトル: ${diag.pageTitle || 'N/A'}\n`;
          errorMsg += `・HTML取得サイズ: ${diag.htmlLength} bytes\n`;
          errorMsg += `・抽出コンテンツ長: ${diag.contentLength} 文字\n`;
          
          if (diag.is403) {
            errorMsg += '\n🚫 403 Forbidden エラー\n';
            errorMsg += '→ サイトがアクセスをブロックしています\n';
            errorMsg += '→ このサイトはクローラーアクセスを制限しています\n\n';
            errorMsg += '【HTMLプレビュー】\n';
            errorMsg += diag.htmlPreview || 'N/A';
          } else if (diag.fetchError) {
            errorMsg += `\n⚠️ 取得エラー: ${diag.fetchError}\n`;
          } else if (diag.contentLength < 100) {
            errorMsg += '\n⚠️ コンテンツが短すぎます\n';
            errorMsg += '→ ページが正常に読み込まれていない可能性があります\n';
          }
          
          errorMsg += '\n\n【対策】\n';
          errorMsg += '1. URLを再確認してください\n';
          errorMsg += '2. 別のURLで試してください\n';
          errorMsg += '3. サイトのアクセス制限が緩いページを選んでください';
          
          console.log('📤 Setting error message:', errorMsg.substring(0, 100) + '...');
          setError(errorMsg);
          // エラーがある場合は result を設定しない
          setResult(null);
          return; // 早期リターン
        } else {
          console.log('❌ No diagnostics found in response');
          // 診断情報がない場合のフォールバック
          const fallbackError = '❌ Q&A生成に失敗しました。\n\nサーバーから診断情報を取得できませんでした。\n\n対策:\n1. ページを再読み込みしてください\n2. 別のURLで試してください\n3. サーバーログを確認してください';
          setError(fallbackError);
          setResult(null);
          return; // 早期リターン
        }
      } else {
        console.log('✅ Q&As generated successfully:', data.data?.qaItems?.length);
        
        // 🚨 強制チェック: Q&A数が0なのに診断情報がない場合
        if (data.data?.qaItems?.length === 0) {
          console.error('🚨 CRITICAL: Q&A count is 0 but no diagnostics!');
          console.log('🔍 Response data:', JSON.stringify(data.data, null, 2));
          
          // 強制的にエラーメッセージを表示
          setError(`❌ Q&A生成に失敗しました (0件)\n\n【サーバーレスポンス】\n${JSON.stringify(data.data, null, 2)}\n\n【対策】\n1. サーバーログを確認してください\n2. flyctl logs --app advanced-qa-generator\n3. この情報を報告してください`);
          setResult(null);
          return;
        }
      }

      setResult(data.data);
      console.log('Result set with qaItems:', data.data?.qaItems?.length, 'items');
    } catch (err) {
      console.error('Request error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: 'pdf' | 'text') => {
    console.log('handleExport called with format:', format);
    console.log('result:', result);
    console.log('result.qaItems:', result?.qaItems);
    console.log('result.qaItems.length:', result?.qaItems?.length);
    console.log('includeVideoInfo:', includeVideoInfo);
    
    if (!result?.qaItems || result.qaItems.length === 0) {
      const errorMsg = 'エクスポートするQ&Aがありません';
      console.error(errorMsg);
      setError(errorMsg);
      return;
    }

    setExporting(true);
    setError(null);

    try {
      console.log(`📥 Exporting as ${format}...`);
      console.log(`📤 Sending ${result.qaItems.length} qaItems to server (includeVideoInfo: ${includeVideoInfo})`);
      const response = await fetch(`${API_URL}/api/export/single`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          qaItems: result.qaItems,
          format: format,
          includeVideoInfo: includeVideoInfo
        }),
      });

      console.log('Export response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Export error response:', errorText);
        throw new Error(`Export failed: ${response.status} - ${errorText}`);
      }

      // レスポンスをBlobとして取得
      const blob = await response.blob();
      console.log(`✅ Received ${format} blob: ${blob.size} bytes`);

      // ダウンロードリンクを作成してクリック
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = format === 'pdf' ? 'qa-collection.pdf' : 'qa-collection.txt';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      console.log(`✅ ${format.toUpperCase()} download triggered successfully`);
    } catch (err) {
      console.error('❌ Export error:', err);
      console.error('Error type:', typeof err);
      console.error('Error details:', err);
      const errorMessage = err instanceof Error ? err.message : `${format.toUpperCase()} エクスポートに失敗しました`;
      console.error('Setting error message:', errorMessage);
      setError(errorMessage);
    } finally {
      setExporting(false);
    }
  };

  const handleExportBoth = async () => {
    await handleExport('pdf');
    // PDFダウンロード後に少し待機してからTXTをダウンロード
    setTimeout(async () => {
      await handleExport('text');
    }, 500);
  };

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1>🔗 Web Q&A Generator</h1>
          <p className="subtitle">n8nワークフローをWebアプリ化</p>
        </header>

        <div className="workflow-diagram">
          <div className="node">
            <div className="node-icon">▶️</div>
            <div className="node-label">Start</div>
          </div>
          <div className="arrow">→</div>
          <div className="node">
            <div className="node-icon">🌐</div>
            <div className="node-label">HTTP Request</div>
          </div>
          <div className="arrow">→</div>
          <div className="node">
            <div className="node-icon">📄</div>
            <div className="node-label">HTML Extract</div>
          </div>
          <div className="arrow">→</div>
          <div className="node">
            <div className="node-icon">🤖</div>
            <div className="node-label">OpenAI</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="form">
          <div className="browser-extension-section" style={{
            marginBottom: '20px',
            padding: '20px',
            backgroundColor: '#f0f7fa',
            borderRadius: '8px',
            border: '1px solid #c5d9e0'
          }}>
            <h3 style={{ marginTop: 0, color: '#2c3e50', fontSize: '1.3rem', fontWeight: '600' }}>🔓 ボット検知を100%回避する方法</h3>
            <p style={{ fontSize: '14px', marginBottom: '10px' }}>
              <strong>Chrome拡張機能を使用した手順：</strong>
            </p>
            <ol style={{ fontSize: '13px', marginBottom: '15px', paddingLeft: '20px', lineHeight: '1.8' }}>
              <li>ターゲットページで拡張機能を開く</li>
              <li>「このページのHTMLを抽出」をクリック</li>
              <li><strong>「HTMLをコピー」をクリック</strong></li>
              <li>「Q&A Generator を開く」をクリック（このページが開く）</li>
              <li>下の「ソースコード挿入を有効化」をクリック</li>
              <li>オレンジ色のテキストエリアに<strong>貼り付け（Cmd+V）</strong></li>
              <li>URLを入力して「Q&Aを生成」をクリック</li>
            </ol>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setUseSourceCode(!useSourceCode);
                  setUseImageOCR(false);
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: useSourceCode ? '#5b8fb9' : '#7fb069',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                {useSourceCode ? '✅ ソースコード挿入モード' : '📝 ソースコード挿入'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setUseImageOCR(!useImageOCR);
                  setUseSourceCode(false);
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: useImageOCR ? '#5b8fb9' : '#95a5a6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                {useImageOCR ? '✅ 画像OCRモード' : '📷 画像OCRモード'}
              </button>
              <TestOCRButton />
            </div>
            <details style={{ fontSize: '13px', cursor: 'pointer' }}>
              <summary style={{ fontWeight: 'bold', marginBottom: '5px' }}>拡張機能のインストール方法を表示</summary>
              <ol style={{ paddingLeft: '20px', lineHeight: '1.6' }}>
                <li>GitHubリポジトリの <code>BROWSER_EXTENSION</code> フォルダをダウンロード</li>
                <li>Chromeで <code>chrome://extensions/</code> を開く</li>
                <li>「デベロッパーモード」をON</li>
                <li>「パッケージ化されていない拡張機能を読み込む」をクリック</li>
                <li><code>BROWSER_EXTENSION</code> フォルダを選択</li>
              </ol>
            </details>
          </div>

          {useImageOCR && (
            <div className="image-ocr-section" style={{
              marginBottom: '20px',
              padding: '15px',
              backgroundColor: '#e3f2fd',
              borderRadius: '8px',
              border: '2px solid #2196f3'
            }}>
              <h4 style={{ marginTop: 0, color: '#1565c0' }}>📷 画像OCRモード（100%確実）</h4>
              <p style={{ fontSize: '14px', marginBottom: '15px', lineHeight: '1.6' }}>
                ページの<strong>スクリーンショット</strong>をアップロードしてください。<br/>
                OCR技術で画像内のテキストを自動抽出してQ&Aを生成します。<br/>
                <strong>メリット:</strong> ボット検知を完全回避、ログイン後のページにも対応
              </p>
              
              <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#fff3e0', borderRadius: '4px', fontSize: '13px' }}>
                <strong>📸 スクリーンショットの撮り方:</strong>
                <ul style={{ marginTop: '5px', marginBottom: '5px', paddingLeft: '20px' }}>
                  <li><strong>Mac:</strong> Cmd + Shift + 4 （範囲選択）または Cmd + Shift + 3 （全画面）</li>
                  <li><strong>Windows:</strong> Windows + Shift + S （範囲選択）または PrintScreen （全画面）</li>
                  <li><strong>推奨:</strong> ページ全体をスクロールして複数枚撮影（最大10枚まで）</li>
                </ul>
              </div>

              <label htmlFor="imageUpload" style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: '#1565c0' }}>
                📁 画像ファイルをアップロード（PNG, JPEG, 最大10枚）:
              </label>
              <input
                type="file"
                id="imageUpload"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                style={{
                  display: 'block',
                  marginBottom: '10px',
                  padding: '10px',
                  border: '2px dashed #2196f3',
                  borderRadius: '4px',
                  width: '100%',
                  cursor: 'pointer'
                }}
              />
              
              {imageFiles.length > 0 && (
                <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#e8f5e9', borderRadius: '4px' }}>
                  <strong style={{ color: '#2e7d32' }}>✅ アップロード済み: {imageFiles.length}枚</strong>
                  <ul style={{ marginTop: '10px', fontSize: '13px', paddingLeft: '20px' }}>
                    {imageFiles.map((file, index) => (
                      <li key={index}>{file.name} ({(file.size / 1024).toFixed(2)} KB)</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {useSourceCode && (
            <div className="source-code-section" style={{
              marginBottom: '20px',
              padding: '15px',
              backgroundColor: '#fff3e0',
              borderRadius: '8px',
              border: '2px solid #ff9800'
            }}>
              <label htmlFor="sourceCode" style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold', color: '#e65100' }}>
                📋 HTMLソースコード（Chrome拡張機能でコピーしたHTMLを貼り付け）:
              </label>
              <div style={{ marginBottom: '10px', padding: '10px', backgroundColor: '#fff8e1', borderRadius: '4px', fontSize: '13px' }}>
                <strong>貼り付け方法:</strong> テキストエリア内をクリック → <code>Cmd+V</code> (Mac) または <code>Ctrl+V</code> (Windows)
              </div>
              <textarea
                id="sourceCode"
                value={sourceCodeInput}
                onChange={(e) => setSourceCodeInput(e.target.value)}
                placeholder="1. Chrome拡張機能で「HTMLをコピー」をクリック
2. ここをクリック
3. Cmd+V（Mac）または Ctrl+V（Windows）で貼り付け

HTMLが貼り付けられると、ここに <!DOCTYPE html>... のようなコードが表示されます"
                style={{
                  width: '100%',
                  minHeight: '250px',
                  padding: '15px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  borderRadius: '4px',
                  border: sourceCodeInput ? '2px solid #4caf50' : '2px dashed #ff9800',
                  backgroundColor: sourceCodeInput ? '#f1f8e9' : '#fff'
                }}
              />
              {sourceCodeInput && (
                <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#e8f5e9', borderRadius: '4px', fontSize: '13px', color: '#2e7d32' }}>
                  ✅ HTMLが貼り付けられました（{(sourceCodeInput.length / 1024).toFixed(2)} KB）
                </div>
              )}
            </div>
          )}

          <div className="input-group">
            <label htmlFor="url">Webサイト URL:</label>
            <input
              type="url"
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
              disabled={loading}
            />
          </div>
          <button type="submit" disabled={loading} className="submit-button">
            {loading ? '処理中...' : 'Q&Aを生成する'}
          </button>
        </form>

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Webページを取得してQ&Aを生成中...</p>
          </div>
        )}

        {error && (
          <div className="error" style={{
            backgroundColor: '#ffebee',
            border: '2px solid #f44336',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '20px'
          }}>
            <h3 style={{ color: '#d32f2f', marginTop: 0 }}>❌ エラー</h3>
            <pre style={{
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              backgroundColor: '#f5f5f5',
              padding: '15px',
              borderRadius: '5px',
              fontSize: '13px',
              lineHeight: '1.6',
              maxHeight: '400px',
              overflow: 'auto',
              margin: 0
            }}>{error}</pre>
          </div>
        )}

        {result && (
          <div className="result">
            <div className="result-section">
              <h3>📍 処理したURL</h3>
              <p className="url-result">{result.url}</p>
            </div>

            <div className="result-section">
              <h3>📄 抽出されたコンテンツ（抜粋）</h3>
              <div className="content-box">
                {result.extractedContent}
              </div>
            </div>

            <div className="result-section">
              <h3>❓ 生成されたQ&A</h3>
              {result.qaItems && result.qaItems.length > 0 ? (
                <div className="qa-items-detailed">
                  {result.qaItems.map((qa, index) => (
                    <div key={qa.id} className="qa-item-card">
                      <div className="qa-item-header">
                        <span className="qa-number">Q{index + 1}</span>
                        {qa.complianceWarning && (
                          <span className="compliance-warning-badge">⚠️ 薬機法注意</span>
                        )}
                        {qa.needsVideo && (
                          <span className="video-badge">🎥 動画推奨</span>
                        )}
                      </div>
                      <div className="qa-question">
                        <strong>Q:</strong> {qa.question}
                      </div>
                      <div className="qa-answer">
                        <strong>A:</strong> {qa.answer}
                      </div>
                      {qa.needsVideo && qa.videoReason && (
                        <div className="video-suggestion">
                          <div className="video-reason">
                            <strong>動画推奨理由:</strong> {qa.videoReason}
                          </div>
                          {qa.videoExamples && qa.videoExamples.length > 0 && (
                            <div className="video-examples">
                              <strong>動画例:</strong>
                              <ul>
                                {qa.videoExamples.map((example, i) => (
                                  <li key={i}>{example}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="qa-box">
                  {result.qaResult}
                </div>
              )}
            </div>

            <div className="result-section">
              <h3>💾 ダウンロード</h3>
              <div className="export-options">
                <p className="export-description">
                  Q&Aをダウンロードできます（日本語対応）
                  {result.qaItems && ` - ${result.qaItems.length}件のQ&A`}
                </p>
                
                {!result.qaItems || result.qaItems.length === 0 ? (
                  <div className="export-warning">
                    <p style={{color: 'red'}}>
                      ⚠️ ダウンロード可能なQ&Aがありません。Q&A生成を再実行してください。
                    </p>
                  </div>
                ) : (
                <>
                  <div className="export-options-checkbox">
                    <label>
                      <input
                        type="checkbox"
                        checked={includeVideoInfo}
                        onChange={(e) => setIncludeVideoInfo(e.target.checked)}
                      />
                      <span className="checkbox-label">
                        出力するPDF/Word/Textファイルにラベル（ソース、情報源タイプ、URL）を含める
                      </span>
                    </label>
                  </div>

                  <div className="export-buttons">
                    <button
                      onClick={() => handleExport('pdf')}
                      disabled={exporting}
                      className="export-button pdf-button"
                    >
                      {exporting ? '⏳ 処理中...' : '📕 PDFでダウンロード'}
                    </button>
                    
                    <button
                      onClick={() => handleExport('text')}
                      disabled={exporting}
                      className="export-button text-button"
                    >
                      {exporting ? '⏳ 処理中...' : '📄 TXTでダウンロード'}
                    </button>
                    
                    <button
                      onClick={handleExportBoth}
                      disabled={exporting}
                      className="export-button both-button"
                    >
                      {exporting ? '⏳ 処理中...' : '📦 両方ダウンロード'}
                    </button>
                  </div>

                  <p className="export-note">
                    ※ PDFとTXTは日本語フォント（Noto Sans JP）を使用しています
                  </p>
                </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
// Force rebuild Thu Dec 11 01:46:32 UTC 2025
