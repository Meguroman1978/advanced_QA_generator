import { useState } from 'react';
import './App.css';

interface WorkflowResult {
  url: string;
  extractedContent: string;
  qaResult: string;
}

function App() {
  const [url, setUrl] = useState('https://n8n.io');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      if (!data.success) {
        throw new Error(data.error || 'Failed to process workflow');
      }

      setResult(data.data);
    } catch (err) {
      console.error('Request error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
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
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
