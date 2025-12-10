# Chrome拡張機能インストールガイド

## 📍 フォルダの場所を確認

まず、ターミナルで以下のコマンドを実行してフォルダの存在を確認してください：

```bash
cd ~/advanced_QA_generator
ls -la | grep BROWSER_EXTENSION
```

**期待される出力:**
```
drwxr-xr-x  2 user user 4096 Dec 10 16:14 BROWSER_EXTENSION
```

もし何も表示されない場合は、最新のコードを取得してください：

```bash
cd ~/advanced_QA_generator
git pull origin main
ls -la BROWSER_EXTENSION/
```

## 🔍 フォルダの内容を確認

```bash
cd ~/advanced_QA_generator/BROWSER_EXTENSION
ls -la
```

**期待されるファイル:**
```
manifest.json          # 拡張機能の設定ファイル
popup.html            # ポップアップのUI
popup.js              # HTML抽出ロジック
README.md             # 詳細な説明
icon-placeholder.txt  # アイコン作成ガイド
```

## 📦 Chromeへのインストール手順

### 方法1: ターミナルから直接パスをコピー

1. ターミナルで以下を実行してフルパスを取得：
   ```bash
   cd ~/advanced_QA_generator/BROWSER_EXTENSION
   pwd
   ```
   
   出力例: `/Users/your-name/advanced_QA_generator/BROWSER_EXTENSION`

2. このパスをコピーしておきます

### 方法2: Finderで確認（Mac）

1. ターミナルで以下を実行：
   ```bash
   cd ~/advanced_QA_generator
   open .
   ```

2. Finderで `BROWSER_EXTENSION` フォルダが表示されます

### 方法3: エクスプローラーで確認（Windows）

1. PowerShellまたはコマンドプロンプトで：
   ```cmd
   cd %USERPROFILE%\advanced_QA_generator
   explorer .
   ```

2. エクスプローラーで `BROWSER_EXTENSION` フォルダが表示されます

## 🚀 Chrome拡張機能の読み込み

1. **Chromeを開く**

2. **拡張機能管理ページを開く**
   - アドレスバーに `chrome://extensions/` と入力してEnter
   - または、メニュー → その他のツール → 拡張機能

3. **デベロッパーモードを有効化**
   - 右上の「デベロッパーモード」トグルをON

4. **拡張機能を読み込む**
   - 「パッケージ化されていない拡張機能を読み込む」ボタンをクリック
   - ファイル選択ダイアログが開きます

5. **フォルダを選択**
   - `BROWSER_EXTENSION` フォルダを選択
   - （フォルダの中のファイルではなく、フォルダ自体を選択）

6. **読み込み完了**
   - 拡張機能リストに「Q&A Generator - HTML Extractor」が表示されます
   - ツールバーにアイコンが追加されます（デフォルトアイコン）

## ⚠️ よくあるエラーと解決方法

### エラー1: "Manifest file is missing or unreadable"

**原因:** フォルダ内に `manifest.json` がない

**解決方法:**
```bash
cd ~/advanced_QA_generator/BROWSER_EXTENSION
ls -la manifest.json
```
ファイルが存在することを確認。なければ：
```bash
cd ~/advanced_QA_generator
git pull origin main --force
```

### エラー2: フォルダが見つからない

**原因:** リポジトリが最新でない

**解決方法:**
```bash
cd ~/advanced_QA_generator
git fetch origin
git reset --hard origin/main
git pull origin main
```

### エラー3: アイコンのエラー

**原因:** アイコンファイル（icon16.png等）が存在しない

**解決方法:** これは警告のみで、機能には影響しません。デフォルトアイコンが使用されます。

もしアイコンを追加したい場合：
1. 16x16、48x48、128x128 のPNG画像を作成
2. `BROWSER_EXTENSION` フォルダに `icon16.png`, `icon48.png`, `icon128.png` として配置

## ✅ インストール確認

拡張機能が正しくインストールされているか確認：

1. `chrome://extensions/` を開く
2. 「Q&A Generator - HTML Extractor」が表示されている
3. 「有効」になっている
4. ツールバーにアイコンが表示されている

## 📱 使い方

1. **テスト用ページを開く**
   ```
   https://web.hh-online.jp/hankyu-beauty/goods/index.html?ggcd=B2470245&wid=99947307794445801
   ```

2. **拡張機能アイコンをクリック**
   - ツールバーのアイコンをクリック
   - ポップアップが開きます

3. **HTMLを抽出**
   - 「このページのHTMLを抽出」ボタンをクリック
   - 成功メッセージが表示されます

4. **Q&A Generatorで使用**
   - 「Q&A Generator を開く」ボタンをクリック
   - 新しいタブで https://advanced-qa-generator.fly.dev が開きます
   - 緑色のボックス内の「拡張機能からHTMLを読み込む」ボタンをクリック
   - Q&A生成を実行

## 🔧 トラブルシューティング

### ブラウザコンソールでのデバッグ

拡張機能のポップアップで問題が発生した場合：

1. `chrome://extensions/` を開く
2. Q&A Generator拡張機能の「詳細」をクリック
3. 「バックグラウンド ページ」または「Service Worker」のリンクをクリック
4. デベロッパーツールでエラーを確認

### ストレージの確認

拡張機能がHTMLを正しく保存しているか確認：

```javascript
// ブラウザのコンソールで実行
chrome.storage.local.get(['extractedHTML', 'extractedURL'], (data) => {
  console.log('Extracted HTML length:', data.extractedHTML?.length);
  console.log('Extracted URL:', data.extractedURL);
});
```

## 📞 サポート

問題が解決しない場合は、以下の情報を含めて報告してください：

1. 実行したコマンドと出力
2. Chromeのバージョン (`chrome://version/`)
3. エラーメッセージのスクリーンショット
4. ブラウザコンソールのログ

---

**最終更新**: 2025-12-10
**コミット**: `4ad1860`
**リポジトリ**: https://github.com/Meguroman1978/advanced_QA_generator
