# 🚀 Render.comへの簡単デプロイガイド

## 最新の修正内容

### ✅ 完了した修正（2つのコミット）

#### 1️⃣ **言語とQ&A数の問題を修正** (コミット: 694000b)
- **問題**: 80問設定で2問のみ、しかも英語で返ってくる
- **修正内容**:
  - パラメータ解析の強化（明示的な型変換）
  - OpenAIプロンプトの大幅強化（日本語/英語/中文の厳格化）
  - システムメッセージ追加で言語を強制
  - `max_tokens`の計算式改善: `maxQA * 120 + 1500`
- **テスト結果**: 10問、30問、60問全てで成功（日本語/英語両対応）

#### 2️⃣ **Render.com本番環境対応** (コミット: da19b2e)
- **問題**: tsx/TypeScriptがdevDependenciesで本番で使えない
- **修正内容**:
  - `tsx`と`typescript`を`dependencies`に移動
  - 全ての`@types/*`を`dependencies`に移動
  - `render.yaml`に`NPM_CONFIG_PRODUCTION=false`追加
  - Port型エラー修正（parseInt使用）
- **効果**: Render.comで完全動作可能

---

## 📋 Render.comデプロイ手順（5分で完了）

### ステップ1: Render.comにアクセス
1. https://render.com/ にアクセス
2. GitHubアカウントでサインイン/ログイン

### ステップ2: Blueprintからデプロイ
1. ダッシュボードで **「New」** → **「Blueprint」** をクリック
2. **「Connect a repository」** で以下を接続:
   ```
   Meguroman1978/advanced_QA_generator
   ```
3. `render.yaml`が自動検出されます ✅
4. **「Apply」** をクリック

### ステップ3: 環境変数を設定（最重要！）

デプロイ開始後、以下の環境変数を設定します：

#### 🔑 バックエンドサービス: `advanced-qa-generator`

1. サービスページで **「Environment」** タブを開く
2. **「Add Environment Variable」** をクリック
3. 以下を入力:
   - **Key**: `OPENAI_API_KEY`
   - **Value**: あなたのOpenAI APIキー（`sk-proj-...`で始まる）
4. **「Save Changes」** をクリック
5. サービスが自動的に再デプロイされます（数分）

### ステップ4: デプロイ完了を確認

1. デプロイログで **「Deploy succeeded」** を確認
2. サービスURLにアクセス（例: `https://advanced-qa-generator.onrender.com`）
3. アプリケーションが開くことを確認

---

## 🧪 動作テスト

デプロイ完了後、以下をテストしてください：

### テスト1: 10問を日本語で生成
1. URL: `https://ja.wikipedia.org/wiki/人工知能`
2. Q&A数: `10`
3. 言語: `日本語`
4. **期待結果**: 10問の日本語Q&Aが生成される ✅

### テスト2: 80問を日本語で生成
1. URL: `https://ja.wikipedia.org/wiki/日本`
2. Q&A数: `80`
3. 言語: `日本語`
4. **期待結果**: 80問（またはそれに近い数）の日本語Q&Aが生成される ✅

### テスト3: 英語で生成
1. URL: `https://en.wikipedia.org/wiki/Artificial_intelligence`
2. Q&A数: `20`
3. 言語: `English`
4. **期待結果**: 20問の英語Q&Aが生成される ✅

---

## 🔍 トラブルシューティング

### 問題1: 「Application error」と表示される

**原因**: 環境変数`OPENAI_API_KEY`が設定されていない

**解決策**:
1. Render.comダッシュボード → サービス選択
2. 「Environment」タブ
3. `OPENAI_API_KEY`を追加
4. 「Save Changes」をクリック

### 問題2: デプロイが失敗する

**原因**: ビルドエラー

**解決策**:
1. サービスページの「Logs」タブを確認
2. エラーメッセージをコピー
3. 以下を確認:
   - `npm install`が成功しているか
   - `npm run build`が成功しているか
   - TypeScriptコンパイルエラーがないか

### 問題3: まだ2問しか返ってこない

**原因**: 古いコードがデプロイされている可能性

**解決策**:
1. GitHubリポジトリで最新コミットを確認:
   - `694000b` (言語とQ&A数の修正)
   - `da19b2e` (Render.com対応)
2. Render.comで「Manual Deploy」→「Deploy latest commit」
3. キャッシュをクリア: 「Settings」→「Clear build cache & deploy」

### 問題4: Freeプランでスリープする

**原因**: Render.com無料プランは15分間非アクティブでスリープ

**解決策**:
- 再アクセス時に起動まで30-60秒待つ
- または、UptimeRobotなどで定期的にアクセス
- または、有料プラン（月$7〜）にアップグレード

---

## 📊 デプロイ後の確認事項

### ✅ チェックリスト

- [ ] アプリケーションURLにアクセスできる
- [ ] フロントエンドが正しく表示される
- [ ] 10問の日本語Q&Aが生成できる
- [ ] 30問以上の日本語Q&Aが生成できる
- [ ] 英語でもQ&Aが生成できる
- [ ] 動画推奨ラベルが表示される（一部のQ&A）
- [ ] PDFエクスポートが動作する

---

## 🔗 重要なリンク

- **GitHubリポジトリ**: https://github.com/Meguroman1978/advanced_QA_generator
- **Render.com**: https://render.com/
- **OpenAI Platform**: https://platform.openai.com/api-keys

---

## 💡 よくある質問

### Q: デプロイにどのくらい時間がかかりますか？
**A**: 初回デプロイは5-10分、再デプロイは3-5分程度です。

### Q: 無料プランで十分ですか？
**A**: テスト用途や個人利用なら無料プランで十分です。商用利用や常時稼働が必要な場合は有料プラン（月$7〜）を推奨します。

### Q: APIキーはどこで取得できますか？
**A**: OpenAI Platform (https://platform.openai.com/api-keys) で作成できます。クレジットカード登録が必要です。

### Q: 環境変数は安全ですか？
**A**: はい。Render.comの環境変数は暗号化されて保存され、コードやログには表示されません。

### Q: GitHubにpushすると自動デプロイされますか？
**A**: はい。`main`ブランチへのpushで自動的に再デプロイされます（約3-5分）。

---

## 🎉 デプロイ成功！

デプロイが成功したら、以下を確認してください：

1. ✅ アプリケーションが正常に動作
2. ✅ 80問の日本語Q&Aが正しく生成される
3. ✅ 言語指定が正しく機能する
4. ✅ 動画推奨ラベルが表示される

**問題が解決しない場合は、サービスページの「Logs」タブで詳細なエラーログを確認してください。**
