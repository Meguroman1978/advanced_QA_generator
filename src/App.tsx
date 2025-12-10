import { useState } from 'react';
import './App.css';

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
  }>;
}

function App() {
  const [url, setUrl] = useState('https://n8n.io');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [includeVideoInfo, setIncludeVideoInfo] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      console.log('Sending request to:', `${API_URL}/api/workflow`);
      const response = await fetch(`${API_URL}/api/workflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
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
              <div className="qa-box">
                {result.qaResult}
              </div>
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
