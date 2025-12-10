# 🚨 緊急修正手順

## 現状の問題
1. GenSpark Crawlerが呼ばれない
2. エラー診断が表示されない
3. Q&A生成数が0

## 根本原因の特定

デプロイされていない可能性が高い。
または、ビルドされたコードに問題がある。

## 確認コマンド
flyctl releases list --app advanced-qa-generator
