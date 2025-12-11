# 🚀 完全デプロイガイド - Advanced Q&A Generator

## ⚠️ 重要な警告

**現在の状態**: すべての修正がGitHubにプッシュされていますが、**Fly.ioにデプロイされていません**。
そのため、本番環境（https://advanced-qa-generator.fly.dev）では古いコードが動作しており、店舗在庫Q&Aが生成され続けています。

**このガイドに従ってデプロイしてください。**

---

## 📋 前提条件

以下がインストールされていることを確認してください：

1. ✅ **Git**: `git --version`
2. ✅ **Node.js**: `node --version`
3. ✅ **npm**: `npm --version`
4. ✅ **Fly CLI**: `flyctl version`

もしFly CLIがインストールされていない場合：
```bash
curl -L https://fly.io/install.sh | sh
export PATH="$HOME/.fly/bin:$PATH"
```

---

## 🔐 ステップ1: Fly.io認証

```bash
# Fly.ioにログイン
flyctl auth login
```

ブラウザが開くので、Fly.ioアカウントでログインしてください。

**確認**:
```bash
flyctl auth whoami
```

---

## 📥 ステップ2: 最新コードの取得

```bash
# プロジェクトディレクトリに移動
cd ~/advanced_QA_generator

# 最新のコードをGitHubから取得
git pull origin main

# 最新のコミットを確認
git log --oneline -5
```

**期待される出力**:
```
f84d824 docs: Add comprehensive root cause analysis and JSON-LD solution
6751e84 fix: ROOT CAUSE FIX - Use JSON-LD structured data instead of HTML parsing
f2ce5a5 docs: Add emergency fix report for store inventory Q&A issue
```

**重要**: `6751e84` (ROOT CAUSE FIX) のコミットが含まれていることを確認してください。

---

## 🔨 ステップ3: ビルド

```bash
# 依存関係のインストール（念のため）
npm install

# アプリケーションのビルド
npm run build
```

**成功の確認**:
```bash
# ビルドされたファイルを確認
ls -lh server.js dist/index.html

# JSON-LD修正が含まれているか確認
grep "Found Product JSON-LD" server.js
```

**期待される出力**:
```
console.log('✅ Found Product JSON-LD data');
```

---

## 🚀 ステップ4: Fly.ioにデプロイ

### 方法1: スクリプトを使用（推奨）

```bash
./DEPLOY.sh
```

### 方法2: 手動デプロイ

```bash
# --no-cache オプションで強制的に再ビルド
flyctl deploy --no-cache
```

**デプロイ時間**: 約3-5分

**デプロイ中の出力例**:
```
==> Verifying app config
--> Verified app config
==> Building image
...
==> Pushing image to fly
...
==> Monitoring deployment
...
--> v123 deployed successfully
```

---

## ✅ ステップ5: デプロイの確認

### 5.1 デプロイステータスの確認

```bash
flyctl status
```

**期待される出力**:
```
Name   = advanced-qa-generator
Status = running
```

### 5.2 ログの確認

```bash
# リアルタイムログを表示
flyctl logs

# または、最近のログのみ
flyctl logs --no-tail
```

**重要**: ログで以下を確認してください：
```
✅ Found Product JSON-LD data
📦 JSON-LD product info extracted: 450 chars
✅ Using JSON-LD as primary content source
```

---

## 🧪 ステップ6: 機能テスト

### 6.1 ブラウザでアクセス

```
https://advanced-qa-generator.fly.dev
```

### 6.2 テストURL

以下のURLでQ&Aを生成してテストします：
```
https://www.neweracap.jp/products/14668175
```

### 6.3 設定

- **Q&A生成数**: 40個
- **言語**: 日本語

### 6.4 検証項目

生成されたQ&Aをチェック：

#### ❌ NG: 以下の語句を含むQ&Aは**0個**であること
- 店舗
- 在庫
- 確認
- 表示
- 反映
- 遅延
- リアルタイム
- 数分
- 他の店舗

#### ✅ OK: 以下の語句を含むQ&Aが**40個**であること
- 商品名（59FIFTY Dog Ear）
- イヤーフラップ
- ボアフリース
- 面ファスナー
- 着脱
- MLB/NFL/NHL
- サイズ調整
- 約1cm刻み
- 型崩れしにくい
- クラシックなシルエット
- 価格（6,500円）
- ブランド（NEW ERA）

### 6.5 期待されるQ&Aの例

```
Q1: この商品の正式名称は何ですか？
A: 59FIFTY Dog Ear ドッグイヤー ニューヨーク・ヤンキース ネイビーです。

Q2: イヤーフラップにはどんな特徴がありますか？
A: イヤーフラップの内側に毛足の短いボアフリースを配しています。

Q3: イヤーフラップは取り外しできますか？
A: はい、面ファスナーで着脱が可能です。
```

---

## 🔍 トラブルシューティング

### 問題1: デプロイが失敗する

```bash
# キャッシュをクリアして再度デプロイ
flyctl deploy --no-cache --force
```

### 問題2: 古いコードが動作している

```bash
# アプリを再起動
flyctl apps restart advanced-qa-generator

# 数分待ってから再度テスト
```

### 問題3: 依然として店舗在庫Q&Aが生成される

```bash
# ログで実際に抽出されているコンテンツを確認
flyctl logs | grep "FULL EXTRACTED CONTENT" -A 20

# JSON-LDが抽出されているか確認
flyctl logs | grep "Found Product JSON-LD"
```

**期待されるログ**:
```
✅ Found Product JSON-LD data
📦 JSON-LD product info extracted: 450 chars
✅ Using JSON-LD as primary content source
```

もしこれらのログが表示されない場合、デプロイが正しく完了していません。

---

## 📊 デプロイ完了チェックリスト

デプロイ後、以下を確認してください：

- [ ] `flyctl status` でアプリが `running` 状態
- [ ] `flyctl logs` で `Found Product JSON-LD data` が表示される
- [ ] `https://www.neweracap.jp/products/14668175` で40個のQ&Aを生成
- [ ] 生成されたQ&Aに「店舗」「在庫」が含まれない
- [ ] 生成されたQ&Aが商品固有の内容（素材、サイズ、価格、デザイン）

---

## 📞 サポート

問題が解決しない場合、以下の情報を提供してください：

1. `flyctl status` の出力
2. `flyctl logs --no-tail` の最新100行
3. 生成されたQ&Aのスクリーンショット
4. ブラウザのコンソールログ（F12）

---

## 🎉 成功！

すべてのチェックリストが完了したら、修正は完全に適用されています。

**期待される結果**:
- 店舗在庫Q&A: 100% → **0%**
- 商品固有Q&A: 0% → **100%**

お疲れさまでした！ 🎊
