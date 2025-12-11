# 🔧 Fly.io ポート設定の修正完了

## ✅ 問題の解決

以下のエラーを修正しました：

```
[PR03] could not find a good candidate within 1 attempts at load balancing. 
last error: [PC01] instance refused connection. is your app listening on 0.0.0.0:80? 
make sure it is not only listening on 127.0.0.1
```

## 🔍 原因

1. **ポート不一致**: `fly.toml` が `internal_port = 80` を指定していたが、アプリは `PORT=3001` または `PORT=8080` で起動していた
2. **設定の不整合**: Fly.ioのプロキシがポート80で接続を試みていたが、アプリがリッスンしていなかった

## ✅ 修正内容

### 1. `fly.toml` の更新

```toml
app = 'advanced-qa-generator-v2'
primary_region = 'nrt'

[env]
  PORT = "8080"  # ← 環境変数でポート指定

[http_service]
  internal_port = 8080  # ← 80から8080に変更
  force_https = true
  auto_stop_machines = 'stop'
  auto_start_machines = true
  min_machines_running = 0

[[services.ports]]
  port = 80
  handlers = ["http"]
  
[[services.ports]]
  port = 443
  handlers = ["tls", "http"]

[http_service.http_options]
  response_timeout = 300
  idle_timeout = 300
```

### 2. `server.ts` の確認

```typescript
// Fly.io uses PORT=8080 internally, fallback to 3001 for local development
const port = parseInt(process.env.PORT || '3001', 10);

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server is running on http://0.0.0.0:${port}`);
  console.log(`✅ Listening on all interfaces (0.0.0.0:${port})`);
  console.log(`🚀 Ready to accept connections from Fly.io proxy`);
});
```

**重要ポイント**:
- `'0.0.0.0'` でバインド（すべてのネットワークインターフェースで接続を受け付ける）
- `process.env.PORT` を優先的に使用（Fly.ioが自動設定）
- ローカル開発では `3001` にフォールバック

## 📋 デプロイ手順

### ステップ1: 最新コードを取得

```bash
cd ~/advanced_QA_generator
git pull origin main
```

### ステップ2: Fly.ioにデプロイ

```bash
# 既存のマシンを停止（新しいプロジェクトの場合は不要）
flyctl machine stop --app advanced-qa-generator-v2 --force

# デプロイ実行
flyctl deploy --app advanced-qa-generator-v2 --no-cache

# ステータス確認
flyctl status --app advanced-qa-generator-v2
```

### ステップ3: ログで確認

```bash
flyctl logs --app advanced-qa-generator-v2 --tail 50
```

**期待されるログ出力**:
```
✅ Server is running on http://0.0.0.0:8080
✅ Listening on all interfaces (0.0.0.0:8080)
🚀 Ready to accept connections from Fly.io proxy
```

### ステップ4: 動作確認

```bash
# デプロイ完了後、URLにアクセス
curl -I https://advanced-qa-generator-v2.fly.dev
```

**期待される結果**: HTTP 200 OK

ブラウザで確認:
```
https://advanced-qa-generator-v2.fly.dev
```

## 🔍 トラブルシューティング

### 問題A: "instance refused connection" が継続

**原因**: アプリが起動していない、またはクラッシュしている

**解決策**:
```bash
# ログを確認
flyctl logs --app advanced-qa-generator-v2 --tail 100

# マシンを再起動
flyctl machine restart --app advanced-qa-generator-v2

# ビルドログを確認
flyctl logs --app advanced-qa-generator-v2 | grep -i "error"
```

### 問題B: "listening on 127.0.0.1" エラー

**原因**: サーバーが `127.0.0.1`（ローカルホストのみ）でリッスンしている

**確認**: `server.ts` の `app.listen()` が `'0.0.0.0'` を指定しているか確認
```typescript
app.listen(port, '0.0.0.0', () => { ... });
```

### 問題C: ポート環境変数が反映されない

**確認**:
```bash
# 環境変数を確認
flyctl ssh console --app advanced-qa-generator-v2 -C "echo \$PORT"
```

**期待される出力**: `8080`

## 📊 設定の整合性チェックリスト

- [ ] `fly.toml`: `internal_port = 8080`
- [ ] `fly.toml`: `[env] PORT = "8080"`
- [ ] `server.ts`: `app.listen(port, '0.0.0.0', ...)`
- [ ] `server.ts`: `process.env.PORT` を優先的に使用
- [ ] デプロイログで "Listening on all interfaces (0.0.0.0:8080)" が確認できる
- [ ] `flyctl status` で `Health Checks: passing` が表示される
- [ ] ブラウザで `https://advanced-qa-generator-v2.fly.dev` にアクセスできる

## 🎯 次のアクション

1. **git pull** で最新コードを取得
2. **flyctl deploy** で新しいプロジェクトにデプロイ
3. **flyctl logs** でログ確認
4. **ブラウザ**で動作確認
5. **OCRモードボタン**が表示されることを確認

---

**最新コミット**: `142a43a` (fix: Configure port 8080 for Fly.io deployment and improve logging)
**GitHub**: https://github.com/Meguroman1978/advanced_QA_generator
**デプロイ先**: https://advanced-qa-generator-v2.fly.dev
