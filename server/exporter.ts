import ExcelJS from 'exceljs';
import { Document, Paragraph, TextRun, HeadingLevel, Packer } from 'docx';
import PDFDocument from 'pdfkit';
import { PDFDocument as PDFLib, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import archiver from 'archiver';
import { Readable } from 'stream';
import { QAItem } from './types';
import { Language, getLabel, translateSource, translateSourceType } from './exportLabels';

// ES modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function exportToExcel(qaItems: QAItem[], includeLabels: boolean = true, language: Language = 'ja'): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(getLabel(language, 'worksheetName'));
  
  // ヘッダー行
  const columns: any[] = [
    { header: getLabel(language, 'numberLabel'), key: 'no', width: 10 },
    { header: getLabel(language, 'question'), key: 'question', width: 50 },
    { header: getLabel(language, 'answer'), key: 'answer', width: 50 }
  ];
  
  if (includeLabels) {
    columns.push(
      { header: getLabel(language, 'source'), key: 'source', width: 15 },
      { header: getLabel(language, 'sourceType'), key: 'sourceType', width: 15 },
      { header: getLabel(language, 'url'), key: 'url', width: 40 },
      { header: getLabel(language, 'needsVideo'), key: 'needsVideo', width: 15 },
      { header: getLabel(language, 'videoReason'), key: 'videoReason', width: 60 },
      { header: getLabel(language, 'videoExamples'), key: 'videoExamples', width: 60 }
    );
  }
  
  worksheet.columns = columns;
  
  // ヘッダーのスタイル
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  
  // データ行
  qaItems.forEach((item, index) => {
    const row: any = {
      no: index + 1,
      question: item.question,
      answer: item.answer
    };
    
    if (includeLabels) {
      row.source = translateSource(item.source, language);
      row.sourceType = item.sourceType ? translateSourceType(item.sourceType, language) : '-';
      row.url = item.sourceUrl || '-';
      row.needsVideo = item.needsVideo ? getLabel(language, 'yes') : getLabel(language, 'noLabel');
      row.videoReason = item.videoReason || '';
      row.videoExamples = item.videoExamples ? item.videoExamples.join('\n') : '';
    }
    
    worksheet.addRow(row);
  });
  
  // 自動フィルター
  const lastColumn = includeLabels ? 'I' : 'C';
  worksheet.autoFilter = {
    from: 'A1',
    to: `${lastColumn}1`
  };
  
  return await workbook.xlsx.writeBuffer() as Buffer;
}

export async function exportToWord(qaItems: QAItem[], includeLabels: boolean = true, language: Language = 'ja'): Promise<Buffer> {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: 'Q&A集',
          heading: HeadingLevel.HEADING_1
        }),
        new Paragraph({ text: '' }),
        ...qaItems.flatMap((item, index) => [
          new Paragraph({
            children: [
              new TextRun({
                text: `Q${index + 1}: `,
                bold: true,
                size: 24
              }),
              new TextRun({
                text: item.question,
                size: 24
              })
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `A: `,
                bold: true,
                size: 24
              }),
              new TextRun({
                text: item.answer,
                size: 24
              })
            ]
          }),
          ...(includeLabels ? [new Paragraph({
            children: [
              new TextRun({
                text: `[${translateSource(item.source, language)}`,
                italics: true,
                size: 20,
                color: '666666'
              }),
              item.sourceType ? new TextRun({
                text: ` - ${translateSourceType(item.sourceType, language)}`,
                italics: true,
                size: 20,
                color: '666666'
              }) : new TextRun({ text: '' }),
              new TextRun({
                text: ']',
                italics: true,
                size: 20,
                color: '666666'
              })
            ]
          })] : []),
          new Paragraph({ text: '' })
        ])
      ]
    }]
  });
  
  // Buffer型に変換
  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

export function exportToText(qaItems: QAItem[], includeLabels: boolean = true, includeVideoInfo: boolean = true, language: Language = 'ja'): string {
  let text = getLabel(language, 'qaCollectionTitle') + '\n\n';
  text += '=' .repeat(80) + '\n\n';
  
  qaItems.forEach((item, index) => {
    text += `Q${index + 1}: ${item.question}\n`;
    text += `A: ${item.answer}\n`;
    if (includeLabels) {
      text += `[${translateSource(item.source, language)}`;
      if (item.sourceType) {
        text += ` - ${translateSourceType(item.sourceType, language)}`;
      }
      text += ']\n';
      
      // 動画推奨情報を含める場合
      if (includeVideoInfo && item.needsVideo) {
        // ナラティブを追加
        text += `  ${getLabel(language, 'videoRecommendationNarrative')}\n`;
        if (item.videoReason) {
          text += `  ${getLabel(language, 'videoReasonTitle')}: ${item.videoReason}\n`;
        }
        if (item.videoExamples && item.videoExamples.length > 0) {
          text += `  ${getLabel(language, 'videoExamplesTitle')}:\n`;
          item.videoExamples.forEach(ex => {
            text += `    - ${ex}\n`;
          });
        }
      }
    }
    text += '-'.repeat(80) + '\n\n';
  });
  
  return text;
}

export async function exportToPDF(qaItems: QAItem[], includeLabels: boolean = true, includeVideoInfo: boolean = true, language: Language = 'ja'): Promise<Buffer> {
  try {
    // PDFドキュメントを作成
    const pdfDoc = await PDFLib.create();
    pdfDoc.registerFontkit(fontkit);
    
    // 日本語フォントを読み込み
    const fontPath = path.join(__dirname, '../fonts/NotoSansJP-Regular.ttf');
    const fontBytes = fs.readFileSync(fontPath);
    const japaneseFont = await pdfDoc.embedFont(fontBytes);
    
    let page = pdfDoc.addPage([595, 842]); // A4サイズ
    const { width, height } = page.getSize();
    let yPosition = height - 80;
    
    // タイトル
    page.drawText(getLabel(language, 'qaCollectionTitle'), {
      x: 50,
      y: yPosition,
      size: 24,
      font: japaneseFont,
      color: rgb(0, 0, 0)
    });
    yPosition -= 60;
    
    // Q&Aアイテム
    for (let index = 0; index < qaItems.length; index++) {
      const item = qaItems[index];
      
      // ページが足りない場合は新しいページを追加
      if (yPosition < 100) {
        page = pdfDoc.addPage([595, 842]);
        yPosition = height - 80;
      }
      
      // 質問
      const questionText = `Q${index + 1}: ${item.question}`;
      const questionLines = splitTextIntoLines(questionText, 80);
      
      for (const line of questionLines) {
        if (yPosition < 100) {
          page = pdfDoc.addPage([595, 842]);
          yPosition = height - 80;
        }
        page.drawText(line, {
          x: 50,
          y: yPosition,
          size: 14,
          font: japaneseFont,
          color: rgb(0, 0, 0)
        });
        yPosition -= 20;
      }
      
      yPosition -= 5;
      
      // 回答
      const answerText = `A: ${item.answer}`;
      const answerLines = splitTextIntoLines(answerText, 80);
      
      for (const line of answerLines) {
        if (yPosition < 100) {
          page = pdfDoc.addPage([595, 842]);
          yPosition = height - 80;
        }
        page.drawText(line, {
          x: 50,
          y: yPosition,
          size: 12,
          font: japaneseFont,
          color: rgb(0, 0, 0)
        });
        yPosition -= 18;
      }
      
      // ラベル（オプション）
      if (includeLabels) {
        yPosition -= 5;
        const sourceLabel = translateSource(item.source, language);
        const typeLabel = item.sourceType ? translateSourceType(item.sourceType, language) : '';
        const labelText = `[${sourceLabel}${typeLabel ? ` - ${typeLabel}` : ''}]`;
        
        if (yPosition < 100) {
          page = pdfDoc.addPage([595, 842]);
          yPosition = height - 80;
        }
        
        page.drawText(labelText, {
          x: 50,
          y: yPosition,
          size: 10,
          font: japaneseFont,
          color: rgb(0.4, 0.4, 0.4)
        });
        yPosition -= 15;
        
        // 動画推奨情報を含める場合
        if (includeVideoInfo && item.needsVideo) {
          // ナラティブを追加
          if (yPosition < 100) {
            page = pdfDoc.addPage([595, 842]);
            yPosition = height - 80;
          }
          
          page.drawText(`  ${getLabel(language, 'videoRecommendationNarrative')}`, {
            x: 55,
            y: yPosition,
            size: 9,
            font: japaneseFont,
            color: rgb(0.3, 0.3, 0.3)
          });
          yPosition -= 14;
          
          // videoReason
          if (item.videoReason) {
            if (yPosition < 100) {
              page = pdfDoc.addPage([595, 842]);
              yPosition = height - 80;
            }
            
            const videoReasonText = `  ${getLabel(language, 'videoReasonTitle')}: ${item.videoReason}`;
            const videoReasonLines = splitTextIntoLines(videoReasonText, 75);
            
            for (const line of videoReasonLines) {
              if (yPosition < 100) {
                page = pdfDoc.addPage([595, 842]);
                yPosition = height - 80;
              }
              page.drawText(line, {
                x: 55,
                y: yPosition,
                size: 9,
                font: japaneseFont,
                color: rgb(0.3, 0.3, 0.3)
              });
              yPosition -= 14;
            }
          }
          
          // videoExamples
          if (item.videoExamples && item.videoExamples.length > 0) {
            if (yPosition < 100) {
              page = pdfDoc.addPage([595, 842]);
              yPosition = height - 80;
            }
            
            page.drawText(`  ${getLabel(language, 'videoExamplesTitle')}:`, {
              x: 55,
              y: yPosition,
              size: 9,
              font: japaneseFont,
              color: rgb(0.3, 0.3, 0.3)
            });
            yPosition -= 14;
            
            for (const example of item.videoExamples) {
              if (yPosition < 100) {
                page = pdfDoc.addPage([595, 842]);
                yPosition = height - 80;
              }
              
              const exampleText = `    - ${example}`;
              const exampleLines = splitTextIntoLines(exampleText, 72);
              
              for (const line of exampleLines) {
                if (yPosition < 100) {
                  page = pdfDoc.addPage([595, 842]);
                  yPosition = height - 80;
                }
                page.drawText(line, {
                  x: 60,
                  y: yPosition,
                  size: 9,
                  font: japaneseFont,
                  color: rgb(0.3, 0.3, 0.3)
                });
                yPosition -= 14;
              }
            }
          }
          
          yPosition -= 5;
        }
      }
      
      yPosition -= 20; // 次のQ&Aとの間隔
    }
    
    // PDFをバイト配列として保存
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  } catch (error) {
    console.error('PDF生成エラー:', error);
    throw new Error('PDF生成に失敗しました');
  }
}

// テキストを指定した文字数で行に分割するヘルパー関数
function splitTextIntoLines(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let currentLine = '';
  
  for (const char of text) {
    if (currentLine.length >= maxChars && char === ' ') {
      lines.push(currentLine);
      currentLine = '';
    } else {
      currentLine += char;
      if (currentLine.length >= maxChars) {
        lines.push(currentLine);
        currentLine = '';
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines.length > 0 ? lines : [text];
}

// 複数フォーマットをZIPにまとめてエクスポート
export async function exportToZip(
  qaItems: QAItem[], 
  formats: ('excel' | 'word' | 'pdf' | 'text')[],
  includeLabels: boolean = true,
  language: Language = 'ja'
): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const archive = archiver('zip', {
        zlib: { level: 9 } // 最大圧縮
      });
      
      const buffers: Buffer[] = [];
      
      archive.on('data', (chunk) => buffers.push(chunk));
      archive.on('end', () => resolve(Buffer.concat(buffers)));
      archive.on('error', reject);
      
      // 各フォーマットのファイルを生成してZIPに追加
      for (const format of formats) {
        try {
          let buffer: Buffer;
          let filename: string;
          
          console.log(`[exportToZip] Generating ${format} file...`);
          
          switch (format) {
            case 'excel':
              // Excelは常にラベルを含める
              buffer = await exportToExcel(qaItems, true, language);
              filename = 'qa-collection.xlsx';
              break;
            case 'word':
              // Word, PDF, TextのみincludeLabelsオプションを適用
              buffer = await exportToWord(qaItems, includeLabels, language);
              filename = 'qa-collection.docx';
              break;
            case 'pdf':
              buffer = await exportToPDF(qaItems, includeLabels, language);
              filename = 'qa-collection.pdf';
              break;
            case 'text':
              const textContent = exportToText(qaItems, includeLabels, language);
              buffer = Buffer.from(textContent, 'utf-8');
              filename = 'qa-collection.txt';
              break;
            default:
              console.log(`[exportToZip] Unknown format: ${format}, skipping...`);
              continue;
          }
          
          console.log(`[exportToZip] Successfully generated ${format} file (${buffer.length} bytes)`);
          
          // ZIPにファイルを追加
          archive.append(buffer, { name: filename });
        } catch (formatError) {
          console.error(`[exportToZip] Error generating ${format} file:`, formatError);
          // 1つのフォーマットでエラーが出ても他のフォーマットは続行
          // ただしエラーは記録
          if (formatError instanceof Error) {
            console.error(`[exportToZip] ${format} error details:`, formatError.message);
            console.error(`[exportToZip] ${format} stack:`, formatError.stack);
          }
        }
      }
      
      // ZIPを完成させる
      await archive.finalize();
    } catch (error) {
      reject(error);
    }
  });
}
