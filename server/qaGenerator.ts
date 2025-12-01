import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { QAItem, CrawlResult } from './types';

// .envファイルを読み込み
dotenv.config();

// OpenAIクライアントを遅延初期化
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set. Please configure it in Render.com Dashboard > Environment.');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// 商品カテゴリを検出
function detectProductCategory(content: string): string {
  const categories = {
    cosmetics: ['化粧品', 'コスメ', 'スキンケア', '美容液', 'クリーム', 'ファンデーション'],
    haircare: ['シャンプー', 'トリートメント', 'ヘアケア', 'コンディショナー'],
    fashion: ['洋服', '服', 'ファッション', 'アパレル', 'Tシャツ', 'ワンピース', 'パンツ'],
    accessories: ['アクセサリー', 'ネックレス', 'ピアス', 'リング', '指輪', 'ブレスレット'],
    shoes: ['靴', 'シューズ', 'スニーカー', 'ブーツ', 'パンプス'],
    appliances: ['家電', '電化製品', '冷蔵庫', '洗濯機', '掃除機', 'エアコン'],
    beautyappliances: ['美容家電', 'ドライヤー', 'ヘアアイロン', '美顔器', '脱毛器'],
    food: ['食品', '食べ物', 'グルメ', '料理', 'お菓子', 'スイーツ'],
    beverage: ['飲料', 'ドリンク', '飲み物', 'ジュース', 'コーヒー', 'お茶'],
    alcohol: ['お酒', 'アルコール', 'ワイン', 'ビール', '日本酒', '焼酎']
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => content.includes(keyword))) {
      return category;
    }
  }
  return 'general';
}

// Language type
type Language = 'ja' | 'en' | 'zh';

// Get prompt in specified language
function getPromptByLanguage(content: string, maxQA: number, language: Language): string {
  const prompts = {
    ja: `以下のWebサイトのテキストから、${maxQA}個のQ&A（質問と回答のペア）を生成してください。

テキスト内容:
${content.substring(0, 8000)}

重要な制約:
- 薬機法、景品表示法などの法律に抵触する内容は絶対に含めない
- 医療効果、治療効果、育毛効果などの効能を謳う質問は作成しない
- サイト内に記載されている情報のみを基にQ&Aを作成
- 商品、サービス、会社のポリシーに関する実用的な質問を作成

動画素材推奨の判定基準（積極的に判定してください）:
以下のキーワードや内容が質問に含まれる場合、必ず "needsVideo": true にしてください:

【必ず動画推奨すべき質問】
- 「どのように」「どうやって」「方法」「手順」「やり方」→ 手順・方法系
- 「組み立て」「設置」「取り付け」「セットアップ」→ 組み立て系
- 「使い方」「使用方法」「操作方法」→ 使い方系  
- 「質感」「触り心地」「テクスチャー」「伸び」→ 質感系
- 「サイズ感」「大きさ」「着用感」「フィット感」→ サイズ感系
- 「動き」「動作」「音」「速度」→ 動作系
- 「色味」「発色」「Before/After」→ 比較系
- 「開封」「unboxing」→ 開封系`,
    
    en: `Generate ${maxQA} Q&A pairs (questions and answers) from the following website text.

Text content:
${content.substring(0, 8000)}

Important constraints:
- Do not include content that violates laws such as pharmaceutical affairs law or misleading advertising
- Do not create questions that claim medical effects, treatment effects, or hair growth effects
- Create Q&As based only on information stated on the site
- Create practical questions about products, services, and company policies

Video material recommendation criteria (judge proactively):
Set "needsVideo": true if the question contains the following keywords:

【Questions that MUST recommend video】
- "how", "how to", "method", "steps", "procedure" → procedural/method questions
- "assemble", "install", "setup", "mounting" → assembly questions
- "how to use", "usage", "operation" → usage questions
- "texture", "feel", "touch" → texture questions
- "size", "fit", "sizing" → size-related questions
- "motion", "movement", "sound", "speed" → motion questions
- "color", "appearance", "before/after" → comparison questions
- "unboxing", "opening" → unboxing questions`,

    zh: `从以下网站文本生成${maxQA}个问答对（问题和答案）。

文本内容:
${content.substring(0, 8000)}

重要限制:
- 不包含违反药品法、误导性广告等法律的内容
- 不创建声称医疗效果、治疗效果、生发效果的问题
- 仅基于网站上陈述的信息创建问答
- 创建关于产品、服务和公司政策的实用问题

视频素材推荐标准（积极判断）:
如果问题包含以下关键词，请设置 "needsVideo": true：

【必须推荐视频的问题】
- "如何"、"怎么"、"方法"、"步骤"、"程序" → 程序/方法问题
- "组装"、"安装"、"设置"、"安装" → 组装问题
- "使用方法"、"用法"、"操作" → 使用问题
- "质感"、"手感"、"触感" → 质感问题
- "尺寸"、"合身"、"大小" → 尺寸相关问题
- "运动"、"移动"、"声音"、"速度" → 运动问题
- "颜色"、"外观"、"前后对比" → 比较问题
- "开箱"、"拆箱" → 开箱问题`
  };
  
  return prompts[language];
}

// Get prompt ending by language
function getPromptEndingByLanguage(maxQA: number, language: Language): string {
  const endings = {
    ja: `

【動画不要な質問のみ】
- 価格、料金のみを問う質問
- 配送、送料のみを問う質問
- 在庫、入荷のみを問う質問
- 保証期間、返品ポリシーのみを問う質問

重要: 迷ったら "needsVideo": true にしてください。

"needsVideo": true の場合、理由や例が思いつかなくても構いません（任意）:
- "videoReason": 動画が必要な理由を1文で（例：「組み立て手順を視覚的に示すため」）
- "videoExamples": 作成すべき動画の内容を2-3個（例：「組み立て手順のデモンストレーション」「使用方法の実演」）

【重要】videoExamplesには具体的な動画の内容説明のみを記載してください。URLや架空のリンクは絶対に含めないでください。

出力形式（必ずこのJSON配列のみ）:
[
  {"question": "質問1", "answer": "回答1", "needsVideo": true, "videoReason": "理由", "videoExamples": ["例1", "例2"]},
  {"question": "質問2", "answer": "回答2", "needsVideo": false}
]

重要: 
- 上記のJSON配列形式のみを出力してください
- 各Q&Aの間に必ずカンマを入れてください
- 番号や説明文は不要です
- 正確に${maxQA}個のQ&Aを生成してください`,

    en: `

【Videos NOT needed (only these)】
- Questions about price/cost only
- Questions about shipping/delivery only
- Questions about stock/availability only
- Questions about warranty/return policy only

Important: If in doubt, set "needsVideo": true.

For "needsVideo": true, reason and examples are optional:
- "videoReason": Brief reason why video is recommended (e.g., "To visually demonstrate assembly steps")
- "videoExamples": 2-3 descriptions of video content to create (e.g., "Assembly process demonstration", "Usage tutorial")

【IMPORTANT】For videoExamples, provide only descriptions of video content. NEVER include URLs or fictional links.

Output format (JSON array only):
[
  {"question": "Question 1", "answer": "Answer 1", "needsVideo": true, "videoReason": "Reason", "videoExamples": ["Example 1", "Example 2"]},
  {"question": "Question 2", "answer": "Answer 2", "needsVideo": false}
]

Important: 
- Output ONLY the JSON array above
- Include comma between each Q&A object
- No numbering or explanations
- Generate exactly ${maxQA} Q&As`,

    zh: `

【不需要视频的问题（仅这些）】
- 仅关于价格/费用的问题
- 仅关于运输/配送的问题
- 仅关于库存/可用性的问题
- 仅关于保修/退货政策的问题

重要提示：如有疑问，请设置 "needsVideo": true。

对于 "needsVideo": true，原因和示例是可选的：
- "videoReason": 推荐视频的简要原因（例如："为了直观展示组装步骤"）
- "videoExamples": 2-3个要创建的视频内容描述（例如："组装过程演示"、"使用方法教程"）

【重要】videoExamples只应包含视频内容描述，绝不包含URL或虚构链接。

输出格式（仅JSON数组）:
[
  {"question": "问题1", "answer": "答案1", "needsVideo": true, "videoReason": "原因", "videoExamples": ["示例1", "示例2"]},
  {"question": "问题2", "answer": "答案2", "needsVideo": false}
]

重要提示：
- 仅输出上述JSON数组
- 每个问答对象之间必须包含逗号
- 不要编号或说明
- 准确生成${maxQA}个问答`
  };
  
  return endings[language];
}

// Get system message by language
function getSystemMessageByLanguage(language: Language): string {
  const messages = {
    ja: 'あなたはD2C/EC業界のマーケティング専門家です。商品説明に動画コンテンツを活用することの重要性を理解しており、「組み立て」「使い方」「方法」「手順」などの実演が必要な質問には積極的に動画を推奨します。迷った場合は動画推奨にします。',
    en: 'You are a D2C/EC industry marketing expert. You understand the importance of using video content in product explanations, and actively recommend videos for questions requiring demonstrations such as "assembly", "how to use", "methods", and "procedures". When in doubt, recommend videos.',
    zh: '您是D2C/EC行业的营销专家。您了解在产品说明中使用视频内容的重要性，并积极推荐需要演示的问题的视频，例如"组装"、"使用方法"、"方法"和"程序"。如有疑问，请推荐视频。'
  };
  
  return messages[language];
}

export async function generateQAFromText(
  content: string,
  sourceUrl: string,
  maxQA: number = 10,
  tempApiKey?: string,
  language: Language = 'ja'
): Promise<QAItem[]> {
  try {
    const promptStart = getPromptByLanguage(content, maxQA, language);
    const promptEnd = getPromptEndingByLanguage(maxQA, language);
    const prompt = promptStart + promptEnd;

    // 一時API Keyがある場合は新しいクライアントを作成、なければデフォルトクライアントを使用
    const client = tempApiKey ? new OpenAI({ apiKey: tempApiKey }) : getOpenAIClient();
    
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { 
          role: 'system', 
          content: getSystemMessageByLanguage(language)
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 16384  // GPT-4o-miniの最大出力トークン数（OpenAI SDK v6ではmax_tokensを使用）
    });

    const content_text = response.choices[0]?.message?.content || '[]';
    
    console.log('OpenAI response length:', content_text.length);
    console.log('OpenAI response preview:', content_text.substring(0, 300));
    
    // JSONを抽出
    let jsonMatch = content_text.match(/\[[\s\S]*\]/);
    
    // 番号付きリスト形式の場合、配列形式に変換
    if (!jsonMatch && content_text.includes('{"question"')) {
      console.log('Detected numbered list format, converting to array...');
      const items = content_text.match(/\{\s*"question"[\s\S]*?"answer"[\s\S]*?\}/g);
      if (items && items.length > 0) {
        const arrayString = '[' + items.join(',') + ']';
        jsonMatch = [arrayString];
        console.log('Converted to array format');
      }
    }
    
    if (!jsonMatch) {
      console.warn('No JSON array found in response:', content_text.substring(0, 200));
      return [];
    }
    
    let qaData;
    try {
      qaData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Attempted to parse:', jsonMatch[0].substring(0, 500));
      
      // Try to fix incomplete JSON by extracting complete objects
      console.log('Attempting to extract complete Q&A objects from incomplete JSON...');
      const completeObjects = jsonMatch[0].match(/\{[^{}]*"question"[^{}]*"answer"[^{}]*\}/g);
      if (completeObjects && completeObjects.length > 0) {
        try {
          qaData = JSON.parse('[' + completeObjects.join(',') + ']');
          console.log(`Successfully extracted ${qaData.length} complete Q&A objects`);
        } catch (e) {
          console.error('Failed to parse extracted objects:', e);
          return [];
        }
      } else {
        return [];
      }
    }
    
    if (!Array.isArray(qaData)) {
      console.warn('Parsed data is not an array:', typeof qaData);
      return [];
    }
    
    return qaData.slice(0, maxQA).map((item: any) => ({
      id: uuidv4(),
      question: item.question || '',
      answer: item.answer || '',
      source: 'collected' as const,
      sourceType: 'text' as const,
      sourceUrl,
      timestamp: Date.now(),
      needsVideo: item.needsVideo || false,
      videoReason: item.videoReason || undefined,
      videoExamples: item.videoExamples || undefined
    })).filter(item => item.question && item.answer);
  } catch (error) {
    console.error('Error generating Q&A from text:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return [];
  }
}

export async function generateSuggestedQA(
  context: string,
  existingQuestions: string[],
  maxQA: number = 5,
  tempApiKey?: string,
  language: Language = 'ja'
): Promise<QAItem[]> {
  try {
    const category = detectProductCategory(context);
    
    // カテゴリ別の想定質問ガイド
    const categoryGuides: Record<string, string> = {
      cosmetics: '肌質別の使い方、使用タイミング、他の商品との併用、保管方法、使用期限など',
      haircare: '髪質別の使い方、使用頻度、カラーとの併用、香り、ボトルサイズなど',
      fashion: '着用シーン、コーディネート、サイズ感、お手入れ方法、季節感など',
      accessories: '着用シーン、お手入れ方法、ギフト包装、素材の特徴、サイズ調整など',
      shoes: 'サイズ選び、履き心地、お手入れ方法、防水性、着用シーンなど',
      appliances: '設置方法、電気代、保証期間、メンテナンス、機能の使い方など',
      beautyappliances: '使用頻度、お手入れ方法、消耗品の交換、安全性、使用時間など',
      food: '保存方法、賞味期限、アレルギー情報、調理方法、ギフト対応など',
      beverage: '保存方法、飲み方の提案、温度、容量、ギフト対応など',
      alcohol: '保存方法、適温、おすすめの飲み方、ギフト包装、度数など',
      general: '営業時間、連絡方法、支払い方法、配送、返品、ギフト対応など'
    };

    const categoryGuide = categoryGuides[category] || categoryGuides.general;
    
    const existingQuestionsText = existingQuestions.length > 0 
      ? `\n\n既存の質問（これらとは異なる質問を作成）:\n${existingQuestions.join('\n')}` 
      : '';

    // Build prompt based on language
    const promptBase = getPromptByLanguage('', maxQA, language); // Get the base structure
    const promptEnding = getPromptEndingByLanguage(maxQA, language); // Get proper JSON format
    
    const prompt = `${language === 'ja' ? '以下のコンテキストを参考に、想定Q&A（質問と回答のペア）を生成してください。' :
                     language === 'en' ? 'Generate suggested Q&A pairs based on the following context.' :
                     '根据以下上下文生成建议的问答对。'}

${language === 'ja' ? 'コンテキスト:' : language === 'en' ? 'Context:' : '上下文:'}
${context.substring(0, 5000)}

${language === 'ja' ? `商品カテゴリ: ${category}
推奨される質問の方向性: ${categoryGuide}` :
  language === 'en' ? `Product Category: ${category}
Recommended question directions: ${categoryGuide}` :
  `产品类别: ${category}
推荐的问题方向: ${categoryGuide}`}
${existingQuestionsText}

${language === 'ja' ? '重要な制約:' : language === 'en' ? 'Important constraints:' : '重要约束:'}
${language === 'ja' ? `- 薬機法、景品表示法などの法律に抵触する内容は絶対に含めない
- 医療効果、治療効果、育毛効果などの効能を謳う質問は作成しない
- Webサイトには直接記載されていないが、一般的な視点でユーザーが知りたいと思う実用的な質問
- 既存の質問とは内容が重複しないようにする
- 回答は一般的な知識や業界標準に基づいて作成（憶測は避ける）` :
  language === 'en' ? `- Do not include content that violates laws such as pharmaceutical and drug regulations
- Do not create questions claiming medical effects, treatment effects, or hair growth effects
- Create practical questions that users want to know from a general perspective, not directly stated on the website
- Avoid content duplication with existing questions
- Create answers based on general knowledge and industry standards (avoid speculation)` :
  `- 不包含违反药品法规、广告法等法律的内容
- 不创建声称医疗效果、治疗效果或生发效果的问题
- 创建用户从一般角度想知道的实用问题，而不是网站上直接陈述的内容
- 避免与现有问题内容重复
- 基于一般知识和行业标准创建答案（避免猜测）`}

${promptEnding}`;

    // 一時API Keyがある場合は新しいクライアントを作成、なければデフォルトクライアントを使用
    const client = tempApiKey ? new OpenAI({ apiKey: tempApiKey }) : getOpenAIClient();
    
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { 
          role: 'system', 
          content: getSystemMessageByLanguage(language)
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 16384  // GPT-4o-miniの最大出力トークン数（OpenAI SDK v6ではmax_tokensを使用）
    });

    const content_text = response.choices[0]?.message?.content || '[]';
    
    console.log('OpenAI suggested Q&A response length:', content_text.length);
    console.log('OpenAI suggested Q&A response preview:', content_text.substring(0, 300));
    
    // JSONを抽出
    let jsonMatch = content_text.match(/\[[\s\S]*\]/);
    
    // 番号付きリスト形式の場合、配列形式に変換
    if (!jsonMatch && content_text.includes('{"question"')) {
      console.log('Detected numbered list format in suggested Q&A, converting to array...');
      const items = content_text.match(/\{\s*"question"[\s\S]*?"answer"[\s\S]*?\}/g);
      if (items && items.length > 0) {
        const arrayString = '[' + items.join(',') + ']';
        jsonMatch = [arrayString];
        console.log('Converted suggested Q&A to array format');
      }
    }
    
    if (!jsonMatch) {
      console.warn('No JSON array found in suggested Q&A response:', content_text.substring(0, 200));
      return [];
    }
    
    let qaData;
    try {
      qaData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('JSON parse error in suggested Q&A:', parseError);
      console.error('Attempted to parse:', jsonMatch[0].substring(0, 500));
      
      // Try to fix incomplete JSON by extracting complete objects
      console.log('Attempting to extract complete Q&A objects from incomplete JSON...');
      const completeObjects = jsonMatch[0].match(/\{[^{}]*"question"[^{}]*"answer"[^{}]*\}/g);
      if (completeObjects && completeObjects.length > 0) {
        try {
          qaData = JSON.parse('[' + completeObjects.join(',') + ']');
          console.log(`Successfully extracted ${qaData.length} complete suggested Q&A objects`);
        } catch (e) {
          console.error('Failed to parse extracted objects:', e);
          return [];
        }
      } else {
        return [];
      }
    }
    
    if (!Array.isArray(qaData)) {
      console.warn('Parsed suggested Q&A data is not an array:', typeof qaData);
      return [];
    }
    
    return qaData.slice(0, maxQA).map((item: any) => ({
      id: uuidv4(),
      question: item.question || '',
      answer: item.answer || '',
      source: 'suggested' as const,
      timestamp: Date.now(),
      needsVideo: item.needsVideo || false,
      videoReason: item.videoReason || undefined,
      videoExamples: item.videoExamples || undefined
    })).filter(item => item.question && item.answer);
  } catch (error) {
    console.error('Error generating suggested Q&A:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    return [];
  }
}

export async function generateQAFromCrawlResults(
  results: CrawlResult[],
  maxQA: number,
  includeTypes: { collected: boolean; suggested: boolean },
  tempApiKey?: string,
  language: Language = 'ja'
): Promise<QAItem[]> {
  const allQA: QAItem[] = [];
  
  const combinedContent = results
    .map(r => r.content)
    .join('\n\n')
    .substring(0, 10000);
  
  // 収集情報ベースのQ&A生成を優先
  if (includeTypes.collected && combinedContent.length > 100) {
    console.log('Generating collected Q&As...');
    const textQA = await generateQAFromText(
      combinedContent,
      results[0]?.url || '',
      maxQA,  // まず上限いっぱいまで収集情報ベースで生成を試みる
      tempApiKey,
      language
    );
    allQA.push(...textQA);
    console.log(`Generated ${textQA.length} collected Q&As`);
  }
  
  // 上限に達していない場合のみ想定Q&Aで補填
  if (includeTypes.suggested && allQA.length < maxQA && combinedContent.length > 100) {
    const remaining = maxQA - allQA.length;
    console.log(`Filling ${remaining} Q&As with suggested questions...`);
    
    const existingQuestions = allQA.map(qa => qa.question);
    const suggestedQA = await generateSuggestedQA(
      combinedContent,
      existingQuestions,
      remaining,
      tempApiKey,
      language
    );
    allQA.push(...suggestedQA);
    console.log(`Generated ${suggestedQA.length} suggested Q&As`);
  }
  
  // 収集情報のみでも上限に達していない場合
  if (!includeTypes.suggested && allQA.length < maxQA && includeTypes.collected) {
    console.log(`Warning: Only generated ${allQA.length} out of ${maxQA} requested Q&As from collected information`);
  }
  
  // 想定Q&Aのみの場合
  if (includeTypes.suggested && !includeTypes.collected && combinedContent.length > 100) {
    console.log('Generating suggested Q&As only...');
    const suggestedQA = await generateSuggestedQA(
      combinedContent,
      [],
      maxQA,
      tempApiKey,
      language
    );
    allQA.push(...suggestedQA);
  }
  
  return allQA.slice(0, maxQA);
}
