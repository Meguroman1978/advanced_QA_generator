#!/bin/bash
# サーバー起動スクリプト
cd /home/user/webapp

# .envファイルから環境変数を読み込む
if [ -f .env ]; then
    export $(cat .env | xargs)
fi

# サーバーを起動
npm run server
