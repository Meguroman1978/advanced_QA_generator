# 🚀 Render.com クイックスタートガイド

このガイドでは、最短5分でRender.comにデプロイする方法を説明します。

## 📋 事前準備

- ✅ OpenAI APIキー（https://platform.openai.com/api-keys から取得）
- ✅ Render.comアカウント（https://render.com/ で無料登録）
- ✅ このリポジトリがGitHubにプッシュされている

## ⚡ 5分でデプロイ

### ステップ1: Render.comにログイン（30秒）

1. https://render.com/ にアクセス
2. 「Sign Up」または「Login」をクリック
3. GitHubアカウントで連携

### ステップ2: Blueprintでデプロイ（1分）

1. ダッシュボードで **「New +」** ボタンをクリック
2. **「Blueprint」** を選択
3. **「Connect a repository」** をクリック
4. リポジトリを検索: `advanced_QA_generator`
5. リポジトリを選択して **「Connect」**

### ステップ3: Blueprint設定を確認（30秒）

Render.comが `render.yaml` を自動検出します：

```yaml
✅ qa-generator-backend (Web Service)
✅ qa-generator-frontend (Static Site)
```

**「Apply」** ボタンをクリック

### ステップ4: 環境変数を設定（2分）

#### バックエンドの環境変数

1. デプロイ中に **「qa-generator-backend」** サービスをクリック
2. 左サイドバーから **「Environment」** をクリック
3. **「Add Environment Variable」** をクリック
4. 以下を入力:
   - **Key**: `OPENAI_API_KEY`
   - **Value**: `sk-proj-...`（あなたのAPIキー）
5. **「Save Changes」** をクリック

#### フロントエンドの環境変数

1. **「qa-generator-frontend」** サービスをクリック
2. 左サイドバーから **「Environment」** をクリック
3. **「Add Environment Variable」** をクリック
4. 以下を入力:
   - **Key**: `VITE_API_URL`
   - **Value**: バックエンドのURL（例: `https://qa-generator-backend.onrender.com`）
   
   💡 **ヒント**: バックエンドのURLは、バックエンドサービスのページ上部に表示されます

5. **「Save Changes」** をクリック

### ステップ5: デプロイ完了を待つ（1分）

両方のサービスがデプロイされるまで待ちます：

```
✅ qa-generator-backend: Live
✅ qa-generator-frontend: Live
```

### ステップ6: アプリにアクセス！（完了）

フロントエンドのURLをクリックしてアプリにアクセス：

```
https://qa-generator-frontend.onrender.com
```

🎉 **完了です！** Q&Aジェネレーターが稼働しています！

## 🔧 デプロイ後の確認

### 動作確認

1. フロントエンドのURLにアクセス
2. URL入力欄に `https://n8n.io` を入力
3. 「Q&Aを生成する」ボタンをクリック
4. Q&Aが生成されることを確認

### エラーが出る場合

#### "API Key is not configured" エラー

**原因**: バックエンドの環境変数が設定されていない

**解決方法**:
1. Render.comダッシュボード → **qa-generator-backend**
2. **Environment** タブ
3. `OPENAI_API_KEY` が正しく設定されているか確認
4. 設定後、サービスが自動的に再デプロイされます

#### フロントエンドからバックエンドに接続できない

**原因**: フロントエンドの環境変数が正しくない

**解決方法**:
1. Render.comダッシュボード → **qa-generator-backend**
2. URLをコピー（例: `https://qa-generator-backend.onrender.com`）
3. **qa-generator-frontend** → **Environment** タブ
4. `VITE_API_URL` にバックエンドのURLを設定（末尾の `/` は不要）
5. 保存して再デプロイを待つ

## 💰 料金について

### 無料プラン（Free Tier）

Render.comの無料プランの特徴：

✅ **メリット:**
- 月750時間まで無料
- 自動HTTPS/SSL証明書
- 継続的デプロイ（GitHubプッシュで自動更新）

⚠️ **制限:**
- 15分間非アクティブでスリープ
- スリープからの起動に30秒〜1分かかる
- 共有IPアドレス

### 有料プラン（Starter: $7/月〜）

✅ **メリット:**
- スリープなし（常時稼働）
- カスタムドメイン対応
- 専用IP
- より高速

## 📊 本番運用のヒント

### 1. OpenAI使用量の監視

https://platform.openai.com/usage で使用量を確認：

- 毎日の使用量をチェック
- 予算アラートを設定
- 異常なスパイクに注意

### 2. レート制限の調整

環境変数で制限を設定：

```bash
# 厳しい制限（推奨 - 無料公開する場合）
QA_GENERATION_LIMIT=5    # 1時間に5回まで
RATE_LIMIT_MAX=50        # 15分に50リクエストまで

# 緩い制限（個人利用や信頼できるユーザー向け）
QA_GENERATION_LIMIT=50
RATE_LIMIT_MAX=200
```

### 3. CORS設定

自分のドメインのみ許可：

```bash
ALLOWED_ORIGINS=https://yourdomain.com
```

### 4. ログの確認

Render.comダッシュボードの **「Logs」** タブで：

- エラーメッセージを確認
- 使用パターンを分析
- 異常なアクティビティを検出

## 🔄 更新とメンテナンス

### コードの更新

GitHubにpushすると自動的に再デプロイされます：

```bash
git add .
git commit -m "Update feature"
git push origin main
```

Render.comが自動的に：
1. 変更を検出
2. ビルドを開始
3. デプロイ
4. サービスを更新

### 環境変数の変更

Render.comダッシュボードで環境変数を変更すると：
- 自動的にサービスが再起動されます
- ダウンタイムは数秒〜1分程度

### APIキーのローテーション

セキュリティのため、定期的にAPIキーを更新：

1. OpenAI Platform で新しいキーを生成
2. Render.com で `OPENAI_API_KEY` を更新
3. 古いキーを削除

## 🆘 トラブルシューティング

### デプロイが失敗する

**ビルドエラー:**
```
Logs → Build Logs を確認
```

**よくある原因:**
- Node.jsのバージョン不一致
- 依存関係のインストール失敗
- 環境変数の設定ミス

### サービスが起動しない

**ランタイムエラー:**
```
Logs → Runtime Logs を確認
```

**よくある原因:**
- `OPENAI_API_KEY` が設定されていない
- ポート設定の問題（`PORT` 環境変数を使用）
- 依存関係の不足

### パフォーマンスが遅い

**無料プランの場合:**
- 15分間非アクティブでスリープ
- 起動に30秒〜1分かかる

**解決方法:**
- 有料プラン（$7/月〜）にアップグレード
- または、定期的にアクセスしてスリープを防ぐ

## 📚 参考リンク

- [詳細なデプロイガイド](./DEPLOY_RENDER.md)
- [セキュリティガイド](./SECURITY.md)
- [Render.com公式ドキュメント](https://render.com/docs)
- [OpenAI APIドキュメント](https://platform.openai.com/docs)

## ✅ チェックリスト

デプロイ前に確認：

- [ ] OpenAI APIキーを取得済み
- [ ] Render.comアカウントを作成済み
- [ ] GitHubリポジトリがプッシュされている
- [ ] `.env` ファイルがGit管理から除外されている
- [ ] `render.yaml` がリポジトリに含まれている

デプロイ後に確認：

- [ ] バックエンドが起動している
- [ ] フロントエンドが起動している
- [ ] 環境変数が正しく設定されている
- [ ] アプリが正常に動作する
- [ ] Q&A生成が成功する

---

🎉 これで完了です！何か問題があれば、[Issues](https://github.com/Meguroman1978/advanced_QA_generator/issues) で質問してください。
