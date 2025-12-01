import axios from 'axios';
import robotsParser from 'robots-parser';

export async function checkRobotsAllowed(url: string): Promise<boolean> {
  try {
    const urlObj = new URL(url);
    const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
    
    try {
      const response = await axios.get(robotsUrl, { timeout: 5000 });
      const robots = robotsParser(robotsUrl, response.data);
      
      // クローラーとして '*' または 'gensparkbot' を使用
      return robots.isAllowed(url, 'gensparkbot') ?? true;
    } catch (error) {
      // robots.txtが存在しない場合は許可とみなす
      return true;
    }
  } catch (error) {
    console.error('robots.txt check error:', error);
    return true; // エラーの場合は許可とみなす
  }
}
