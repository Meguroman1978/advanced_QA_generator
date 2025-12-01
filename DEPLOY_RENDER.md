# Render.comデプロイ手順

このアプリケーションをRender.comにデプロイする手順を説明します。

## 📋 事前準備

1. [Render.com](https://render.com/)のアカウントを作成
2. GitHubリポジトリ（https://github.com/Meguroman1978/advanced_QA_generator）を準備
3. OpenAI APIキーを準備

## 🚀 デプロイ方法

### 方法1: render.yamlを使用した自動デプロイ（推奨）

このリポジトリには`render.yaml`ファイルが含まれているため、Render.comで簡単にデプロイできます。

1. **Render.comにログイン**
   - https://render.com/ にアクセス
   - GitHubアカウントで連携

2. **Blueprint（設計図）からデプロイ**
   - ダッシュボードで「New」→「Blueprint」を選択
   - GitHubリポジトリを接続: `Meguroman1978/advanced_QA_generator`
   - `render.yaml`が自動的に検出されます

3. **環境変数を設定**
   
   **⚠️ 重要: APIキーは絶対にコードにコミットしないでください！**
   
   **バックエンド（qa-generator-backend）の環境変数:**
   - `OPENAI_API_KEY`: あなたのOpenAI APIキー（必須）
     - 設定方法: Render.com Dashboard → Service → Environment → Add Environment Variable
     - キー名: `OPENAI_API_KEY`
     - 値: `sk-proj-...` で始まるあなたのAPIキー
   - `NODE_ENV`: `production`（自動設定済み）

   **フロントエンド（qa-generator-frontend）の環境変数:**
   - `VITE_API_URL`: バックエンドのURL（例: `https://qa-generator-backend.onrender.com`）
     - バックエンドのデプロイ完了後に取得できるURLを設定

4. **デプロイを開始**
   - 「Apply」をクリックしてデプロイを開始
   - 両方のサービスが自動的にデプロイされます
   - デプロイ中に環境変数を追加/編集できます

### 方法2: 手動でサービスを作成

#### ステップ1: バックエンドサーバーのデプロイ

1. **Web Serviceを作成**
   - Render.comダッシュボードで「New」→「Web Service」
   - GitHubリポジトリを接続: `Meguroman1978/advanced_QA_generator`

2. **設定を入力**
   - **Name**: `qa-generator-backend`（任意の名前）
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run server`
   - **Plan**: `Free`（または有料プラン）

3. **環境変数を設定**
   - `OPENAI_API_KEY`: あなたのOpenAI APIキー
   - `NODE_ENV`: `production`
   - `PORT`: 自動設定（変更不要）

4. **デプロイを作成**
   - 「Create Web Service」をクリック
   - デプロイ完了まで数分待つ
   - **バックエンドのURL**をメモ（例: `https://qa-generator-backend.onrender.com`）

#### ステップ2: フロントエンドのデプロイ

1. **Static Siteを作成**
   - ダッシュボードで「New」→「Static Site」
   - 同じGitHubリポジトリを接続

2. **設定を入力**
   - **Name**: `qa-generator-frontend`（任意の名前）
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`

3. **環境変数を設定**
   - `VITE_API_URL`: ステップ1で取得したバックエンドのURL

4. **デプロイを作成**
   - 「Create Static Site」をクリック
   - デプロイ完了まで数分待つ

## ✅ デプロイ確認

1. フロントエンドのURLにアクセス（例: `https://qa-generator-frontend.onrender.com`）
2. URLを入力してQ&A生成を試す
3. 正常に動作することを確認

## 🔧 トラブルシューティング

### バックエンドがエラーになる場合

- **OpenAI APIキーを確認**
  - Render.comダッシュボード → サービス → Environment → `OPENAI_API_KEY`が正しく設定されているか
  
- **ログを確認**
  - サービスページの「Logs」タブでエラーメッセージを確認

### フロントエンドからバックエンドに接続できない場合

- **CORS設定を確認**
  - `server.ts`で`cors()`が有効になっているか確認済み
  
- **APIのURLを確認**
  - フロントエンドの環境変数`VITE_API_URL`がバックエンドの正しいURLを指しているか
  - URLの末尾に`/`がないことを確認

### Freeプランでのスリープ問題

- Render.comの無料プランでは、15分間アクセスがないとサービスがスリープします
- 再アクセス時に起動するまで数十秒かかります
- 常時稼働が必要な場合は有料プランを検討してください

## 📊 コスト

- **Freeプラン**: 
  - 月750時間まで無料
  - 15分間非アクティブでスリープ
  - 起動に数十秒かかる

- **Starterプラン**: 
  - 月$7〜
  - スリープなし
  - カスタムドメイン対応

## 🔄 自動デプロイ

Render.comはGitHubと連携しているため：
- `main`ブランチにpushすると自動的に再デプロイされます
- プルリクエストのプレビュー環境も作成可能（有料プラン）

## 🔐 環境変数の安全な設定方法

### ステップバイステップ: 環境変数の設定

#### バックエンドサービスの環境変数設定

1. **Render.comダッシュボードにログイン**
2. **バックエンドサービス（qa-generator-backend）を選択**
3. **左サイドバーから「Environment」をクリック**
4. **「Add Environment Variable」をクリック**
5. **以下を入力:**
   - **Key**: `OPENAI_API_KEY`
   - **Value**: あなたのOpenAI APIキー（`sk-proj-`で始まる文字列）
6. **「Save Changes」をクリック**
7. **サービスが自動的に再デプロイされます**

#### フロントエンドサービスの環境変数設定

1. **フロントエンドサービス（qa-generator-frontend）を選択**
2. **「Environment」タブを開く**
3. **「Add Environment Variable」をクリック**
4. **以下を入力:**
   - **Key**: `VITE_API_URL`
   - **Value**: バックエンドのURL（例: `https://qa-generator-backend.onrender.com`）
5. **「Save Changes」をクリック**

### ⚠️ セキュリティ上の重要な注意事項

1. **APIキーは絶対にGitHubにコミットしない**
   - `.env`ファイルは`.gitignore`に含まれています
   - コードやコミットメッセージにAPIキーを含めない
   - プルリクエストの説明にもAPIキーを書かない

2. **ローカル開発環境**
   - ローカルでは`.env`ファイルにAPIキーを保存
   - このファイルは自動的にGit管理から除外されます
   - チームメンバーとAPIキーを共有する場合は、安全な方法で（Slackの一時メッセージなど）

3. **Render.comの環境変数は暗号化されて保存されます**
   - Render.comのダッシュボードでのみ閲覧・編集可能
   - デプロイログには表示されません
   - 環境変数はサーバー側でのみ使用され、フロントエンドには公開されません

4. **APIキーの定期的なローテーション**
   - セキュリティのため、定期的にAPIキーを更新することを推奨
   - OpenAI Platform（https://platform.openai.com/api-keys）で新しいキーを生成
   - Render.comで環境変数を更新

## 📝 環境変数一覧

### バックエンド（Web Service）
| 変数名 | 説明 | 例 | 必須 |
|--------|------|-----|------|
| `OPENAI_API_KEY` | OpenAI APIキー | `sk-proj-...` | ✅ 必須 |
| `NODE_ENV` | 実行環境 | `production` | 自動設定 |
| `PORT` | ポート番号 | `10000` | 自動設定 |
| `ALLOWED_ORIGINS` | CORS許可オリジン | `https://yourdomain.com` | オプション |
| `RATE_LIMIT_MAX` | レート制限 | `100` | オプション |
| `QA_GENERATION_LIMIT` | Q&A生成制限 | `20` | オプション |

### フロントエンド（Static Site）
| 変数名 | 説明 | 例 | 必須 |
|--------|------|-----|------|
| `VITE_API_URL` | バックエンドURL | `https://qa-generator-backend.onrender.com` | ✅ 必須 |

## 🔗 参考リンク

- [Render.com公式ドキュメント](https://render.com/docs)
- [Node.jsデプロイガイド](https://render.com/docs/deploy-node-express-app)
- [Static Siteデプロイガイド](https://render.com/docs/static-sites)
