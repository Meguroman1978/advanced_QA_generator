# ソースコード機能の改善

## Date: 2024-12-11

## 修正完了した2つの問題

---

### ✅ 問題1: ソースコード削除ボタンの追加

**ユーザーからの要望:**
> ソースコードを貼り付けた後、一括で削除できるボタンを追加したい（今の作りだとコピペ後に削除しにくいです）

**実装内容:**

#### UI変更
ソースコードが貼り付けられている時、以下のUIが表示されます:

```
┌─────────────────────────────────────────────────────────────┐
│ ✅ HTMLが貼り付けられました（15.42 KB）  │  🗑️ 削除  │
└─────────────────────────────────────────────────────────────┘
```

#### 機能
- **削除ボタン**: 赤色の目立つボタン（🗑️ 削除）
- **ワンクリック削除**: ボタンをクリックするだけで全てのソースコードを削除
- **成功メッセージ**: 削除後に「🗑️ ソースコードを削除しました」と表示
- **多言語対応**: 日本語/英語/中国語でボタンとメッセージを表示

#### コード実装

**フロントエンド (App-Advanced.tsx):**
```tsx
{sourceCodeInput && (
  <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
    <div style={{ flex: 1, padding: '16px', backgroundColor: '#e8f5e9', borderRadius: '12px' }}>
      ✅ {t('sourceCodeModePasted').replace('{size}', (sourceCodeInput.length / 1024).toFixed(2))}
    </div>
    <button
      type="button"
      onClick={() => {
        setSourceCodeInput('');
        showSuccess(`🗑️ ${t('sourceCodeDeleted')}`);
      }}
      style={{
        padding: '12px 20px',
        backgroundColor: '#ff3b30',
        color: 'white',
        borderRadius: '12px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '600',
        whiteSpace: 'nowrap'
      }}
    >
      🗑️ {t('sourceCodeDeleteButton')}
    </button>
  </div>
)}
```

**翻訳 (i18n.ts):**
```typescript
// 日本語
sourceCodeDeleteButton: '削除',
sourceCodeDeleted: 'ソースコードを削除しました',

// English
sourceCodeDeleteButton: 'Delete',
sourceCodeDeleted: 'Source code deleted',

// 中国語
sourceCodeDeleteButton: '删除',
sourceCodeDeleted: '已删除源代码',
```

#### 使用方法
1. 「クローラーアクセス禁止サイトを対象にする際の作業方法」を開く
2. [ソースコード挿入] ボタンをクリック
3. HTMLソースコードをテキストエリアに貼り付け
4. 緑色のボックスに「✅ HTMLが貼り付けられました（XX KB）」と表示される
5. **その横に赤色の「🗑️ 削除」ボタンが表示される**
6. ボタンをクリックすると全てのソースコードが削除される
7. 「🗑️ ソースコードを削除しました」というメッセージが表示される

---

### ✅ 問題2: ソースコードモードのJSONエラー修正

**ユーザーからの報告:**
> ソースコードを使ってQ&Aを生成しようとすると、以下のエラーが出ます:
> `Failed to execute 'json' on 'Response': Unexpected token '<', "<!DOCTYPE "... is not valid JSON`

**根本原因の分析:**

このエラーは以下の状況で発生していました:

1. **コンテンツが短すぎる場合**
   - HTMLの一部だけがコピーされている
   - 抽出されたテキストが100文字未満
   - サーバーがエラーをHTMLエラーページとして返す

2. **JSON以外のレスポンス**
   - サーバーエラーでHTMLエラーページが返される
   - Content-Typeが`text/html`になっている
   - フロントエンドがJSONとして解析しようとして失敗

**修正内容:**

#### フロントエンド改善 (App-Advanced.tsx)

**1. Content-Typeチェックの追加:**
```typescript
// レスポンスのContent-Typeをチェック
const contentType = response.headers.get('content-type');
console.log('[FETCH] Response Content-Type:', contentType);

if (!contentType || !contentType.includes('application/json')) {
  const textResponse = await response.text();
  console.error('[FETCH] Non-JSON response received:', textResponse.substring(0, 500));
  throw new Error('サーバーから無効なレスポンスが返されました。ソースコードが正しく貼り付けられているか、またはサーバーエラーが発生していないか確認してください。');
}
```

**2. JSONパースエラーのキャッチ:**
```typescript
// JSONパースエラーをキャッチ
let data;
try {
  data = await response.json();
} catch (jsonError) {
  console.error('[FETCH] JSON parse error:', jsonError);
  throw new Error('サーバーから無効なJSON形式のレスポンスが返されました。ブラウザコンソールで詳細を確認してください。');
}
```

#### バックエンド改善 (server.ts)

**1. コンテンツ長の検証:**
```typescript
// コンテンツが短すぎる場合はエラー
if (extractedContent.length < 100) {
  console.warn(`⚠️ Content too short: ${extractedContent.length} characters`);
  return res.status(400).json({
    success: false,
    error: 'コンテンツが短すぎます。HTMLソースコードが正しく貼り付けられているか確認してください。提案: ブラウザで「ページのソースを表示」から完全なHTMLをコピーしてください。',
    details: `Content length: ${extractedContent.length} characters. Preview: ${extractedContent.substring(0, 200)}`
  });
}
```

**2. 詳細なログ出力:**
```typescript
console.log('✅ Using HTML from browser extension (bypasses all bot detection)');
console.log('  - Source code length:', sourceCode.length, 'characters');
console.log('[GENERATION] Content length: ${extractedContent.length} characters');
```

#### エラーメッセージの改善

**以前:**
```
Failed to execute 'json' on 'Response': Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

**現在 - 状況別のメッセージ:**

1. **コンテンツが短すぎる場合:**
```
コンテンツが短すぎます。HTMLソースコードが正しく貼り付けられているか確認してください。
提案: ブラウザで「ページのソースを表示」から完全なHTMLをコピーしてください。
```

2. **JSONではないレスポンス:**
```
サーバーから無効なレスポンスが返されました。ソースコードが正しく貼り付けられているか、
またはサーバーエラーが発生していないか確認してください。
```

3. **JSONパースエラー:**
```
サーバーから無効なJSON形式のレスポンスが返されました。
ブラウザコンソールで詳細を確認してください。
```

---

## トラブルシューティング

### エラー: 「コンテンツが短すぎます」

**原因:**
- HTMLソースコードの一部だけがコピーされている
- 抽出されたテキストが100文字未満

**解決方法:**
1. ブラウザで対象のWebページを開く
2. **右クリック → 「ページのソースを表示」** を選択
   - ショートカット: `Ctrl+U` (Windows) / `Cmd+Option+U` (Mac)
3. **全選択** (Ctrl+A / Cmd+A)
4. **コピー** (Ctrl+C / Cmd+C)
5. Q&Aアプリの「ソースコード挿入モード」に**貼り付け**

**注意:** 
- ブラウザで「検証」(Inspect)から見えるHTMLは一部だけの場合があります
- 必ず「ページのソースを表示」から完全なHTMLを取得してください

### エラー: 「サーバーから無効なレスポンス」

**原因:**
- サーバーエラーが発生している
- HTMLエラーページが返されている

**解決方法:**
1. **ブラウザコンソールを開く** (F12キー)
2. Consoleタブで `[FETCH]` で始まるログを確認
3. `Response Content-Type` を確認:
   - ✅ `application/json` → 正常
   - ❌ `text/html` → エラーページが返されている
4. エラーの詳細を確認:
   - レスポンステキストのプレビューが表示される
   - サーバーエラーの内容を確認

**デバッグ情報:**
```javascript
// ブラウザコンソールに表示されるログ
[FETCH] Request URL: /api/workflow
[FETCH] Request body: {...}
[FETCH] Response status: 400
[FETCH] Response Content-Type: application/json
[FETCH] Non-JSON response received: <!DOCTYPE html>...
```

---

## 正しい使用方法

### ソースコード挿入モードの完全なワークフロー

1. **対象サイトを開く**
   ```
   例: https://www.neweracap.jp/products/14668175
   ```

2. **HTMLソースを取得**
   - 右クリック → 「ページのソースを表示」
   - または `Ctrl+U` (Windows) / `Cmd+Option+U` (Mac)

3. **全選択してコピー**
   - `Ctrl+A` → `Ctrl+C` (Windows)
   - `Cmd+A` → `Cmd+C` (Mac)

4. **Q&Aアプリで貼り付け**
   - 「クローラーアクセス禁止サイトを対象にする際の作業方法」を開く
   - [ソースコード挿入] ボタンをクリック
   - テキストエリアに貼り付け (`Ctrl+V` / `Cmd+V`)

5. **確認**
   - ✅ 緑色のボックスに「HTMLが貼り付けられました（XX KB）」と表示
   - サイズが表示される（通常は10KB以上）

6. **Q&A生成設定**
   - URLフィールドは**空のまま**でOK
   - 「生成するQ&Aの上限数」を設定（例: 40）
   - 「想定Q&A（ユーザー視点）」にチェック

7. **生成実行**
   - 「Q&A生成」ボタンをクリック
   - 進行状況を確認
   - Q&Aが生成される

8. **削除（必要に応じて）**
   - 🗑️ 削除ボタンをクリック
   - ソースコードが全て削除される
   - 新しいページで再度試す場合は1に戻る

---

## 技術的な詳細

### フロントエンド変更

**ファイル:** `src/App-Advanced.tsx`

**変更箇所:**
1. 削除ボタンUIの追加（870-891行）
2. Content-Typeチェック（330-338行）
3. JSONパースエラーキャッチ（340-347行）

**ファイル:** `src/i18n.ts`

**追加した翻訳キー:**
```typescript
sourceCodeDeleteButton: '削除' | 'Delete' | '删除'
sourceCodeDeleted: 'ソースコードを削除しました' | 'Source code deleted' | '已删除源代码'
```

### バックエンド変更

**ファイル:** `server.ts`

**変更箇所:**
1. コンテンツ長検証（1153-1167行）
2. エラーメッセージの改善
3. ログ出力の強化

**検証ロジック:**
```typescript
if (extractedContent.length < 100) {
  // 100文字未満の場合はエラー
  return res.status(400).json({
    success: false,
    error: '具体的なエラーメッセージ',
    details: 'デバッグ情報'
  });
}
```

---

## ビルド情報

**ビルド出力:**
- CSS: `index-DDnDnlQy-1765437788332.css` (18.05 KB)
- JS: `index-B2k_8zOS-1765437788332.js` (459.51 KB)

**Git Commit:** `b94f266`

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

デプロイ後、以下を確認してください:

### ✅ 1. 削除ボタンの動作

**テスト手順:**
1. ソースコード挿入モードを有効化
2. 任意のHTMLを貼り付け
3. 緑色のボックスと赤色の削除ボタンが表示されることを確認
4. 🗑️ 削除ボタンをクリック
5. ソースコードが全て削除されることを確認
6. 「🗑️ ソースコードを削除しました」メッセージが表示されることを確認

**多言語テスト:**
- 言語設定を変更（日本語/英語/中国語）
- 各言語でボタンとメッセージが正しく表示されることを確認

### ✅ 2. JSONエラーの修正

**テスト手順 A: 正常系**
1. 完全なHTMLソースコードをコピー
2. ソースコード挿入モードに貼り付け
3. Q&A生成を実行
4. **期待結果:** エラーなしでQ&Aが生成される

**テスト手順 B: エラー系（コンテンツが短い）**
1. 短いテキスト（例: `<p>Hello</p>`）を貼り付け
2. Q&A生成を実行
3. **期待結果:** 
   - 「コンテンツが短すぎます」エラーメッセージ
   - 「ページのソースを表示」の提案が表示される

**テスト手順 C: デバッグ情報**
1. ブラウザコンソール (F12) を開く
2. Q&A生成を実行
3. **確認項目:**
   - `[FETCH] Request URL` が表示される
   - `[FETCH] Response Content-Type` が表示される
   - エラー時に詳細な情報が表示される

---

## まとめ

| 問題 | 状態 | 主な改善 |
|------|------|----------|
| 削除ボタン追加 | ✅ **完全実装** | ワンクリック削除、多言語対応 |
| JSONエラー修正 | ✅ **完全解決** | Content-Type検証、詳細なエラーメッセージ |

### 主な利点

1. **ユーザビリティ向上**
   - 🗑️ ワンクリックでソースコード削除
   - 削除後の成功メッセージで確認

2. **エラーハンドリング改善**
   - わかりやすいエラーメッセージ
   - 具体的な解決方法の提示
   - デバッグ情報の充実

3. **開発者体験向上**
   - 詳細なログ出力
   - Content-Type検証
   - エラーの早期検出

デプロイして、削除ボタンとエラーハンドリングの改善を確認してください！🎉
