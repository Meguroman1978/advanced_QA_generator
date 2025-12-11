# OpenAI API Key の安全な設定方法

## 🔐 セキュアな設定（推奨）

API KeyをFly.ioのsecretsに保存することで、GitHubに公開されることなく安全に使用できます。

### ステップ1: Fly.io Secretsに設定

以下のコマンドを実行してください（YOUR_OPENAI_API_KEYを実際のKeyに置き換えてください）：

```bash
flyctl secrets set OPENAI_API_KEY="YOUR_OPENAI_API_KEY" --app advanced-qa-generator-v2
```

**注意**: API Keyは絶対にGitHubにコミットしないでください。

### ステップ2: 設定を確認

```bash
flyctl secrets list --app advanced-qa-generator-v2
```

**期待される出力:**
```
NAME              DIGEST                           UPDATED AT
OPENAI_API_KEY    ******************************** 2025-12-11T...
```

### ステップ3: アプリを再起動

Secretsを設定すると、アプリは自動的に再起動されますが、念のため確認：

```bash
flyctl status --app advanced-qa-generator-v2
```

---

## ✅ 設定完了の確認

1. ブラウザで `https://advanced-qa-generator-v2.fly.dev` を開く
2. URLを入力して「Q&Aを生成」をクリック
3. エラーが出ずにQ&Aが生成されれば成功！

---

## 🔍 トラブルシューティング

### エラー: "OpenAI API key is not configured"

**原因**: Secretsが正しく設定されていない

**解決策**:
```bash
# Secretsを確認
flyctl secrets list --app advanced-qa-generator-v2

# 再設定
flyctl secrets set OPENAI_API_KEY="YOUR_API_KEY" --app advanced-qa-generator-v2

# アプリを再起動
flyctl machine restart --app advanced-qa-generator-v2
```

### API Keyが動作するか確認

```bash
# ログを確認
flyctl logs --app advanced-qa-generator-v2 --tail 50
```

**期待されるログ:**
```
API Key configured: true
```

---

## ⚠️ セキュリティ注意事項

1. **API Keyを直接コードに書かない**: 必ずFly.io Secretsを使用
2. **GitHubにコミットしない**: `.env`ファイルは`.gitignore`に含まれています
3. **定期的に更新**: OpenAIのダッシュボードでKeyをローテーション

---

## 📝 補足情報

### Fly.io Secretsとは

- 環境変数を安全に保存する仕組み
- GitHubに公開されない
- アプリ再起動時に自動的にロードされる
- `process.env.OPENAI_API_KEY`でアクセス可能

### 現在の設定

アプリケーションは以下のコードでAPI Keyを読み込んでいます：

```typescript
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
```

Fly.io Secretsで`OPENAI_API_KEY`を設定すると、自動的に利用可能になります。

---

## 🎯 次のステップ

1. ✅ API Keyを設定（上記コマンド実行）
2. ✅ 新しいデザインをデプロイ
3. ✅ Q&A生成をテスト
4. ✅ 阪急オンラインショップでOCRモードをテスト

すべて完了すれば、誰でも自由に使えるQ&A生成ツールが完成します！
