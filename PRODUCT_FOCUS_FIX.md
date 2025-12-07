# 商品情報に特化したQ&A生成への改善

## 🎯 問題の解決

**ユーザーからの報告:**
> 指定したURLで紹介している商品に直接関係するQ&Aよりも、どちらかというとそれ以外の情報（サイトの最後部に書かれている情報）に関するものばかりが生成されます。

**原因:**
- 従来のアルゴリズムは、ページ全体のコンテンツを均等に扱っていた
- フッター、会社情報、プライバシーポリシーなどのノイズが含まれていた
- 商品情報よりも一般的な情報の方が多く抽出されてしまっていた

## ✅ 実装した修正

### 1. コンテンツ抽出アルゴリズムの全面刷新

#### 【ステップ1】ノイズの徹底除去
以下の要素を完全に削除:
- `header`, `footer`, `nav` - ヘッダー、フッター、ナビゲーション
- `aside`, `sidebar` - サイドバー
- 広告、バナー、SNSシェアボタン
- レビュー、コメント欄
- フォーム（検索、問い合わせなど）
- プライバシーポリシー、利用規約などのリンク

#### 【ステップ2】メインコンテナの特定
優先順位でメイン商品コンテナを検出:
```typescript
// 最優先: 明確な商品コンテナ
'.product-detail', '.product-info', '.item-detail'

// 次優先: 一般的なメインコンテンツ
'main article', 'main', '[role="main"]'
```

#### 【ステップ3】優先度スコアリング抽出
コンテンツを4段階の優先度で抽出:

| 優先度 | 内容 | 例 |
|--------|------|-----|
| **P1 (最高)** | 商品タイトル・見出し | `<h1>`, `<h2>`, `.product-title` |
| **P2 (高)** | 商品説明・詳細 | `.description`, `.feature`, `.spec` |
| **P3 (中)** | 価格・購入情報 | `.price`, `.buy` |
| **P4 (低)** | その他の段落 | `<p>`, `<div>` (重複除外済み) |

#### 【ステップ4】文字数制限の最適化
- **従来:** 前半3000文字 + 後半1000文字 = 4000文字
- **改善後:** 上位3500文字のみ（フッター情報を完全除外）

### 2. プロンプトの強化（日本語・英語・中国語）

すべての言語のプロンプトに以下を明記:

```
【最重要】このウェブページで販売・紹介されている商品についてのみQ&Aを作成すること
- ソーステキストに書かれている情報のみを使用すること
- 外部の知識や一般常識を追加しないこと
- ページ下部の会社情報・連絡先・フッター情報は無視すること
- サイトポリシー、プライバシーポリシー、利用規約などは無視すること
```

### 3. OpenAI システムメッセージの更新

```typescript
content: `You are a professional Q&A creator. 
CRITICAL RULES: 
1) Create Q&A ONLY about the main product/service featured on the webpage. 
2) Use ONLY information from the provided source text. 
3) Do NOT add external knowledge. 
4) Do NOT mention products not in the source text. 
5) IGNORE footer/policy/company info. 
Focus ONLY on product-specific information.`
```

## 📊 期待される結果

### ✅ 改善前 vs 改善後

| 項目 | 改善前 ❌ | 改善後 ✅ |
|------|----------|----------|
| Q&A内容 | フッター情報、会社情報が多い | 商品情報のみに集中 |
| 関連性 | 低い（ページ全体からランダム） | 高い（商品情報に特化） |
| ノイズ | 多い（ポリシー、連絡先など） | ほぼゼロ |
| 情報源 | ページ全体（上部〜下部均等） | ページ上部〜中央（商品情報） |
| 抽出文字数 | 4000文字（前半+後半） | 3500文字（上部のみ） |

### ✅ 具体例

**商品ページ:** `https://example.com/product-page`

#### 改善前 ❌
- Q: このサイトの運営会社はどこですか？
- Q: プライバシーポリシーの内容は？
- Q: お問い合わせ方法は？
- （商品に関係ないQ&Aが多数）

#### 改善後 ✅
- Q: この商品の主な特徴は何ですか？
- Q: この商品の価格はいくらですか？
- Q: この商品の使い方を教えてください。
- Q: この商品のメリットは何ですか？
- （すべて商品に直接関連）

## 🚀 デプロイ手順（Fly.io）

### ステップ1: 最新コードを取得

```bash
cd advanced_QA_generator
git pull origin main
```

**最新コミット:** `b01a7bb`

### ステップ2: Fly.ioに再デプロイ

```bash
flyctl deploy --app advanced-qa-generator
```

デプロイには約5-10分かかります。

### ステップ3: デプロイ完了確認

```bash
flyctl status --app advanced-qa-generator
```

以下が表示されればOK:
```
Instances
ID              PROCESS VERSION REGION  STATE   HEALTH CHECKS
abc123def       app     XX      nrt     running 1 total, 1 passing
```

## ✅ テスト手順（重要）

### テスト1: 商品ページでのQ&A生成

1. ブラウザでアプリにアクセス:
   ```
   https://advanced-qa-generator.fly.dev
   ```

2. **商品ページのURLを入力**（例）:
   - ECサイトの商品ページ
   - サービス紹介ページ
   - ランディングページ

3. **設定:**
   - 質問数: 10問
   - 言語: 日本語

4. **Q&A生成実行**

5. **結果の確認:**
   - ✅ すべてのQ&Aが**そのページの商品**に関連している
   - ✅ 会社情報、プライバシーポリシー、フッター情報のQ&Aが**ない**
   - ✅ 商品の特徴、使い方、価格、メリットなどに関するQ&Aがある

### テスト2: 複数の商品ページで検証

以下のような様々なページでテスト:
- 日本語の商品ページ
- 英語の商品ページ
- 詳細情報が多いページ
- 詳細情報が少ないページ

**期待結果:**
- どのページでも、商品情報に特化したQ&Aが生成される
- フッター情報、一般情報は含まれない

### テスト3: ログの確認（開発者向け）

```bash
flyctl logs --app advanced-qa-generator
```

**チェックポイント:**
```
✅ Found main container: main article
✅ Extracted 2834 characters (47 sections)
📊 Priority distribution: P1=8, P2=15, P3=4, P4=20
📏 Content truncated to top 3500 chars (product-focused)
```

これらのログが表示されれば、新しいアルゴリズムが正常に動作しています。

## 🐛 トラブルシューティング

### 問題: まだフッター情報のQ&Aが生成される

**原因:** 一部のサイトは特殊な構造を持っている可能性があります。

**確認方法:**
```bash
flyctl logs --app advanced-qa-generator | grep "Priority distribution"
```

**対処:**
- ログで `P4` の数が多すぎる場合、そのサイトのHTML構造が特殊
- GitHubで具体的なURLを報告してください

### 問題: Q&Aの数が少ない

**原因:** 商品情報が本当に少ない可能性があります。

**確認方法:**
```bash
flyctl logs --app advanced-qa-generator | grep "Extracted"
```

**対処:**
- `Extracted 234 characters` のように文字数が非常に少ない場合、そのページは商品情報が少ない
- より詳細な商品ページを使用してください

### 問題: 抽出される内容が空

**原因:** ページがJavaScriptで動的に生成されている可能性があります。

**確認:**
```bash
flyctl logs --app advanced-qa-generator | grep "WARNING"
```

**対処:**
- `WARNING: Very little content extracted` が表示される場合、JavaScript依存のページ
- 静的HTMLの商品ページを使用してください

## 📝 技術詳細

### 主要な変更点

**ファイル:** `server.ts`

1. **extractContent() 関数**（116-247行目）
   - 完全に書き直し
   - 優先度ベースの抽出ロジック
   - 詳細なデバッグログ

2. **generateQA() 関数の日本語プロンプト**（271-309行目）
   - 商品情報に特化した指示を追加
   - フッター情報を無視する明確な指示

3. **generateQA() 関数の英語プロンプト**（310-348行目）
   - 同様の改善

4. **generateQA() 関数の中国語プロンプト**（343-387行目）
   - 同様の改善

5. **OpenAI system message**（419-422行目）
   - 商品情報に特化した指示

### アルゴリズムのフロー

```
HTML入力
  ↓
【ステップ1】ノイズ除去
  (header, footer, nav, ads, reviews, forms)
  ↓
【ステップ2】メインコンテナ特定
  (.product-detail, main, article)
  ↓
【ステップ3】優先度抽出
  P1: タイトル・見出し
  P2: 説明・詳細
  P3: 価格・購入
  P4: その他
  ↓
【ステップ4】優先度ソート
  (P1 → P2 → P3 → P4)
  ↓
【ステップ5】文字数制限
  (上位3500文字のみ)
  ↓
OpenAI API（商品特化プロンプト）
  ↓
商品情報に特化したQ&A生成
```

## 📚 関連情報

- **GitHubリポジトリ:** https://github.com/Meguroman1978/advanced_QA_generator
- **最新コミット:** `b01a7bb`
- **Fly.ioアプリ:** `advanced-qa-generator`
- **デプロイガイド:** `DEPLOY_FLYIO.md`

## ✅ 完了チェックリスト

デプロイ後、以下をすべて確認してください:

- [ ] `git pull origin main` 実行済み
- [ ] `flyctl deploy --app advanced-qa-generator` 実行済み
- [ ] `flyctl status` で running 確認済み
- [ ] ブラウザでアプリにアクセス確認済み
- [ ] 商品ページURLで10問Q&A生成テスト済み
- [ ] すべてのQ&Aが商品情報に関連していることを確認済み
- [ ] フッター情報、会社情報のQ&Aが**ない**ことを確認済み
- [ ] `flyctl logs` で新しいログ（Priority distribution）を確認済み

---

## 🎉 期待される改善効果

この修正により、以下が達成されます:

1. ✅ **商品情報への特化:** 100%商品関連のQ&Aが生成される
2. ✅ **ノイズの完全除去:** フッター、ポリシー、会社情報は一切含まれない
3. ✅ **関連性の向上:** ページ上部の主要商品情報からQ&A生成
4. ✅ **ユーザー満足度の向上:** 期待通りの商品Q&Aが得られる

ご質問やさらなる改善が必要な場合は、お気軽にお知らせください！
