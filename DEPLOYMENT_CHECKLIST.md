# 🚀 デプロイチェックリスト

## ❌ 問題: GenSpark Crawlerが呼ばれていない

### 確認すべき項目

#### **1. 最新コードをデプロイしたか？**

以下のコマンドを**順番に**実行してください：

```bash
# ステップ1: 最新コードを取得
cd ~/advanced_QA_generator
git pull origin main

# ステップ2: 最新コミットを確認
git log --oneline -5
```

**期待される出力:**
```
6804ab0 fix: Ensure error diagnostics are always displayed for zero Q&A results
18ce522 docs: Add comprehensive GenSpark Crawler integration guide
e0b556a feat: Integrate GenSpark Crawler as ultimate fallback for blocked sites
```

`e0b556a` (GenSpark Crawler統合) が含まれているか確認してください。

```bash
# ステップ3: Fly.ioにデプロイ（必須）
flyctl deploy --app advanced-qa-generator --no-cache
```

⚠️ **`--no-cache` は絶対に必要です**

```bash
# ステップ4: デプロイ完了を確認
flyctl status --app advanced-qa-generator
```

**期待される出力:**
```
Status
  Name     = advanced-qa-generator          
  Owner    = personal                       
  Hostname = advanced-qa-generator.fly.dev  
  ...
  Status = deployed
```

---

#### **2. デプロイログを確認**

```bash
flyctl logs --app advanced-qa-generator | tail -100
```

以下を探してください：
- `Server starting on port 3001`
- エラーメッセージがないか

---

#### **3. GenSpark Crawlerコードが含まれているか確認**

```bash
# ローカルでビルドされたserver.jsを確認
cd ~/advanced_QA_generator
grep -c "GenSpark Crawler" dist-server/server.js
```

**期待される出力:** `5` 以上（複数箇所にGenSpark Crawlerの文字列が存在）

**もし `0` なら:**
- ビルドが失敗している
- 再度ビルド: `npm run build`

---

#### **4. 実際にFly.ioで動作しているコードを確認**

```bash
# Fly.ioアプリのシェルに接続
flyctl ssh console --app advanced-qa-generator
```

シェル内で:
```bash
# server.jsにGenSpark Crawlerが含まれているか確認
grep -c "GenSpark Crawler" /app/dist-server/server.js
exit
```

**もし `0` なら:**
- 古いコードがデプロイされている
- 再デプロイ必須

---

## 🔍 デバッグ手順

### **手順1: ローカルでテスト**

```bash
cd ~/advanced_QA_generator

# サーバー起動
npm start
```

別のターミナルで:
```bash
# テストリクエスト送信
curl -X POST http://localhost:3001/api/workflow \
  -H "Content-Type: application/json" \
  -d '{"url": "https://web.hh-online.jp/hankyu-beauty/goods/index.html?ggcd=B2470245&wid=99947307794445801", "maxQA": 3, "language": "ja"}'
```

**サーバーコンソールで確認すべきログ:**
```
🌐 Fetching website: https://web.hh-online.jp/...
📡 Attempt 1/3 to fetch...
⚠️ Content contains "403 Forbidden" or blocking message.
🔄 Trying Playwright...
❌ Playwright failed
🚀 Trying GenSpark Crawler...                    ← これが表示されるべき
🌐 [GenSpark Crawler] Attempting to fetch: ...  ← これが表示されるべき
```

**もしGenSpark Crawlerのログが表示されないなら:**
- コードに問題がある
- フォールバックロジックが実行されていない

---

### **手順2: Fly.ioのリアルタイムログを確認**

```bash
flyctl logs --app advanced-qa-generator --follow
```

ブラウザで https://advanced-qa-generator.fly.dev にアクセスし、Q&A生成を実行。

**期待されるログ:**
```
🌐 Fetching website: ...
⚠️ Content contains "403 Forbidden"
🔄 Trying Playwright...
❌ Playwright failed
🚀 Trying GenSpark Crawler...    ← 最重要
```

---

## 🚨 緊急対応

### **GenSpark Crawlerが全く呼ばれない場合**

#### **原因1: デプロイしていない**
**解決策:**
```bash
cd ~/advanced_QA_generator
git pull origin main
flyctl deploy --app advanced-qa-generator --no-cache
```

#### **原因2: ビルドエラー**
**確認:**
```bash
npm run build
```

エラーが表示されたら、その内容を報告してください。

#### **原因3: Playwrightが成功している**
**確認:**
Fly.ioのログで:
```
✅ Playwright succeeded
```

が表示されていないか確認。もし表示されていたら、GenSpark Crawlerは呼ばれません（意図通り）。

#### **原因4: フォールバックロジックが実行されない**
**確認:**
ログで以下が表示されているか:
```
⚠️ Content contains "403 Forbidden"
```

表示されていない場合、403検出ロジックに問題があります。

---

## ✅ 確認チェックリスト

以下をすべて確認してください：

- [ ] `git pull origin main` を実行した
- [ ] `git log` で `e0b556a` (GenSpark Crawler統合) が含まれている
- [ ] `flyctl deploy --no-cache` を実行した
- [ ] `flyctl status` で `Status = deployed` が表示される
- [ ] ローカルで `npm run build` が成功する
- [ ] `grep "GenSpark Crawler" dist-server/server.js` でヒットする
- [ ] Fly.ioで Q&A生成を試した
- [ ] `flyctl logs --follow` でリアルタイムログを確認した

---

## 📝 報告テンプレート

以下の情報を報告してください：

**1. デプロイ状況:**
```bash
git log --oneline -5
# 出力をコピー
```

**2. Fly.ioステータス:**
```bash
flyctl status --app advanced-qa-generator
# 出力をコピー
```

**3. ビルド確認:**
```bash
grep -c "GenSpark Crawler" dist-server/server.js
# 出力をコピー（数値）
```

**4. Fly.ioログ（最新50行）:**
```bash
flyctl logs --app advanced-qa-generator | tail -50
# 出力をコピー
```

**5. ブラウザコンソールログ:**
- F12 → Console タブ
- `🔍 DIAGNOSTICS CHECK` 周辺のログをコピー

---

**重要:** まず `flyctl deploy --no-cache` を実行してください！
