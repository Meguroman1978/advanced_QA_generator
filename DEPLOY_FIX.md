# 🔧 Fly.io デプロイタイムアウトの解決方法

## 問題

```
Error: failed to update machine 185e279c550798: failed to update VM 185e279c550798: 
request returned non-2xx status: 504: upstream request timeout
```

Fly.ioのマシンが応答せず、デプロイが失敗しています。

---

## ✅ 解決方法

### 方法1: 既存マシンを停止して再デプロイ（推奨）

```bash
cd ~/advanced_QA_generator

# 1. 現在のマシン状態を確認
flyctl status --app advanced-qa-generator

# 2. すべてのマシンを停止
flyctl machine stop --app advanced-qa-generator --force

# 3. 少し待つ（5秒）
sleep 5

# 4. 再度デプロイ
flyctl deploy --app advanced-qa-generator --no-cache
```

---

### 方法2: 問題のあるマシンを削除して再作成

```bash
cd ~/advanced_QA_generator

# 1. マシン一覧を確認
flyctl machine list --app advanced-qa-generator

# 2. 問題のあるマシンを削除（エラーに表示されたID）
flyctl machine destroy 185e279c550798 --app advanced-qa-generator --force

# 3. もう一つのマシンも削除（念のため）
flyctl machine destroy d89440b6d42478 --app advanced-qa-generator --force

# 4. 再デプロイ（新しいマシンが自動作成される）
flyctl deploy --app advanced-qa-generator --no-cache
```

---

### 方法3: アプリを再起動

```bash
cd ~/advanced_QA_generator

# 1. アプリを完全に停止
flyctl apps restart advanced-qa-generator

# 2. 30秒待つ
sleep 30

# 3. 再デプロイ
flyctl deploy --app advanced-qa-generator --no-cache
```

---

### 方法4: リージョンを変更（最終手段）

現在のリージョンで問題が続く場合、別のリージョンに変更します：

```bash
cd ~/advanced_QA_generator

# 1. 現在のリージョンを確認
flyctl regions list --app advanced-qa-generator

# 2. リージョンを変更（例: シンガポール）
flyctl regions set sin --app advanced-qa-generator

# 3. または香港
flyctl regions set hkg --app advanced-qa-generator

# 4. 再デプロイ
flyctl deploy --app advanced-qa-generator --no-cache
```

---

## 🔍 デプロイ状況の確認

### ステップ1: マシンの状態を確認

```bash
flyctl machine list --app advanced-qa-generator
```

**期待される出力（成功時）:**
```
ID            	NAME  	STATE  	REGION	HEALTH CHECKS
185e279c550798	      	started	nrt   	passing
d89440b6d42478	      	started	nrt   	passing
```

**問題がある場合:**
```
ID            	NAME  	STATE  	REGION	HEALTH CHECKS
185e279c550798	      	stopped	nrt   	-
d89440b6d42478	      	stopped	nrt   	-
```

### ステップ2: アプリの状態を確認

```bash
flyctl status --app advanced-qa-generator
```

### ステップ3: ログを確認

```bash
flyctl logs --app advanced-qa-generator --tail 50
```

---

## 📋 推奨される完全な手順

以下を**順番に**実行してください：

```bash
cd ~/advanced_QA_generator

# 1. 最新コードを確認
git pull origin main
git log --oneline -3

# 2. 現在の状態を確認
flyctl status --app advanced-qa-generator

# 3. すべてのマシンを強制停止
flyctl machine stop --app advanced-qa-generator --force

# 4. 10秒待機
sleep 10

# 5. マシン一覧を確認（すべてstoppedになっているはず）
flyctl machine list --app advanced-qa-generator

# 6. 再デプロイ
flyctl deploy --app advanced-qa-generator --no-cache

# 7. デプロイ完了後、状態を確認
flyctl status --app advanced-qa-generator

# 8. ログを確認
flyctl logs --app advanced-qa-generator --tail 20
```

---

## ⚠️ タイムアウトが続く場合

### オプションA: scale memoryを増やす

```bash
flyctl scale memory 1024 --app advanced-qa-generator
flyctl deploy --app advanced-qa-generator --no-cache
```

### オプションB: マシンを完全に削除して再作成

```bash
# すべてのマシンを削除
flyctl machine list --app advanced-qa-generator
flyctl machine destroy [MACHINE_ID_1] --app advanced-qa-generator --force
flyctl machine destroy [MACHINE_ID_2] --app advanced-qa-generator --force

# 再デプロイ（新しいマシンが自動作成）
flyctl deploy --app advanced-qa-generator --no-cache
```

### オプションC: アプリを完全に再作成（最終手段）

```bash
# アプリを削除
flyctl apps destroy advanced-qa-generator --yes

# 再作成してデプロイ
flyctl launch --app advanced-qa-generator --region nrt
```

---

## ✅ デプロイ成功の確認

デプロイが成功すると：

```
✓ [1/2] Machine d89440b6d42478 updated successfully
✓ [2/2] Machine 185e279c550798 updated successfully

Visit your app at https://advanced-qa-generator.fly.dev
```

### Webサイトで確認

https://advanced-qa-generator.fly.dev を開いて、以下を確認：

1. ✅ ページが正常に読み込まれる
2. ✅ 緑色のボックスが表示される（「🔓 ボット検知を100%回避する方法」）
3. ✅ 「拡張機能からHTMLを読み込む」ボタンが表示される

---

## 💡 なぜこのエラーが起きるのか？

- **504 Timeout**: Fly.ioのマシンが応答しない
- **原因**: 
  - マシンがスタック状態
  - メモリ不足
  - ヘルスチェック失敗
  - リージョンの一時的な問題

**解決策**: マシンを停止/削除して、クリーンな状態から再デプロイ

---

上記の手順を実行して、以下を報告してください：

1. どの方法を試したか（方法1〜4）
2. `flyctl status` の出力
3. `flyctl machine list` の出力
4. デプロイが成功したか
5. https://advanced-qa-generator.fly.dev が正常に表示されるか

頑張ってください！ 🚀
