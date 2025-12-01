# セキュリティポリシー

## 🔐 API Keyの安全性について

### あなたのAPI Keyは安全です

このアプリケーションは、以下のセキュリティ対策を実装しています：

#### ✅ 実装されている保護機能

1. **`.env` ファイルの保護**
   - `.gitignore` に含まれており、Gitで追跡されません
   - GitHubリポジトリにプッシュされることはありません
   - `.env.example` のみがコミットされ、実際のKeyは含まれません

2. **バックエンドでのみ使用**
   - API Keyはサーバーサイド（`server-advanced.ts`, `server/qaGenerator.ts`）でのみ使用
   - フロントエンド（ブラウザ）には一切送信されません
   - JavaScriptコードに埋め込まれることはありません

3. **CORS制限**
   - 許可されたオリジンからのリクエストのみ受け付け
   - `ALLOWED_ORIGINS` 環境変数で制御可能

4. **レート制限**
   - IPアドレスベースの制限で悪用を防止
   - 一般ユーザー: 20回/時間（Q&A生成）
   - 自分のAPI Keyを持つユーザー: 制限なし

5. **一時API Key機能**
   - ユーザーが自分のAPI Keyを使用可能
   - セッション中のみ有効で、サーバーに保存されません

---

## 🚨 絶対にやってはいけないこと

### ❌ `.env` ファイルをコミットしない

```bash
# これは絶対にしないでください！
git add .env
git commit -m "Add environment variables"  # ❌ 危険！
git push
```

もし誤ってコミットしてしまった場合：

1. **すぐにAPI Keyを無効化**
   - https://platform.openai.com/api-keys にアクセス
   - 該当のKeyを削除
   - 新しいKeyを生成

2. **Gitの履歴からも削除**
   ```bash
   # BFG Repo-Cleanerを使用（推奨）
   brew install bfg  # macOS
   bfg --delete-files .env
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   git push --force
   ```

### ❌ コードにハードコーディングしない

```typescript
// ❌ 絶対にこうしない
const apiKey = "sk-proj-xxxxxxxxxxxxx";

// ✅ 正しい方法
const apiKey = process.env.OPENAI_API_KEY;
```

### ❌ ブラウザのコンソールに出力しない

```typescript
// ❌ 危険！
console.log("API Key:", process.env.OPENAI_API_KEY);

// ✅ 安全
console.log("API Key configured:", !!process.env.OPENAI_API_KEY);
```

---

## 🛡️ セキュリティ設定

### 開発環境

```bash
# .env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx
VITE_API_URL=http://localhost:3001
NODE_ENV=development
RATE_LIMIT_MAX=100
QA_GENERATION_LIMIT=20
```

### 本番環境（Render.com）

**⚠️ 重要: APIキーは絶対にコードにコミットせず、Render.comのダッシュボードで設定してください**

#### Render.comでの安全な環境変数設定方法

1. **Render.comダッシュボードにログイン**
2. **サービスを選択**（例: qa-generator-backend）
3. **左サイドバーから「Environment」をクリック**
4. **「Add Environment Variable」ボタンをクリック**
5. **以下の環境変数を設定:**

```bash
# バックエンドサービスの環境変数
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxx  # あなたのOpenAI APIキー
NODE_ENV=production
ALLOWED_ORIGINS=https://your-frontend.onrender.com
RATE_LIMIT_MAX=50
QA_GENERATION_LIMIT=10
```

```bash
# フロントエンドサービスの環境変数
VITE_API_URL=https://qa-generator-backend.onrender.com  # バックエンドのURL
```

#### Render.comでのセキュリティ機能

- ✅ 環境変数は暗号化されて保存されます
- ✅ ダッシュボードでのみ閲覧・編集可能
- ✅ デプロイログには表示されません（`***`で隠されます）
- ✅ チームメンバーとの共有時も安全
- ✅ 環境変数の変更履歴が記録されます

---

## 📊 セキュリティチェックリスト

デプロイ前に確認してください：

- [ ] `.env` ファイルが `.gitignore` に含まれている
- [ ] `.env` ファイルがGit履歴に含まれていない
- [ ] API Keyがコードにハードコーディングされていない
- [ ] 本番環境で `NODE_ENV=production` が設定されている
- [ ] `ALLOWED_ORIGINS` が自分のドメインに制限されている
- [ ] レート制限が適切に設定されている
- [ ] ログにAPI Keyが出力されていない

確認コマンド：

```bash
# .envがGitで追跡されていないか確認
git ls-files | grep .env
# → 何も表示されなければOK（.env.exampleのみならOK）

# Git履歴に.envが含まれていないか確認
git log --all --full-history -- .env
# → 何も表示されなければOK

# コード内にAPI Keyがハードコーディングされていないか確認
grep -r "sk-proj-" src/ server/ --exclude-dir=node_modules
# → 何も表示されなければOK
```

---

## 🌍 他のユーザーへの公開

### オプション1: ユーザーが自分のAPI Keyを使用（推奨）

**メリット:**
- あなたの費用負担なし
- セキュリティリスクなし
- ユーザーが自分の使用量を管理

**実装:**
- すでに実装済み
- OpenAI APIエラーが出ると、自動的にAPI Key入力画面が表示されます

### オプション2: あなたのAPI Keyを共有（レート制限あり）

**メリット:**
- ユーザーはAPI Keyを用意する必要がない
- すぐに使い始められる

**デメリット:**
- あなたのOpenAI費用が増加
- 悪用されるリスク

**対策:**
- レート制限を厳しく設定
  ```bash
  QA_GENERATION_LIMIT=5  # 1時間に5回まで
  ```
- ユーザー登録機能を追加（将来の拡張）
- 費用アラートを設定（OpenAIダッシュボード）

### オプション3: 認証機能を追加

より高度なセキュリティが必要な場合：

1. **ユーザー認証**
   - Auth0、Firebase Auth、Clerk などを使用
   - ログインしたユーザーのみアクセス可能

2. **ユーザーごとの使用量制限**
   - データベースで使用履歴を記録
   - ユーザーごとに月次制限を設定

3. **決済機能**
   - Stripe などで使用量に応じた課金
   - サブスクリプションプラン

---

## 🔍 セキュリティ監視

### OpenAI ダッシュボードで監視

1. https://platform.openai.com/usage にアクセス
2. 使用量を確認
3. 異常なスパイクがないかチェック
4. 予算アラートを設定

### ログの確認

```bash
# サーバーログで異常なアクティビティを確認
tail -f /tmp/server.log | grep "API"

# レート制限に引っかかったIPを確認
tail -f /tmp/server.log | grep "Too many"
```

---

## 🆘 セキュリティインシデント対応

### API Keyが漏洩した疑いがある場合

1. **即座にKeyを無効化**
   - https://platform.openai.com/api-keys
   - 該当のKeyを削除

2. **新しいKeyを生成**
   - 新しいKeyを作成
   - サーバーの環境変数を更新
   - サーバーを再起動

3. **使用履歴を確認**
   - OpenAIダッシュボードで異常な使用がないか確認
   - 不正な使用があれば、OpenAIサポートに連絡

4. **Git履歴をクリーンアップ**（該当する場合）
   - 上記の「絶対にやってはいけないこと」セクションを参照

---

## 📞 サポート

セキュリティに関する質問や懸念がある場合：

1. このリポジトリのIssuesを作成
2. メンテナに直接連絡
3. OpenAIサポート: https://help.openai.com/

---

## 📝 更新履歴

- **2025-11-18**: 初版作成
  - API Key保護の説明追加
  - セキュリティチェックリスト追加
  - インシデント対応手順追加
