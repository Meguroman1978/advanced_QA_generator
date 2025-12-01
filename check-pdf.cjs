const fs = require('fs');

const pdfBuffer = fs.readFileSync('/tmp/pdf-lib-test.pdf');
const pdfString = pdfBuffer.toString('binary');

console.log('PDF size:', pdfBuffer.length, 'bytes');
console.log('\n=== Checking for Japanese text ===');

// 日本語文字のUnicodeパターンを検索
const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(pdfString);
console.log('Contains Japanese Unicode:', hasJapanese);

// 中国語文字のパターン
const hasChinese = /[\u4E00-\u9FFF]/.test(pdfString);
console.log('Contains Chinese Unicode:', hasChinese);

// フォント情報を検索
if (pdfString.includes('NotoSans') || pdfString.includes('Font')) {
  console.log('\n✅ Font information found in PDF');
} else {
  console.log('\n⚠️ No font information found');
}

// PDF構造を確認
const lines = pdfString.split('\n').slice(0, 50);
console.log('\n=== First 30 lines of PDF ===');
lines.slice(0, 30).forEach((line, i) => {
  if (line.includes('Font') || line.includes('Text') || line.includes('Q') || line.includes('A')) {
    console.log(`Line ${i}:`, line.substring(0, 100));
  }
});
