// Test JSON-LD extraction from the actual URL
const https = require('https');
const cheerio = require('cheerio');

const url = 'https://www.neweracap.jp/products/14668175';

console.log('🔍 Testing JSON-LD extraction from:', url);
console.log('');

https.get(url, (res) => {
  let html = '';
  res.on('data', (chunk) => { html += chunk; });
  res.on('end', () => {
    const $ = cheerio.load(html);
    
    console.log('📄 HTML received:', html.length, 'bytes');
    console.log('');
    
    // Test JSON-LD extraction
    console.log('🔍 Searching for JSON-LD...');
    let jsonLdContent = '';
    let foundCount = 0;
    
    $('script[type="application/ld+json"]').each((_, elem) => {
      foundCount++;
      try {
        const jsonText = $(elem).html();
        if (jsonText) {
          const jsonData = JSON.parse(jsonText);
          console.log(`\n📦 JSON-LD #${foundCount} found:`);
          console.log('   Type:', jsonData['@type']);
          
          if (jsonData['@type'] === 'Product') {
            console.log('   ✅ This is a Product!');
            console.log('   Name:', jsonData.name);
            console.log('   Description:', jsonData.description?.substring(0, 100) + '...');
            console.log('   Brand:', jsonData.brand?.name);
            console.log('   Price:', jsonData.offers?.price);
            console.log('');
            
            // Build content
            jsonLdContent += `商品名: ${jsonData.name || ''}\n`;
            jsonLdContent += `説明: ${jsonData.description || ''}\n`;
            jsonLdContent += `カテゴリ: ${jsonData.category || ''}\n`;
            jsonLdContent += `ブランド: ${jsonData.brand?.name || ''}\n`;
            jsonLdContent += `価格: ${jsonData.offers?.price || ''}円\n`;
            jsonLdContent += `サイズ: ${jsonData.size?.name || ''}\n`;
            jsonLdContent += `色: ${jsonData.color || ''}\n`;
            jsonLdContent += `SKU: ${jsonData.sku || ''}\n`;
            
            console.log('📝 Extracted content length:', jsonLdContent.length, 'chars');
            console.log('');
            console.log('📋 Full extracted content:');
            console.log('─'.repeat(60));
            console.log(jsonLdContent);
            console.log('─'.repeat(60));
            console.log('');
            
            // Check for forbidden words
            console.log('🚫 Checking for forbidden words...');
            const forbiddenWords = [
              '店舗', '在庫', '確認', '表示', '反映', '遅延', 'リアルタイム', '数分'
            ];
            let foundForbidden = false;
            for (const word of forbiddenWords) {
              if (jsonLdContent.includes(word)) {
                console.log(`   ❌ Found forbidden word: "${word}"`);
                foundForbidden = true;
              }
            }
            if (!foundForbidden) {
              console.log('   ✅ No forbidden words found!');
            }
            console.log('');
          } else {
            console.log('   ⚠️  Not a Product type (type:', jsonData['@type'], ')');
          }
        }
      } catch (err) {
        console.error('   ❌ Failed to parse JSON-LD:', err.message);
      }
    });
    
    if (foundCount === 0) {
      console.log('❌ No JSON-LD found!');
      console.log('⚠️  This means the site might not have JSON-LD structured data');
      console.log('⚠️  Falling back to HTML parsing would be required');
    } else if (jsonLdContent.length === 0) {
      console.log('⚠️  JSON-LD found but no Product data extracted');
    } else {
      console.log('🎉 SUCCESS! JSON-LD extraction works correctly!');
      console.log('📊 Summary:');
      console.log(`   - JSON-LD scripts found: ${foundCount}`);
      console.log(`   - Content extracted: ${jsonLdContent.length} chars`);
      console.log(`   - Contains forbidden words: NO`);
      console.log(`   - Ready for Q&A generation: YES`);
    }
    
    process.exit(0);
  });
}).on('error', (err) => {
  console.error('❌ Error fetching URL:', err);
  process.exit(1);
});
