#!/bin/bash

echo "=== GenSpark Crawler Integration Test ==="
echo ""
echo "Testing if GenSpark Crawler is being called..."
echo ""

# 阪急URLでテストリクエストを送信
TEST_URL="https://web.hh-online.jp/hankyu-beauty/goods/index.html?ggcd=B2470245&wid=99947307794445801"

echo "1. Sending test request to local server..."
echo "   URL: $TEST_URL"
echo ""

# ローカルサーバーが起動しているかチェック
if ! curl -s http://localhost:3001/api/workflow > /dev/null 2>&1; then
    echo "❌ Local server is not running on port 3001"
    echo "   Please start the server with: npm start"
    exit 1
fi

# テストリクエスト送信
echo "2. Posting to /api/workflow..."
RESPONSE=$(curl -s -X POST http://localhost:3001/api/workflow \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$TEST_URL\", \"maxQA\": 3, \"language\": \"ja\"}")

echo ""
echo "3. Response received:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

echo ""
echo "4. Checking logs for GenSpark Crawler activity..."
echo "   Look for these patterns in the console output:"
echo "   - '🚀 Trying GenSpark Crawler...'"
echo "   - '🌐 [GenSpark Crawler] Attempting to fetch'"
echo "   - '✅ [GenSpark Crawler] Successfully fetched'"
echo ""
echo "=== Test Complete ==="
