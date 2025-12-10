// 現在のタブ情報を取得
let currentTab = null;
let extractedHTML = null;
let currentURL = null;

// ページ読み込み時に現在のタブ情報を取得
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    currentTab = tabs[0];
    currentURL = tabs[0].url;
    document.getElementById('currentUrl').textContent = `現在のページ: ${currentURL}`;
  }
});

// HTML抽出ボタン
document.getElementById('extractBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  const extractBtn = document.getElementById('extractBtn');
  const copyBtn = document.getElementById('copyBtn');
  
  try {
    extractBtn.disabled = true;
    statusDiv.innerHTML = '<div class="info">HTMLを抽出中...</div>';
    
    // 現在のタブでスクリプトを実行してHTMLを取得
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        // ページの完全なHTMLを取得
        return {
          html: document.documentElement.outerHTML,
          url: window.location.href,
          title: document.title
        };
      }
    });
    
    if (results && results[0] && results[0].result) {
      const data = results[0].result;
      extractedHTML = data.html;
      currentURL = data.url;
      
      // ローカルストレージに保存
      chrome.storage.local.set({
        extractedHTML: extractedHTML,
        extractedURL: currentURL,
        extractedTitle: data.title,
        extractedAt: new Date().toISOString()
      }, () => {
        statusDiv.innerHTML = `
          <div class="success">
            ✅ HTML抽出成功！<br>
            <small>サイズ: ${(extractedHTML.length / 1024).toFixed(2)} KB</small><br>
            <small>タイトル: ${data.title}</small><br>
            <small>次: 「HTMLをコピー」をクリック</small>
          </div>
        `;
        extractBtn.disabled = false;
        copyBtn.style.display = 'block'; // コピーボタンを表示
      });
    } else {
      throw new Error('HTMLの抽出に失敗しました');
    }
  } catch (error) {
    console.error('Error:', error);
    statusDiv.innerHTML = `<div class="error">❌ エラー: ${error.message}</div>`;
    extractBtn.disabled = false;
  }
});

// HTMLをコピーボタン
document.getElementById('copyBtn').addEventListener('click', async () => {
  const statusDiv = document.getElementById('status');
  
  if (!extractedHTML) {
    statusDiv.innerHTML = '<div class="error">❌ 先にHTMLを抽出してください</div>';
    return;
  }
  
  try {
    // クリップボードにコピー
    await navigator.clipboard.writeText(extractedHTML);
    
    statusDiv.innerHTML = `
      <div class="success">
        ✅ クリップボードにコピーしました！<br>
        <small>サイズ: ${(extractedHTML.length / 1024).toFixed(2)} KB</small><br>
        <small>次: 「Q&A Generator を開く」をクリック</small>
      </div>
    `;
  } catch (error) {
    console.error('Copy error:', error);
    statusDiv.innerHTML = `<div class="error">❌ コピーに失敗: ${error.message}</div>`;
  }
});

// Q&A Generatorを開くボタン
document.getElementById('openAppBtn').addEventListener('click', () => {
  // 本番環境のURL（デプロイ先に応じて変更）
  const appURL = 'https://advanced-qa-generator.fly.dev';
  // const appURL = 'http://localhost:5173'; // ローカル開発時
  
  chrome.tabs.create({ url: appURL });
});
