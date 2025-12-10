# 🔍 デバッグ手順

## 問題: エラー診断が表示されない

### ステップ1: ブラウザコンソールを開く

1. ブラウザで **F12** を押す
2. **Console** タブを選択
3. Q&A生成を実行

### ステップ2: 以下のログを探す

```javascript
[RESPONSE] Full data: Object
[RESPONSE] data.data: Object
[RESPONSE] qaItems count: 0
```

このオブジェクトを展開して、`diagnostics` フィールドが存在するか確認してください。

### ステップ3: 以下のコマンドを実行

ブラウザコンソールで以下を実行：

```javascript
// 最後のレスポンスを確認
console.log('Last response data:', window.lastResponse);
```

### ステップ4: サーバーログを確認

```bash
flyctl logs --app advanced-qa-generator | grep -A5 "diagnostics"
```

### ステップ5: 期待される出力

**サーバーログ（期待）:**
```
📤 Sending response with XXX bytes
```

この後に `diagnostics` オブジェクトが含まれているはず。

**ブラウザコンソール（期待）:**
```javascript
{
  success: true,
  data: {
    qaItems: [],
    diagnostics: {
      fetchError: "...",
      htmlLength: 111,
      pageTitle: "403 Forbidden",
      contentLength: 13,
      is403: true,
      htmlPreview: "..."
    }
  }
}
```
