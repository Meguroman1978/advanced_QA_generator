#!/bin/bash

echo "Testing Q&A Generation with JSON Format Fix..."
echo ""

# Test Japanese Q&A generation
echo "1. Testing Japanese Q&A generation..."
curl -X POST http://localhost:3001/api/generate-advanced \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "sourceCode": "<html><body><h1>テスト商品</h1><p>この商品は組み立てが必要です。ドライバーを使って4つのネジで固定してください。使い方は簡単で、電源ボタンを押すだけです。</p></body></html>",
    "maxQA": 3,
    "language": "ja",
    "includeTypes": {
      "collected": true,
      "suggested": false
    }
  }' 2>/dev/null | python3 -m json.tool | head -50

echo ""
echo "---"
echo ""

# Test English Q&A generation  
echo "2. Testing English Q&A generation..."
curl -X POST http://localhost:3001/api/generate-advanced \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "sourceCode": "<html><body><h1>Test Product</h1><p>This product requires assembly. Use a screwdriver to secure with 4 screws. Usage is simple - just press the power button.</p></body></html>",
    "maxQA": 3,
    "language": "en",
    "includeTypes": {
      "collected": true,
      "suggested": false
    }
  }' 2>/dev/null | python3 -m json.tool | head -50

echo ""
echo "Test complete!"
