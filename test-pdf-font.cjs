const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// PDFドキュメントを作成
const doc = new PDFDocument();
const output = fs.createWriteStream('/tmp/test-font-direct.pdf');
doc.pipe(output);

// フォントを登録
const fontPath = '/home/user/webapp/fonts/NotoSansJP-Regular.ttf';
console.log('Font path:', fontPath);
console.log('Font exists:', fs.existsSync(fontPath));

try {
  doc.registerFont('NotoSansJP', fontPath);
  console.log('✅ Font registered successfully');
  
  doc.font('NotoSansJP');
  console.log('✅ Font set successfully');
  
  // タイトル
  doc.fontSize(20).text('日本語テスト', { align: 'center' });
  doc.moveDown();
  
  // Q&A
  doc.fontSize(14).fillColor('blue').text('Q1: 日本語の質問です');
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor('black').text('A1: これは日本語の回答です。正しく表示されるはずです。');
  doc.moveDown();
  
  doc.fontSize(14).fillColor('blue').text('Q2: 中文问题');
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor('black').text('A2: 这是中文答案。应该正确显示。');
  
  console.log('✅ Text added successfully');
} catch (error) {
  console.error('❌ Error:', error);
}

doc.end();

output.on('finish', () => {
  console.log('✅ PDF created successfully at /tmp/test-font-direct.pdf');
  const stats = fs.statSync('/tmp/test-font-direct.pdf');
  console.log('PDF size:', stats.size, 'bytes');
});

output.on('error', (err) => {
  console.error('❌ Error writing PDF:', err);
});
