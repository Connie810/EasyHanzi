const fs = require('fs');
const path = require('path');
const axios = require('axios');

const OUTPUT_FILE = path.join(__dirname, '../data/output/app-data.json');

// 确保输出目录存在
if (!fs.existsSync(path.dirname(OUTPUT_FILE))) {
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
}

// 飞书 API 配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const FEISHU_SPREADSHEET_TOKEN = process.env.FEISHU_SPREADSHEET_TOKEN;

// 获取飞书访问令牌
async function getFeishuToken() {
  try {
    const response = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET
    });
    
    if (response.data.code === 0) {
      return response.data.tenant_access_token;
    } else {
      throw new Error(`获取飞书令牌失败: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('获取飞书令牌错误:', error);
    throw error;
  }
}

// 从飞书表格获取数据
async function getSheetData(token, spreadsheetToken, sheetId) {
  try {
    const requestHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    const response = await axios.get(
      `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${sheetId}`,
      { headers: requestHeaders }
    );
    
    if (response.data.code !== 0) {
      throw new Error(`获取表格数据失败: ${response.data.msg}`);
    }
    
    // 处理表格数据
    const rows = response.data.data.values;
    if (!rows || rows.length < 2) {
      return [];
    }
    
    // 第一行作为表头
    const columnHeaders = rows[0];
    
    // 转换数据为对象数组
    return rows.slice(1).map(row => {
      const item = {};
      columnHeaders.forEach((header, index) => {
        item[header] = row[index] || '';
      });
      return item;
    });
  } catch (error) {
    console.error('获取表格数据错误:', error);
    throw error;
  }
}

// 主函数
async function fetchAndConvertData() {
  try {
    console.log('开始从飞书获取数据...');
    
    // 获取访问令牌
    const token = await getFeishuToken();
    
    // 获取各个表格的数据
    const [courses, characters, words, sentences] = await Promise.all([
      getSheetData(token, FEISHU_SPREADSHEET_TOKEN, 'Courses'),
      getSheetData(token, FEISHU_SPREADSHEET_TOKEN, 'Characters'),
      getSheetData(token, FEISHU_SPREADSHEET_TOKEN, 'Words'),
      getSheetData(token, FEISHU_SPREADSHEET_TOKEN, 'Sentences')
    ]);
    
    // 组合数据
    const appData = {
      lastUpdated: new Date().toISOString(),
      courses,
      characters,
      words,
      sentences
    };
    
    // 写入JSON文件
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(appData, null, 2));
    console.log(`数据已获取并保存到 ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('获取数据失败:', error);
    process.exit(1);
  }
}

fetchAndConvertData();
