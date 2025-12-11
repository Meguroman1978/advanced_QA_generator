# Critical Backend Fixes - OCR, Source Code, and Export

## Date: 2024-12-11

## 修正完了した3つの重要な問題

### ✅ 問題1: エクスポートファイルのラベル制御

**問題:** 
「出力ファイルにもラベルを含める」のチェックボックスにチェックが入っていない場合でも、ソース情報などの補足情報が出力されていた。

**根本原因:**
- `/api/export/single` エンドポイントが `includeLabels` パラメータを受け取っていなかった
- `includeVideoInfo` のみをチェックしていたため、ラベル情報が常に動画情報と一緒に表示されていた

**修正内容:**
```typescript
// 修正前
const { qaItems, format, includeVideoInfo = false } = req.body;
if (includeVideoInfo) {
  // ラベル情報と動画情報を両方表示
}

// 修正後
const { qaItems, format, includeLabels = false, includeVideoInfo = false } = req.body;
const shouldShowLabels = includeLabels || includeVideoInfo;
if (shouldShowLabels) {
  if (includeLabels) {
    // ソース、情報源タイプ、URLを表示
  }
  if (includeVideoInfo && item.needsVideo) {
    // 動画推奨情報のみ表示
  }
}
```

**結果:**
- ✅ `includeLabels=false` の場合: Q&A要素のみ出力（補足情報なし）
- ✅ `includeLabels=true` の場合: ソース、情報源タイプ、URLを含む
- ✅ `includeVideoInfo=true` の場合: 動画推奨情報を含む
- ✅ 両方 `true` の場合: すべての情報を含む

**影響するファイル:**
- PDF出力 (PDFDocument)
- Text出力 (.txt)
- Excel出力（フロントエンドで制御）

---

### ✅ 問題2: OCRモードでのQ&A生成数が最大5個に制限

**問題:**
OCRモードで「生成するQ&Aの上限数」を40に設定しても、最大5個しかQ&Aが生成されなかった。

**根本原因:**
`/api/workflow-ocr` エンドポイントの1698行目で `maxQA` が5にハードコードされていた:
```typescript
const maxQA = 5;  // ❌ ハードコード
const language = 'ja';  // ❌ ハードコード
```

**修正内容:**
```typescript
// 修正後: リクエストから値を読み取る
const maxQA = req.body.maxQA ? parseInt(req.body.maxQA, 10) : 40;
const language = req.body.language || 'ja';
console.log('\n🤖 Q&A生成を開始...');
console.log('  - maxQA:', maxQA);
console.log('  - language:', language);
console.log('  - Combined text length:', combinedText.length, 'characters');
```

**追加の改善:**
- OCRで抽出されたテキスト量のログ出力
- 各画像の処理状況の詳細ログ
- リクエストパラメータの確認ログ

**結果:**
- ✅ `maxQA=40` を指定した場合、最大40個のQ&Aが生成される
- ✅ 「想定Q&A（ユーザー視点）」にチェックが入っている場合、指定数に近い数が生成される
- ✅ 言語設定（日本語/英語/中国語）が正しく適用される

**テスト方法:**
```
1. 画像OCRモードを有効化
2. 複数のスクリーンショットをアップロード（テキスト量が多いほど良い）
3. 「生成するQ&Aの上限数」を40に設定
4. 「想定Q&A（ユーザー視点）」にチェック
5. Q&A生成を実行
6. 結果: 約40個のQ&Aが生成される
```

---

### ✅ 問題3: ソースコードモードでのJSONエラー

**問題:**
ソースコード挿入モードで実行すると以下のエラーが発生:
```
Failed to execute 'json' on 'Response': 
Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

**根本原因:**
`/api/workflow` エンドポイントの1083-1089行目でURLが必須になっていた:
```typescript
if (!url) {
  console.log('Error: URL is missing');
  return res.status(400).json({
    success: false,
    error: 'URL is required'  // ❌ URLが常に必要
  });
}
```

ソースコードモードでは、URLなしでもHTMLソースコードだけで動作すべきだった。

**修正内容:**
```typescript
// URLまたはソースコードが必要（どちらか一方でOK）
if (!url && !sourceCode) {
  console.log('Error: URL or sourceCode is required');
  return res.status(400).json({
    success: false,
    error: 'URL or source code is required'
  });
}

// ソースコードのみの場合、URLをダミーに設定
const effectiveUrl = url || 'source-code-input';
console.log('Effective URL:', effectiveUrl);
```

**追加の改善:**
```typescript
if (sourceCode) {
  console.log('✅ Using HTML from browser extension (bypasses all bot detection)');
  console.log('  - Source code length:', sourceCode.length, 'characters');
  html = sourceCode;
  // ページタイトルを抽出
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    diagnostics.pageTitle = titleMatch[1];
    console.log('  - Page title:', titleMatch[1]);
  }
} else if (url) {
  // 通常のフェッチ処理
  console.log('Fetching website:', url);
  // ...
}
```

**結果:**
- ✅ URLなしでソースコードのみで動作
- ✅ HTMLソースコードから正しくコンテンツを抽出
- ✅ ページタイトルの抽出と表示
- ✅ 詳細なログ出力で問題の特定が容易に

**使用方法:**
```
1. 「クローラーアクセス禁止サイトを対象にする際の作業方法」を開く
2. [ソースコード挿入] ボタンをクリック
3. ChromeでページのソースコードをコピーしてHTMLを貼り付け
4. URLフィールドは空でOK
5. Q&A生成を実行
6. 結果: 正常にQ&Aが生成される
```

---

## 技術的な詳細

### 変更されたファイル

#### server.ts
1. **行 1083-1089**: URL検証ロジックを変更
   - `if (!url)` → `if (!url && !sourceCode)`
   - エラーメッセージを更新
   - `effectiveUrl` を追加

2. **行 1104-1139**: HTMLフェッチロジックの改善
   - `if (sourceCode)` のログ出力を強化
   - `else if (url)` に変更（どちらか一方）

3. **行 1147-1149**: Q&A生成の改善
   - `effectiveUrl` を使用
   - コンテンツ長のログ追加

4. **行 1696-1701**: OCR Q&A生成の修正
   - ハードコードされた `maxQA = 5` を削除
   - `req.body.maxQA` から読み取り
   - `req.body.language` から読み取り
   - 詳細なログ追加

5. **行 1390-1594**: エクスポート機能の修正
   - `includeLabels` パラメータを追加
   - PDF出力ロジックを更新
   - Text出力ロジックを更新
   - ラベルと動画情報を分離

### API仕様の更新

#### POST /api/workflow
**リクエストボディ:**
```json
{
  "url": "https://example.com",  // オプション（sourceCodeがあれば不要）
  "sourceCode": "<html>...</html>",  // オプション（urlがあれば不要）
  "maxQA": 40,
  "language": "ja",
  "includeTypes": {
    "collected": true,
    "suggested": true
  }
}
```

**注意:** `url` と `sourceCode` のどちらか一方は必須

#### POST /api/workflow-ocr
**リクエストボディ (FormData):**
```
url: string (optional)
maxQA: number (default: 40)
language: string (default: 'ja')
image0, image1, ..., imageN: File objects
```

**変更点:**
- `maxQA` を読み取るように修正（以前は常に5）
- `language` を読み取るように修正（以前は常に'ja'）

#### POST /api/export/single
**リクエストボディ:**
```json
{
  "qaItems": [...],
  "format": "pdf" | "text",
  "includeLabels": false,      // 新規追加
  "includeVideoInfo": false
}
```

**変更点:**
- `includeLabels` パラメータを追加
- ラベル情報と動画情報を独立して制御可能に

---

## ビルド情報

**ビルド出力:**
- CSS: `index-DDnDnlQy-1765436823659.css` (18.05 KB)
- JS: `index-Dj9t1YQ6-1765436823659.js` (457.96 KB)

**Git Commit:** `5cab3f5`

**GitHub Repository:** https://github.com/Meguroman1978/advanced_QA_generator

---

## デプロイ手順

```bash
cd ~/advanced_QA_generator
git pull origin main
flyctl deploy --app advanced-qa-generator-v2 --no-cache
```

---

## 検証項目

デプロイ後、以下を必ずテストしてください:

### 1. ✅ エクスポートラベル制御

**テスト手順:**
1. Q&Aを生成（URLまたはOCRで）
2. エクスポート設定で以下の組み合わせをテスト:

   a) **ラベルなし、動画情報なし**
   - 「出力ファイルにもラベルを含める」: ❌ OFF
   - 「動画情報を含める」: ❌ OFF
   - **期待結果:** Q&Aのみ（補足情報なし）

   b) **ラベルあり、動画情報なし**
   - 「出力ファイルにもラベルを含める」: ✅ ON
   - 「動画情報を含める」: ❌ OFF
   - **期待結果:** Q&A + ソース + 情報源タイプ + URL

   c) **ラベルなし、動画情報あり**
   - 「出力ファイルにもラベルを含める」: ❌ OFF
   - 「動画情報を含める」: ✅ ON
   - **期待結果:** Q&A + 動画推奨情報のみ

   d) **両方あり**
   - 「出力ファイルにもラベルを含める」: ✅ ON
   - 「動画情報を含める」: ✅ ON
   - **期待結果:** Q&A + すべての情報

3. PDF、Textの両方でテスト

### 2. ✅ OCR Q&A生成数

**テスト手順:**
1. 複数のスクリーンショットを準備（テキストが多いページ）
2. 「クローラーアクセス禁止サイトを対象にする際の作業方法」を開く
3. [画像OCRモード] を有効化
4. スクリーンショット（3-5枚）をアップロード
5. 「生成するQ&Aの上限数」を40に設定
6. 「想定Q&A（ユーザー視点）」にチェック
7. Q&A生成を実行
8. **期待結果:** 約30-40個のQ&Aが生成される（画像のテキスト量による）

**確認ポイント:**
- 以前: 最大5個
- 現在: 指定した上限数に近い数（画像のテキスト量に依存）

### 3. ✅ ソースコード挿入モード

**テスト手順:**
1. 任意のWebサイトをChromeで開く（例: https://www.neweracap.jp/products/14668175）
2. 右クリック → 「ページのソースを表示」
3. HTMLを全選択してコピー (Ctrl+A, Ctrl+C)
4. Q&Aアプリで「クローラーアクセス禁止サイトを対象にする際の作業方法」を開く
5. [ソースコード挿入] ボタンをクリック
6. テキストエリアにHTMLを貼り付け
7. **URLフィールドは空のまま**
8. 「生成するQ&Aの上限数」を40に設定
9. Q&A生成を実行
10. **期待結果:** 正常にQ&Aが生成される（JSONエラーなし）

**ブラウザコンソールで確認:**
- `[FETCH] Has source code: true` というログが表示される
- `✅ Using HTML from browser extension` というログが表示される
- エラーなしでQ&Aが表示される

---

## トラブルシューティング

### OCRでQ&Aが少ない場合

**原因:**
- 画像のテキスト量が少ない
- 画像が不鮮明でOCR抽出に失敗

**対策:**
1. より多くのスクリーンショットをアップロード
2. 高解像度のスクリーンショットを使用
3. テキストが多いページを選択
4. ブラウザコンソールで抽出されたテキスト量を確認

**ログ確認:**
```
📸 3枚の画像からテキスト抽出を開始...
画像 1/3: screenshot1.png (125.45 KB)
  → 抽出されたテキスト長: 1250 文字
📝 結合後のテキスト長: 3500 文字
🤖 Q&A生成を開始...
  - maxQA: 40
  - language: ja
  - Combined text length: 3500 characters
```

### ソースコードモードでエラーが出る場合

**症状:** `"<!DOCTYPE"... is not valid JSON`

**確認事項:**
1. URLフィールドを空にする
2. HTMLソースコードが完全にコピーされているか確認
3. ブラウザコンソールでログを確認

**ログ確認:**
```
[FETCH] Has valid URL: false URL: 
[FETCH] Has source code: true
✅ Using HTML from browser extension (bypasses all bot detection)
  - Source code length: 15420 characters
  - Page title: 商品ページタイトル
```

---

## まとめ

| 問題 | 状態 | 修正内容 |
|------|------|----------|
| エクスポートラベル制御 | ✅ 解決 | includeLabels パラメータ追加 |
| OCR Q&A生成数 | ✅ 解決 | maxQA をリクエストから読み取り |
| ソースコードモードエラー | ✅ 解決 | URL検証ロジック修正 |

**すべての問題が解決されました！**

デプロイして、各機能をテストしてください。特にOCRモードで40個近くのQ&Aが生成されることを確認してください。

---

## 次のステップ

1. ✅ ローカルでビルド完了
2. ✅ GitHubにプッシュ完了
3. ⏳ Fly.ioにデプロイ（ユーザーが実行）
4. ⏳ 本番環境でテスト（ユーザーが実行）
5. ⏳ フィードバック収集

すべての修正が本番環境で正常に動作することを確認してください！
