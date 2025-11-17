# Web Q&A Generator

このアプリケーションは、n8nワークフローをWebアプリとして実装したものです。指定したWebサイトのコンテンツを取得し、OpenAI APIを使用してQ&Aを自動生成します。

## 🚀 機能

このアプリケーションは以下のn8nワークフローを再現します:

1. **Start** - ワークフローの開始
2. **HTTP Request** - 指定されたURLからWebページを取得
3. **HTML Extract** - HTMLからテキストコンテンツを抽出
4. **OpenAI** - GPT-3.5-turboを使用してQ&Aを生成

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
```

## 🎯 使用方法

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

## ⚠️ 注意事項

- OpenAI APIの使用には料金が発生します
- 取得するWebサイトによっては、アクセスが制限されている場合があります
- 大きなWebサイトの場合、処理に時間がかかることがあります
- 抽出されるコンテンツは最大4000文字に制限されています

## 🐛 トラブルシューティング

### CORSエラーが発生する場合

バックエンドサーバーが起動していることを確認してください。

### OpenAI APIエラーが発生する場合

1. `.env`ファイルにAPIキーが正しく設定されているか確認
2. APIキーが有効で、残高があるか確認
3. サーバーを再起動

## 📄 ライセンス

MIT
