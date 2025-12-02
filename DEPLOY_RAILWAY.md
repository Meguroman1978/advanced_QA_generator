# 🚂 Railway.app デプロイ手順（Render.com代替）

## Railway.app を選ぶ理由

✅ **タイムアウト制限なし** - 50問、100問でも問題なく生成可能  
✅ **無料で始められる** - $5/月の無料クレジット  
✅ **常時起動** - Render.comのようなスリープなし  
✅ **デプロイ簡単** - GitHubから自動デプロイ  
✅ **ログが見やすい** - デバッグが容易  

---

## 📋 デプロイ手順（5分で完了）

### ステップ1: Railway.app にサインアップ

1. https://railway.app/ にアクセス
2. **「Start a New Project」** をクリック
3. **「Login with GitHub」** でサインイン
4. GitHubアカウントを連携

### ステップ2: プロジェクト作成

1. **「New Project」** をクリック
2. **「Deploy from GitHub repo」** を選択
3. リポジトリを選択: `Meguroman1978/advanced_QA_generator`
4. **「Deploy Now」** をクリック

### ステップ3: 環境変数を設定

1. デプロイされたサービスをクリック
2. **「Variables」** タブを開く
3. **「New Variable」** をクリック
4. 以下を追加:

```
OPENAI_API_KEY=sk-proj-...（あなたのAPIキー）
NODE_ENV=production
PORT=3000
```

5. **「Add」** をクリック

### ステップ4: ビルド設定（重要）

1. **「Settings」** タブを開く
2. **「Build Command」** を設定:
```bash
npm install && npm run build
```

3. **「Start Command」** を設定:
```bash
npm start
```

4. **「Deploy」** をクリックして再デプロイ

### ステップ5: デプロイ完了確認

1. **「Deployments」** タブで進捗確認
2. **「View Logs」** でビルドログ確認
3. デプロイ成功後、URLが表示される
   - 例: `https://advanced-qa-generator-production.up.railway.app`

---

## 🧪 動作確認

### テスト1: ヘルスチェック
```
https://your-app.up.railway.app/api/health
```
→ `{"status":"ok","version":"2.0"}` が返ればOK

### テスト2: 50問生成テスト
1. アプリケーションURLにアクセス
2. URL: `https://en.wikipedia.org/wiki/Artificial_intelligence`
3. Q&A数: **50**
4. 言語: **English**
5. **生成** をクリック
6. **期待結果**: 48-50問生成される ✅

### テスト3: PDFダウンロード
1. Q&A生成後
2. **「PDFダウンロード」** をクリック
3. **期待結果**: PDFがダウンロードされる ✅

---

## 📊 Railwayのログ確認

### ログの見方
1. プロジェクト画面 → サービスをクリック
2. **「View Logs」** タブ
3. リアルタイムでログが表示される

### 確認すべきログ
```
[MODEL SELECTION] maxQA=50, useGPT4=true, model=gpt-4o-mini
[OpenAI] Model: gpt-4o-mini, max_tokens: 7500
[OpenAI] Response: 7234 chars, 7821 tokens used
📊 Parsed 50 Q&A items from response
✅ Response: Generated 50 Q&A items
```

---

## 💰 料金について

### 無料枠
- **$5/月** の無料クレジット
- 約500時間の稼働時間
- 個人プロジェクトには十分

### 使用量の確認
1. ダッシュボード → **「Usage」**
2. 現在の使用量とクレジット残高を確認

### 課金が発生する場合
- 無料クレジット使い切り後
- 従量課金: $0.000463/分（約$0.028/時間）
- 1日24時間稼働: 約$20/月

**💡 Tip**: 開発時以外は停止すれば無料枠で十分

---

## 🔧 トラブルシューティング

### 問題1: ビルドが失敗する

**原因**: 依存関係のインストール失敗

**解決策**:
1. Settings → Build Command を確認
2. `npm install --production=false && npm run build` に変更
3. 再デプロイ

### 問題2: サーバーが起動しない

**原因**: Start Commandが間違っている

**解決策**:
1. Settings → Start Command を確認
2. `npm start` に設定
3. package.jsonの`start`スクリプトが`tsx server.ts`になっているか確認

### 問題3: 環境変数が反映されない

**原因**: 環境変数設定後に再デプロイが必要

**解決策**:
1. Variables → 環境変数を確認
2. Settings → **「Redeploy」** をクリック
3. ログで `API Key configured: true` を確認

### 問題4: まだ50問生成されない

**原因**: 最新のコードがデプロイされていない

**解決策**:
1. GitHubリポジトリで最新コミットを確認（d5c11f8）
2. Railway → Settings → **「Redeploy」**
3. ログで `[MODEL SELECTION]` を確認

---

## 🔄 自動デプロイ設定

### GitHubからの自動デプロイ
1. Settings → **「Source」** セクション
2. **「Watch Paths」** を確認
3. デフォルトで`main`ブランチの変更を自動検知

### 手動デプロイ
1. Settings → **「Redeploy」** ボタン
2. 最新のコミットで再ビルド

---

## 📝 Railway vs Render.com 比較

| 項目 | Railway | Render.com |
|-----|---------|------------|
| **タイムアウト** | なし ✅ | あり ❌ |
| **無料枠** | $5/月 | 750時間/月 |
| **スリープ** | なし ✅ | 15分後 ❌ |
| **起動時間** | 即座 ✅ | 30-60秒 ❌ |
| **ログ** | リアルタイム ✅ | やや遅い |
| **設定の簡単さ** | 簡単 ✅ | 簡単 ✅ |

---

## 🎯 まとめ

Railway.appは以下の点でRender.comより優れています：

1. ✅ **タイムアウトなし** → 50問、100問でも確実に生成
2. ✅ **常時起動** → スリープによる遅延なし
3. ✅ **リアルタイムログ** → 問題の特定が容易
4. ✅ **無料で始められる** → $5クレジットで十分テスト可能

---

## 🚀 次のステップ

1. ✅ Railway.appにサインアップ
2. ✅ GitHubリポジトリを接続
3. ✅ 環境変数（OPENAI_API_KEY）を設定
4. ✅ デプロイ完了を待つ（約2-3分）
5. ✅ 50問生成テストを実施

**GitHubリポジトリ**: https://github.com/Meguroman1978/advanced_QA_generator

**問題が解決しない場合**: Railwayのログ（最新50行）を共有してください。
