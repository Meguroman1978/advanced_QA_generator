# Render.com 簡単デプロイガイド

## 🚀 5分でデプロイ完了！

### 前提条件
- GitHubアカウント
- OpenAI APIキー

### デプロイ手順

#### 1️⃣ Render.comにサインアップ
1. https://render.com/ にアクセス
2. 「Get Started」をクリック
3. 「GitHub」でサインイン

#### 2️⃣ 新しいWebサービスを作成
1. ダッシュボードで「New +」→「Web Service」
2. 「Connect a repository」
3. `Meguroman1978/advanced_QA_generator` を検索して選択
4. 「Connect」をクリック

#### 3️⃣ サービス設定
```
Name: qa-generator
Region: Singapore
Branch: main
Runtime: Docker (自動検出されます)
Instance Type: Free
```

#### 4️⃣ 環境変数を設定
「Advanced」を展開して、環境変数を追加：

```
OPENAI_API_KEY = sk-proj-xxxxx（あなたのAPIキー）
NODE_ENV = production
```

**重要**: `OPENAI_API_KEY`は必須です！

#### 5️⃣ デプロイ開始
「Create Web Service」をクリック

### ✅ デプロイ完了後

デプロイが完了すると、URLが表示されます：
```
https://qa-generator-xxxx.onrender.com
```

#### テスト

1. **ヘルスチェック**
   ```
   https://qa-generator-xxxx.onrender.com/api/health
   ```
   → `{"status":"ok","version":"2.0"}`

2. **Q&A生成テスト**
   - ブラウザでURLにアクセス
   - URL入力: `https://ja.wikipedia.org/wiki/人工知能`
   - 質問数: 50
   - 言語: 日本語
   - 「Q&A生成開始」をクリック

### 📝 注意事項

#### Freeプランの制限
- **15分アイドル後にスリープ**
  - 初回アクセス時に30-60秒かかる場合があります
  - アクセス後は通常速度で動作
- **750時間/月の稼働時間**（実質無制限）
- **帯域幅**: 100GB/月

#### スリープ対策（オプション）
定期的にアクセスしてスリープを防ぐ：
- https://uptimerobot.com/ で5分ごとにヘルスチェック（無料）

### 🔧 トラブルシューティング

#### デプロイが失敗する
→ Logsタブで詳細を確認
→ `OPENAI_API_KEY`が設定されているか確認

#### Q&Aが2問しか生成されない
→ OpenAI APIキーが正しいか確認
→ OpenAIアカウントに残高があるか確認

#### PDFダウンロードが失敗する
→ ブラウザのコンソール（F12）でエラーを確認
→ サーバーログで詳細を確認

### 💰 コスト

- **Render.com**: 完全無料（Freeプラン）
- **OpenAI API**: 従量課金
  - 50問生成: 約$0.01-0.02
  - 1000問生成: 約$0.20-0.40

### 🔄 自動再デプロイ

GitHubの`main`ブランチにpushすると、自動的に再デプロイされます！

---

**サポート**: https://render.com/docs
**GitHubリポジトリ**: https://github.com/Meguroman1978/advanced_QA_generator
