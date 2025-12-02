# Fly.io デプロイガイド

## 🚀 完全無料・スリープなし・大量処理対応

### なぜFly.ioが最適なのか

| 項目 | Fly.io | Render.com | Railway |
|------|--------|------------|---------|
| **無料プラン** | ✅ 3 VM無料 | ✅ あり | ❌ $5トライアル |
| **スリープ** | ❌ なし | ⚠️ 15分後 | ⚠️ あり |
| **タイムアウト** | ❌ なし | ⚠️ あり | ⚠️ あり |
| **RAM** | 256MB（無料） | 512MB | 512MB |
| **リージョン** | ✅ 東京 | Singapore | Asia |
| **大量処理** | ✅ 対応 | ⚠️ 制限あり | ⚠️ 制限あり |
| **Dockerfile** | ✅ そのまま | ✅ そのまま | ❌ 問題あり |

### 📋 デプロイ手順

#### 1️⃣ Fly.io CLIをインストール

**Mac/Linux:**
```bash
curl -L https://fly.io/install.sh | sh
```

**Windows (PowerShell):**
```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

#### 2️⃣ ログイン/サインアップ

```bash
flyctl auth signup
# または既存アカウント
flyctl auth login
```

⚠️ **クレジットカード登録が必要ですが、無料枠内なら課金されません**

#### 3️⃣ アプリを作成

```bash
cd /path/to/advanced_QA_generator
flyctl launch
```

以下のように質問されます：

```
? Choose an app name: qa-generator
? Choose a region: Tokyo, Japan (nrt)
? Would you like to set up a PostgreSQL database? No
? Would you like to set up an Upstash Redis database? No
```

#### 4️⃣ 環境変数を設定

```bash
flyctl secrets set OPENAI_API_KEY=sk-proj-xxxxx
flyctl secrets set NODE_ENV=production
```

#### 5️⃣ デプロイ

```bash
flyctl deploy
```

約5-10分でデプロイ完了！

#### 6️⃣ アプリにアクセス

```bash
flyctl open
```

または:
```
https://qa-generator.fly.dev
```

---

### ✅ デプロイ後の確認

#### ヘルスチェック
```bash
curl https://qa-generator.fly.dev/api/health
```

#### ログを確認
```bash
flyctl logs
```

#### アプリ情報
```bash
flyctl status
```

---

### 🔧 便利なコマンド

#### アプリを再起動
```bash
flyctl apps restart qa-generator
```

#### スケールアップ（有料）
```bash
flyctl scale memory 512  # RAMを512MBに
flyctl scale count 2     # インスタンスを2つに
```

#### SSHで接続
```bash
flyctl ssh console
```

#### 環境変数を確認
```bash
flyctl secrets list
```

---

### 💰 コスト

#### 無料枠（永久）
- **3つのVMまで無料**（shared-cpu-1x, 256MB RAM）
- **160GB転送量/月**
- **3GB永続ストレージ**

#### 無料枠を超えると
- VM: $0.0000022/秒 ≈ $5.70/月
- 転送量: $0.02/GB

**実質無料**: 個人利用なら無料枠内で十分！

---

### 🎯 最適化のヒント

#### 1. RAMを増やす（有料）
```bash
flyctl scale memory 512
```
→ 大量Q&A生成（100問以上）に対応

#### 2. 自動スケーリング
```toml
[http_service]
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1
```

#### 3. ログを確認
```bash
flyctl logs -a qa-generator
```

---

### 🔥 トラブルシューティング

#### デプロイが失敗する
```bash
flyctl logs
```
→ エラー詳細を確認

#### メモリ不足
```bash
flyctl scale memory 512
```
→ RAMを増やす（有料）

#### アプリが起動しない
```bash
flyctl ssh console
node server.js
```
→ 手動でサーバーを起動してエラー確認

---

### 🌟 まとめ

**Fly.ioの利点**:
1. ✅ **完全無料**（3 VMまで）
2. ✅ **スリープなし**（24時間稼働）
3. ✅ **タイムアウトなし**（大量処理OK）
4. ✅ **東京リージョン**（低レイテンシ）
5. ✅ **Dockerfileそのまま**（設定不要）
6. ✅ **簡単デプロイ**（5分で完了）

**Fly.ioは大量処理に最適です！**

---

**公式ドキュメント**: https://fly.io/docs/  
**GitHubリポジトリ**: https://github.com/Meguroman1978/advanced_QA_generator
