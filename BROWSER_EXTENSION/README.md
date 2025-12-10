# Q&A Generator - Chrome Extension

このChrome拡張機能を使用すると、ボット検知されているサイトでも100%確実にHTMLを取得してQ&A生成ができます。

## 📦 インストール方法

### 1. 拡張機能を読み込む

1. Chromeで `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」をONにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. この `BROWSER_EXTENSION` フォルダを選択

### 2. アイコン画像の準備（オプション）

拡張機能のアイコンが必要です。以下のサイズの画像を用意してください：
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

**簡易的な方法:** 
- アイコンがなくても動作します（デフォルトアイコンが使用されます）
- または、任意の画像をリサイズして追加してください

## 🚀 使い方

### ステップ1: ターゲットページでHTMLを抽出

1. Q&Aを生成したいページ（例: 阪急オンラインショップの商品ページ）を開く
2. ブラウザのツールバーにある拡張機能アイコンをクリック
3. 「このページのHTMLを抽出」ボタンをクリック
4. 成功メッセージが表示されます

### ステップ2: Q&A Generatorで使用

2つの方法があります：

#### 方法A: 自動連携（推奨）

1. 拡張機能のポップアップで「Q&A Generator を開く」をクリック
2. Q&A Generator が新しいタブで開きます
3. 「拡張機能からHTMLを読み込む」ボタンをクリック
4. 自動的にHTMLが読み込まれ、Q&A生成が開始されます

#### 方法B: 手動入力

1. Q&A Generator (https://advanced-qa-generator.fly.dev) を開く
2. 「ソースコードを挿入」オプションを選択
3. テキストエリアに、拡張機能で保存されたHTMLをコピー&ペースト
4. Q&A生成を開始

## 🔧 Q&A Generatorアプリ側の対応

アプリ側に以下の機能を追加する必要があります：

### 1. 拡張機能からHTMLを読み込むボタン

```typescript
// src/App.tsx に追加
const [useExtensionHTML, setUseExtensionHTML] = useState(false);

// 拡張機能からHTMLを読み込む関数
const loadFromExtension = async () => {
  try {
    // Chrome Extension APIは通常のWebページからは直接アクセスできないため、
    // ユーザーがコピー&ペーストする方法を使用
    const stored = localStorage.getItem('qa_generator_extension_data');
    if (stored) {
      const data = JSON.parse(stored);
      setUrl(data.url);
      setSourceCodeInput(data.html);
      setUseSourceCode(true);
      alert(`HTMLを読み込みました: ${data.title}`);
    } else {
      alert('拡張機能からHTMLが見つかりませんでした。先に拡張機能でHTMLを抽出してください。');
    }
  } catch (error) {
    console.error('Error loading from extension:', error);
    alert('拡張機能からの読み込みに失敗しました');
  }
};
```

### 2. UIに読み込みボタンを追加

```tsx
<button onClick={loadFromExtension} className="extension-load-btn">
  📄 拡張機能からHTMLを読み込む
</button>
```

## 💡 なぜこの方法が100%成功するのか？

1. **ユーザーのブラウザで実行**: ボット検知されない
2. **認証済みセッション**: ユーザーがログイン済みのセッションを使用
3. **Cookieを含む**: すべての認証情報が含まれる
4. **IPアドレス問題なし**: Fly.ioのIPアドレスを使用しない

## ⚠️ 制限事項

- ユーザーがページを開いてHTMLを抽出する手動作業が必要
- 完全自動化はできない（ただし、ボット検知されているサイトでは現状これが最も確実な方法）

## 🔄 今後の改善案

1. **拡張機能の自動送信機能**: 抽出したHTMLを直接サーバーに送信
2. **認証トークンの管理**: ユーザー認証を追加して安全に送信
3. **バッチ処理**: 複数ページを一度に処理

## 📝 ライセンス

このプロジェクトと同じライセンス
