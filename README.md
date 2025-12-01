# Web Q&A Generator

このアプリケーションは、n8nワークフローをWebアプリとして実装したものです。指定したWebサイトのコンテンツを取得し、OpenAI APIを使用してQ&Aを自動生成します。

## 🚀 機能

このアプリケーションは以下のn8nワークフローを再現します:

1. **Start** (`n8n-nodes-base.manualTrigger`) - ワークフローの開始
2. **HTTP Request** (`n8n-nodes-base.httpRequest`) - 指定されたURLからWebページを取得
3. **HTML Extract** (`n8n-nodes-base.htmlExtract`) - HTMLからテキストコンテンツを抽出
4. **OpenAI** (`@n8n/n8n-nodes-langchain.chainLlm`) - GPT-3.5-turboを使用してQ&Aを生成

### n8nワークフローとの対応

元のn8nワークフローJSON:
- ノード間の接続を自動的に処理
- 各ステップの出力を次のステップの入力として渡す
- エラーハンドリングとリトライ機能

このWebアプリ実装:
- 同じロジックをシーケンシャルに実行
- TypeScriptで型安全に実装
- モダンなWebインターフェース

## 📋 必要要件

- Node.js (v18以上推奨)
- OpenAI API キー

## 🛠️ セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env`ファイルを作成し、OpenAI APIキーを設定します:

```bash
cp .env.example .env
```

`.env`ファイルを編集:

```
OPENAI_API_KEY=your_actual_openai_api_key_here
VITE_API_URL=http://localhost:3001
```

**注意:** 
- `OPENAI_API_KEY`: OpenAI APIキー（必須）
- `VITE_API_URL`: バックエンドAPIのURL（開発環境では`http://localhost:3001`、本番環境では実際のURL）

**重要:** サーバー起動時に環境変数を明示的に設定する必要があります:

```bash
# 方法1: 環境変数を直接指定して起動
OPENAI_API_KEY=your_key npm run server

# 方法2: 起動スクリプトを使用
./start-server.sh
```

## 🎯 使用方法

### クイックスタート

以下のコマンドで一括起動することもできます:

```bash
# ターミナル1でバックエンドを起動
npm run server &

# ターミナル2でフロントエンドを起動  
npm run dev
```

### サーバーとクライアントを別々に起動

#### ターミナル1: バックエンドサーバーを起動

```bash
npm run server
```

サーバーは `http://localhost:3001` で起動します。

#### ターミナル2: フロントエンドを起動

```bash
npm run dev
```

フロントエンドは `http://localhost:5173` で起動します。

### アプリケーションの使用

1. ブラウザで `http://localhost:5173` を開く
2. URL入力欄にWebサイトのURLを入力（デフォルト: https://n8n.io）
3. 「Q&Aを生成する」ボタンをクリック
4. 処理が完了すると、以下が表示されます:
   - 処理したURL
   - 抽出されたコンテンツ（抜粋）
   - 生成されたQ&A

## 📁 プロジェクト構造

```
webapp/
├── src/
│   ├── App.tsx         # メインのReactコンポーネント
│   ├── App.css         # スタイルシート
│   ├── main.tsx        # エントリーポイント
│   └── index.css       # グローバルCSS
├── server.ts           # Expressバックエンドサーバー
├── package.json        # プロジェクト設定
├── .env.example        # 環境変数のテンプレート
└── README.md          # このファイル
```

## 🔧 技術スタック

### フロントエンド
- React 19
- TypeScript
- Vite

### バックエンド
- Node.js
- Express
- TypeScript
- Cheerio (HTMLパース)
- Axios (HTTPリクエスト)
- OpenAI API

## 📝 API エンドポイント

### POST /api/workflow

Webサイトを取得してQ&Aを生成します。

**リクエスト:**
```json
{
  "url": "https://example.com"
}
```

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "url": "https://example.com",
    "extractedContent": "抽出されたテキスト...",
    "qaResult": "生成されたQ&A..."
  }
}
```

### GET /api/health

サーバーのヘルスチェック。

**レスポンス:**
```json
{
  "status": "ok"
}
```

## 🚀 Render.comへのデプロイ

このアプリケーションはRender.comに簡単にデプロイできます！

### クイックデプロイ（推奨）

1. **Render.comにログイン**
   - https://render.com/ にアクセス
   - GitHubアカウントで連携

2. **Blueprintでデプロイ**
   - 「New」→「Blueprint」を選択
   - このリポジトリを選択
   - `render.yaml` が自動検出されます

3. **環境変数を設定**
   - **バックエンド**: `OPENAI_API_KEY` にあなたのAPIキーを設定
   - **フロントエンド**: `VITE_API_URL` にバックエンドのURLを設定

4. **デプロイ完了！**

詳しい手順は **[DEPLOY_RENDER.md](./DEPLOY_RENDER.md)** をご覧ください。

## 🔒 セキュリティ

### API Keyの安全な管理

**重要:** あなたのOpenAI API Keyは安全に保護されています：

✅ **ローカル開発環境:**
1. `.env` ファイルにAPIキーを保存（このファイルは自動的にGit管理から除外されます）
2. API Keyはバックエンドサーバーのみで使用され、ブラウザには送信されません
3. フロントエンドのコードには一切API Keyが含まれません

✅ **本番環境（Render.com）:**
1. APIキーは**Render.comのダッシュボード**で環境変数として設定
2. コードには含まれず、暗号化されて保存されます
3. デプロイログにも表示されません
4. 変更履歴が記録され、いつでも更新可能

⚠️ **絶対にやってはいけないこと:**
- ❌ `.env` ファイルをGitHubにコミットする
- ❌ APIキーをコードにハードコーディングする
- ❌ APIキーをプルリクエストの説明に書く
- ❌ APIキーをコンソールに出力する

詳しくは **[SECURITY.md](./SECURITY.md)** をご覧ください。

### 一般ユーザー向けの使い方

このアプリを他の人に公開する場合、ユーザーは以下の2つの方法でAI使用できます：

**方法1: 自分のAPI Keyを使用（推奨）**
1. アプリでOpenAI APIエラーが表示される
2. 「別のAPI Keyを使用」ボタンをクリック
3. 自分のOpenAI API Keyを入力
4. このKeyはセッション中のみ使用され、保存されません

**方法2: あなたのAPI Keyを使用（レート制限あり）**
- あなたがサーバーにAPI Keyを設定している場合、ユーザーは自動的にそれを使用します
- 悪用を防ぐため、以下の制限があります：
  - 全APIエンドポイント: 100リクエスト/15分/IP
  - Q&A生成: 20回/時間/IP
  - 自分のAPI Keyを使用するユーザーは制限なし

### セキュリティ設定（環境変数）

`.env` ファイルで以下の設定が可能です：

```bash
# CORS設定（特定ドメインのみ許可）
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com

# レート制限の調整
RATE_LIMIT_MAX=100              # 全API: 最大リクエスト/15分
QA_GENERATION_LIMIT=20          # Q&A生成: 最大回数/時間

# 本番環境
NODE_ENV=production
```

### デプロイ時の推奨設定

本番環境にデプロイする際は：

1. **環境変数を安全に設定**
   - Vercel/Netlify/Herokuなどのダッシュボードで設定
   - `.env` ファイルをサーバーにアップロードしない

2. **ALLOWED_ORIGINS を設定**
   - 自分のドメインのみ許可
   - `ALLOWED_ORIGINS=https://yourdomain.com`

3. **NODE_ENV=production に設定**
   - 開発環境での緩いCORS設定を無効化

4. **レート制限を調整**
   - 予算に応じて `QA_GENERATION_LIMIT` を設定

## ⚠️ 注意事項

- OpenAI APIの使用には料金が発生します
- 取得するWebサイトによっては、アクセスが制限されている場合があります
- 大きなWebサイトの場合、処理に時間がかかることがあります
- 抽出されるコンテンツは最大4000文字に制限されています
- **API Keyは絶対に公開リポジトリにコミットしないでください**

## 🐛 トラブルシューティング

### CORSエラーが発生する場合

バックエンドサーバーが起動していることを確認してください。

### OpenAI APIエラーが発生する場合

1. `.env`ファイルにAPIキーが正しく設定されているか確認
2. APIキーが有効で、残高があるか確認
3. サーバーを再起動

## 📄 ライセンス

MIT
