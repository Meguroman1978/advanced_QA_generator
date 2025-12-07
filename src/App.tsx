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

      if (!data.success) {
        throw new Error(data.error || 'Failed to process workflow');
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
      console.log(`📤 Sending ${result.qaItems.length} qaItems to server`);
      const response = await fetch(`${API_URL}/api/export/single`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          qaItems: result.qaItems,
          format: format
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
          <div className="error">
            <h3>❌ エラー</h3>
            <p>{error}</p>
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
