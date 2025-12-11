const cheerio = require('cheerio');
const https = require('https');

https.get('https://www.neweracap.jp/products/14668175', (res) => {
  let html = '';
  res.on('data', (chunk) => { html += chunk; });
  res.on('end', () => {
    const $ = cheerio.load(html);
    
    console.log('=== TESTING EXTRACTION ===\n');
    
    // テスト1: .product クラス
    const product = $('.product').first();
    if (product.length > 0) {
      const text = product.text().trim();
      console.log('1. .product container found');
      console.log('   Length:', text.length);
      console.log('   Contains 店舗在庫:', text.includes('店舗在庫'));
      console.log('   Contains 店舗:', text.includes('店舗'));
      console.log('   First 500 chars:', text.substring(0, 500));
      console.log('\n');
    }
    
    // テスト2: main タグ
    const main = $('main').first();
    if (main.length > 0) {
      const text = main.text().trim();
      console.log('2. main tag found');
      console.log('   Length:', text.length);
      console.log('   Contains 店舗在庫:', text.includes('店舗在庫'));
      console.log('   Contains 店舗:', text.includes('店舗'));
      console.log('   First 500 chars:', text.substring(0, 500));
      console.log('\n');
    }
    
    // テスト3: 店舗在庫の要素を探す
    console.log('3. Searching for store-inventory elements:');
    $('.store-inventory, [class*="store"], [class*="inventory"]').each((i, elem) => {
      console.log('   Found:', $(elem).attr('class'));
    });
    
    process.exit(0);
  });
}).on('error', (err) => {
  console.error('Error:', err);
  process.exit(1);
});
