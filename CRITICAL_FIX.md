# 🚨 CRITICAL FIX: OCRモードボタンが表示されない問題の解決方法

## 問題の原因

**原因特定完了**: デプロイされているビルドが古いファイルを使用しています。

- **現在のデプロイ**: `/assets/index-BFx_29QN.js` (古いビルド)
- **最新のローカルビルド**: `/assets/index-BcoZdj_1-1765418693339.js` (OCRコード含む)

OCRボタンのコードは `src/App.tsx` に**正しく存在**していますが、Fly.ioのキャッシュにより古いビルドが配信されています。

## ✅ 解決手順（必ず以下の順序で実行）

### ステップ1: 最新コードを取得

```bash
cd ~/advanced_QA_generator
git pull origin main
```

### ステップ2: ローカルで最新ビルドを確認

```bash
# キャッシュクリア＋ビルド
rm -rf dist node_modules/.vite
npm run build

# OCRコードが含まれているか確認
ls -la dist/assets/
cat dist/index.html
```

**期待される結果:**
- `dist/assets/` に新しいタイムスタンプ付きファイルが生成される
- `dist/index.html` が新しいJS/CSSファイルを参照している

### ステップ3: Fly.ioへ完全クリーンデプロイ

**重要**: `--no-cache` オプションを使用してDockerビルドキャッシュをクリアします

```bash
# マシンを停止
flyctl machine stop --app advanced-qa-generator --force

# 10秒待機
sleep 10

# 完全クリーンデプロイ（キャッシュなし）
flyctl deploy --app advanced-qa-generator --no-cache --force

# デプロイ状況確認
flyctl status --app advanced-qa-generator
```

**デプロイには5-10分かかります**

### ステップ4: デプロイ完了後の確認

#### 4-1. デプロイされたHTMLを確認

```bash
curl -s https://advanced-qa-generator.fly.dev | head -20
```

**期待される結果:**
```html
<script type="module" crossorigin src="/assets/index-[新しいハッシュ].js"></script>
```

**重要**: `index-BFx_29QN.js` のような古いファイル名**ではなく**、新しいハッシュ値を持つファイル名であることを確認

#### 4-2. ブラウザで確認

1. **完全にキャッシュクリア**:
   ```
   Chrome: Cmd/Ctrl + Shift + Delete
   → 「キャッシュされた画像とファイル」をチェック
   → 「データを消去」
   ```

2. **シークレットモードで開く**:
   ```
   https://advanced-qa-generator.fly.dev
   ```

3. **以下が表示されることを確認**:
   - ✅ 緑色のボックス「🔓 ボット検知を100%回避する方法」
   - ✅ 2つのボタン:
     - `[📝 ソースコード挿入]`
     - `[📷 画像OCRモード]` ← **このボタンが重要！**
   - ✅ テストボタン `[TEST OCR BUTTON]` も表示される（デバッグ用）

## 🔍 トラブルシューティング

### 問題A: デプロイ後もOCRボタンが表示されない

**原因**: ブラウザキャッシュまたはCDNキャッシュ

**解決策**:
```bash
# サーバーログを確認
flyctl logs --app advanced-qa-generator --tail 50

# マシンを再起動
flyctl machine restart --app advanced-qa-generator

# 5分待機してからアクセス
sleep 300
```

### 問題B: `curl` で確認しても古いファイル名が表示される

**原因**: Fly.ioのデプロイが正しく完了していない

**解決策**:
```bash
# マシンを完全削除して再デプロイ
flyctl machine list --app advanced-qa-generator

# 各マシンを削除
flyctl machine destroy [MACHINE_ID] --app advanced-qa-generator --force

# 再デプロイ
flyctl deploy --app advanced-qa-generator --no-cache
```

### 問題C: ビルドエラーが発生する

**原因**: 依存関係の問題

**解決策**:
```bash
# node_modulesを完全削除して再インストール
rm -rf node_modules package-lock.json
npm install
npm run build
```

## 📊 デプロイ成功の確認チェックリスト

- [ ] `curl https://advanced-qa-generator.fly.dev` で新しいJSファイル名が表示される
- [ ] `flyctl status --app advanced-qa-generator` で `Status: running`, `Health Checks: passing` が表示される
- [ ] シークレットモードのブラウザで `[📷 画像OCRモード]` ボタンが表示される
- [ ] `[TEST OCR BUTTON]` も表示される（デバッグ用）
- [ ] OCRボタンをクリックすると青色に変わる
- [ ] 画像アップロードセクションが表示される

## 🎯 次のアクション

上記の手順を実行後、以下を報告してください:

1. **`curl` の出力** (HTMLの `<script>` タグ部分)
2. **`flyctl status` の出力**
3. **ブラウザのスクリーンショット** (シークレットモードで撮影)
   - 緑色のボックス
   - 2つのボタン（ソースコード挿入＋OCRモード）
   - TEST OCR BUTTONの表示

---

## 📝 技術的詳細（参考情報）

### なぜこの問題が発生したか

1. **Viteのビルドハッシュ**: Viteはファイル内容に基づいてハッシュを生成
2. **Dockerビルドキャッシュ**: Fly.ioは過去のビルド結果をキャッシュ
3. **CDNキャッシュ**: ブラウザとFly.ioのエッジがキャッシュを保持

### 今回の修正内容

- `src/App.tsx`: OCRモードボタンのコードが**既に正しく存在**
- `src/test-component.tsx`: デバッグ用テストボタンを追加
- **問題の本質**: デプロイプロセスが新しいビルドを反映していなかった

### 確認済み事項

- ✅ `useImageOCR` ステートは正しく宣言されている
- ✅ OCRボタンのJSXコードは正しく記述されている
- ✅ 条件分岐ロジックも正常
- ✅ ローカルビルドは成功している
- ❌ **Fly.ioのデプロイが古いビルドを使用している** ← 解決すべき点

---

**最新コミット**: `ac156ea` (test: Add test OCR component to debug build issues)
**GitHub**: https://github.com/Meguroman1978/advanced_QA_generator
**最新ビルド日時**: 2025-12-11 02:11:33 UTC
