# 🚀 デプロイチェックリスト - TXTボタン表示修正版

## 🐛 報告された問題

1. ✅ チェックボックスは表示される
2. ❌ **TXTダウンロードボタンが表示されない**（PDFボタンのみ表示）
3. ❌ 動画情報がチェックなしでも出力される
4. ✅ 動画情報がチェックありでも出力される

## 🔍 問題の原因

### 可能性1: ブラウザキャッシュ
- Fly.ioにデプロイ後、ブラウザが古いJSファイルをキャッシュしている
- 解決策: 強制リロードまたはキャッシュクリア

### 可能性2: Fly.ioのビルドキャッシュ
- Fly.ioが古いビルド成果物を使用している
- 解決策: クリーンビルドまたはボリューム削除

### 可能性3: CSSの読み込み問題
- `.text-button` や `.both-button` のスタイルが適用されていない
- 解決策: CSSファイルが正しく配信されているか確認

## ✅ 確認済み事項

1. ✅ GitHubへのpushは正常完了（コミット: `9abb706`）
2. ✅ ソースコードには3つのボタンが正しく定義されている
3. ✅ バックエンドの `includeVideoInfo` ロジックは正しい
4. ✅ フロントエンドのデフォルト値は `false`（正しい）
5. ✅ ローカルビルドは成功している

## 🛠️ デプロイ手順（推奨）

### 方法1: 標準デプロイ（まず試す）

```bash
cd advanced_QA_generator
git pull origin main
flyctl deploy --app advanced-qa-generator
```

### 方法2: クリーンデプロイ（標準で解決しない場合）

```bash
cd advanced_QA_generator
git pull origin main

# Fly.ioのビルドキャッシュをクリア
flyctl deploy --app advanced-qa-generator --no-cache
```

### 方法3: 完全リビルド（最終手段）

```bash
cd advanced_QA_generator
git pull origin main

# アプリを再作成（データは保持される）
flyctl apps restart advanced-qa-generator

# デプロイ
flyctl deploy --app advanced-qa-generator --no-cache
```

## 🔍 デプロイ後の確認手順

### ステップ1: ブラウザキャッシュをクリア

**Chrome/Edge:**
```
1. Ctrl+Shift+Delete を押す
2. 「キャッシュされた画像とファイル」をチェック
3. 「データを削除」をクリック
```

**Safari:**
```
1. Cmd+Option+E を押す
2. ページをリロード（Cmd+R）
```

**Firefox:**
```
1. Ctrl+Shift+Delete を押す
2. 「キャッシュ」をチェック
3. 「今すぐ消去」をクリック
```

### ステップ2: 強制リロード

**すべてのブラウザ:**
```
Ctrl+Shift+R (Windows)
Cmd+Shift+R (Mac)
```

### ステップ3: デベロッパーツールで確認

**F12を押して以下を確認:**

#### 1. Networkタブでファイル読み込み確認
```
- index-*.js が最新のハッシュか確認
- index-*.css が最新のハッシュか確認
- Status: 200 (OK) であることを確認
```

#### 2. Elementsタブでボタン存在確認
```
1. 「💾 ダウンロード」セクションを選択
2. .export-buttons の中に3つの button が存在するか
3. display: none などの非表示スタイルがないか
```

#### 3. Consoleタブでエラー確認
```
- 赤いエラーメッセージがないか確認
- includeVideoInfo: false がログに表示されるか
```

## 📊 期待される表示

### 正常な表示

```
┌─────────────────────────────────────────────┐
│ 💾 ダウンロード                              │
├─────────────────────────────────────────────┤
│ Q&Aをダウンロードできます（日本語対応） - 5件 │
│                                             │
│ ┌──────────────────────────────────────┐   │
│ │ ☐ 推奨動画作成例を含める             │   │
│ └──────────────────────────────────────┘   │
│                                             │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│ │📕 PDF   │ │📄 TXT   │ │📦 両方  │   │
│ └──────────┘ └──────────┘ └──────────┘   │
│                                             │
│ ※ PDFとTXTは日本語フォント...              │
└─────────────────────────────────────────────┘
```

**重要:** 3つのボタンが横並びで表示される

### 異常な表示（現在の状態）

```
┌─────────────────────────────────────────────┐
│ 💾 ダウンロード                              │
├─────────────────────────────────────────────┤
│ Q&Aをダウンロードできます（日本語対応） - 5件 │
│                                             │
│ ┌──────────────────────────────────────┐   │
│ │ ☐ 推奨動画作成例を含める             │   │
│ └──────────────────────────────────────┘   │
│                                             │
│ ┌──────────┐                               │
│ │📕 PDF   │                               │  ← TXTと両方が表示されない
│ └──────────┘                               │
│                                             │
│ ※ PDFとTXTは日本語フォント...              │
└─────────────────────────────────────────────┘
```

## 🐛 トラブルシューティング

### 問題1: デプロイ後もTXTボタンが表示されない

**原因1: CSSファイルが古い**
```bash
# ブラウザのデベロッパーツール（F12）→ Networkタブ
# index-*.css のハッシュが変わっているか確認

# もし変わっていない場合:
flyctl deploy --app advanced-qa-generator --no-cache
```

**原因2: JSファイルが古い**
```bash
# ブラウザのデベロッパーツール（F12）→ Networkタブ
# index-*.js のハッシュが変わっているか確認

# もし変わっていない場合:
# 完全リビルドを実行（方法3）
```

**原因3: Fly.ioの静的ファイル配信問題**
```bash
# SSH接続してファイル確認
flyctl ssh console --app advanced-qa-generator

# コンテナ内で確認
ls -la /app/dist/
ls -la /app/dist/assets/
```

### 問題2: 動画情報がチェックなしでも出力される

**デバッグ方法:**
```javascript
// ブラウザコンソール（F12）で確認
// ダウンロードボタンクリック時のログ:
includeVideoInfo: false  // ← これがfalseであることを確認
📤 Sending 5 qaItems to server (includeVideoInfo: false)
```

**もし `true` になっている場合:**
- チェックボックスの状態が正しく反映されていない
- Stateの初期化に問題がある

**確認方法:**
```javascript
// ブラウザコンソールで実行
document.querySelector('input[type="checkbox"]').checked
// → false であることを確認
```

### 問題3: ボタンが見切れている（レスポンシブ問題）

**確認方法:**
```
1. ブラウザの幅を広げる
2. ズームレベルを100%にする（Ctrl+0）
3. F12 → Elements → .export-buttons の width を確認
```

**対処:**
```css
/* もし必要なら、CSSを修正 */
.export-buttons {
  display: flex;
  flex-wrap: wrap;  /* ← これが設定されているか確認 */
  gap: 15px;
}
```

## 📝 最新コミット情報

**コミットハッシュ:** `9abb706`

**コミットメッセージ:**
```
feat: Add checkbox to control video recommendation info in exports
```

**変更されたファイル:**
- `src/App.tsx` - includeVideoInfo state とチェックボックスUI
- `src/App.css` - チェックボックスのスタイル
- `server.ts` - includeVideoInfo パラメータ処理

**ビルド成果物:**
- `dist/index.html`
- `dist/assets/index-DMGhcl1s.css` ← **このハッシュ値が重要**
- `dist/assets/index-CkCDyg0_.js` ← **このハッシュ値が重要**

## 🎯 デプロイ成功の確認方法

### チェックリスト

1. **Fly.ioログ確認**
```bash
flyctl logs --app advanced-qa-generator | tail -50
# "Listening on port 3001" が表示されればOK
```

2. **ヘルスチェック**
```bash
curl https://advanced-qa-generator.fly.dev/api/health
# {"status":"ok","version":"2.0"} が返ればOK
```

3. **静的ファイル確認**
```bash
curl -I https://advanced-qa-generator.fly.dev/
# 200 OK が返ればOK
```

4. **ブラウザ確認**
- 3つのボタンが表示される
- チェックボックスが表示される
- チェックなしでPDFダウンロード → 動画情報なし
- チェックありでPDFダウンロード → 動画情報あり

## 🔄 再デプロイが必要な場合

もし上記の方法でも解決しない場合は、以下を試してください：

### オプション1: ビルドキャッシュの完全削除

```bash
# ローカルで
cd advanced_QA_generator
rm -rf dist node_modules/.vite
npm run build

# Fly.ioで
flyctl deploy --app advanced-qa-generator --no-cache
```

### オプション2: アプリの再起動

```bash
flyctl apps restart advanced-qa-generator
# 数秒待つ
flyctl status --app advanced-qa-generator
```

### オプション3: 新規デプロイ

```bash
# 最終手段: アプリを削除して再作成
# ⚠️ 注意: これは環境変数も削除されます

flyctl apps destroy advanced-qa-generator
flyctl launch --name advanced-qa-generator
# 環境変数を再設定
flyctl secrets set OPENAI_API_KEY=your-key --app advanced-qa-generator
flyctl secrets set NODE_ENV=production --app advanced-qa-generator
```

## 📞 サポート

上記すべてを試しても解決しない場合は、以下の情報を提供してください：

1. ブラウザのスクリーンショット（デベロッパーツール込み）
2. `flyctl logs --app advanced-qa-generator` の出力
3. ブラウザコンソールのログ全文
4. Network タブの screenshot

---

**GitHubリポジトリ:** https://github.com/Meguroman1978/advanced_QA_generator

**最新コミット:** `9abb706`

**デプロイコマンド:**
```bash
cd advanced_QA_generator
git pull origin main
flyctl deploy --app advanced-qa-generator --no-cache
```
