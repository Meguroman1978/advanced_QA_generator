# 🔧 Git分岐問題の解決手順

## 問題

```
hint: You have divergent branches and need to specify how to reconcile them.
fatal: Need to specify how to reconcile divergent branches.
```

ローカルとリモートのブランチが分岐しています。

## ✅ 解決方法（推奨）

以下のコマンドを**順番に**実行してください：

```bash
cd ~/advanced_QA_generator

# 1. ローカルの変更を確認
git status

# 2. ローカルの変更をstash（一時保存）
git stash

# 3. リモートの最新を強制的に取得
git fetch origin

# 4. リモートのmainブランチにリセット
git reset --hard origin/main

# 5. 最新のコードを確認
git pull origin main

# 6. BROWSER_EXTENSIONフォルダの存在を確認
ls -la | grep BROWSER
```

## 📋 期待される結果

最後の `ls -la | grep BROWSER` コマンドで以下が表示されるはずです：

```
drwxr-xr-x   2 nobu_gpt_mac  staff    64 Dec 10 16:14 BROWSER_EXTENSION
-rw-r--r--   1 nobu_gpt_mac  staff  8049 Dec 10 03:22 BROWSER_FETCH_FEATURE.md
```

## 🔍 詳細確認

```bash
# フォルダの内容を確認
ls -la BROWSER_EXTENSION/

# 最新コミットを確認
git log --oneline -5
```

期待される出力：
```
26f642c docs: Add detailed Chrome extension installation guide
4ad1860 docs: Add comprehensive final solution guide for Chrome extension
9efe230 feat: Add Chrome extension for 100% bot detection bypass
...
```

## ⚠️ もし上記で解決しない場合

リポジトリを完全に再クローンしてください：

```bash
# 1. 既存のディレクトリをバックアップ
cd ~
mv advanced_QA_generator advanced_QA_generator_backup

# 2. 新しくクローン
git clone https://github.com/Meguroman1978/advanced_QA_generator.git

# 3. 新しいディレクトリに移動
cd advanced_QA_generator

# 4. フォルダの存在を確認
ls -la BROWSER_EXTENSION/

# 5. ブランチとコミットを確認
git branch
git log --oneline -5
```

## 💡 補足説明

### なぜこの問題が起きたのか？

- ローカルで何らかのコミットまたは変更があった
- リモート（GitHub）でも新しいコミットがプッシュされた
- Gitがどちらを優先すべきか判断できない

### `git reset --hard origin/main` は安全？

- ✅ ローカルの変更を**完全に破棄**してリモートに合わせます
- ⚠️ ローカルの未コミット変更は失われます
- 📝 このケースでは、最新のコードを取得することが目的なので問題ありません

### `git stash` の役割

- 一時的にローカルの変更を退避します
- 必要に応じて `git stash pop` で復元できます
- 今回は `reset --hard` するので stash は不要ですが、念のため実行しています

---

**次のステップ:**

上記のコマンドを実行後、以下を報告してください：

1. `ls -la BROWSER_EXTENSION/` の出力
2. `git log --oneline -5` の出力
3. `git status` の出力

これでBROWSER_EXTENSIONフォルダが確認できるはずです！
