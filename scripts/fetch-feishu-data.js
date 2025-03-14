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

// 工作表名称配置
const SHEET_NAMES = {
  courses: 'Courses',
  characters: 'Characters',
  words: 'Words',
  sentences: 'Sentences'
};

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

// 获取所有工作表信息
async function getSheetList(token, spreadsheetToken) {
  try {
    console.log('正在获取工作表列表...');
    const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/sheets`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.code !== 0) {
      throw new Error(`获取工作表列表失败: ${response.data.msg}`);
    }

    const sheets = response.data.data.sheets;
    console.log('获取到的工作表:', sheets.map(s => s.title).join(', '));
    return sheets;
  } catch (error) {
    console.error('获取工作表列表错误:', error);
    throw error;
  }
}

// 从飞书表格获取数据
async function getSheetData(token, spreadsheetToken, sheetId, sheetName) {
  try {
    console.log(`正在获取表格数据: ${sheetName} (sheet_id: ${sheetId})`);
    
    const requestHeaders = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    const url = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${spreadsheetToken}/values/${sheetId}!A1:Z3000`;
    console.log(`获取表格数据: ${url}`);
    
    const response = await axios.get(url, { headers: requestHeaders });
    
    if (response.data.code !== 0) {
      console.error('API 响应错误:', response.data);
      throw new Error(`获取表格数据失败: ${response.data.msg}`);
    }
    
    const rows = response.data.data.values;
    if (!rows || rows.length < 2) {
      console.warn(`警告: 表格 ${sheetName} 数据为空或只有表头`);
      return [];
    }
    
    const columnHeaders = rows[0];
    console.log(`表格 ${sheetName} 的列头:`, columnHeaders);
    
    if (columnHeaders.length === 0) {
      throw new Error(`表格 ${sheetName} 没有列头`);
    }
    
    const result = rows.slice(1).map(row => {
      const item = {};
      columnHeaders.forEach((header, colIndex) => {
        item[header] = row[colIndex] || '';
      });
      return item;
    }).filter(item => Object.values(item).some(value => value !== ''));
    
    console.log(`表格 ${sheetName} 数据统计:`, {
      总行数: rows.length,
      有效数据行: result.length,
      列数: columnHeaders.length
    });
    
    return result;
  } catch (error) {
    console.error(`获取表格 ${sheetName} 数据错误:`, error);
    console.error('完整错误信息:', JSON.stringify(error.response?.data || error.message, null, 2));
    throw error;
  }
}

// 主函数
async function fetchAndConvertData() {
  try {
    console.log('开始从飞书获取数据...');
    
    const token = await getFeishuToken();
    console.log('成功获取飞书访问令牌');
    
    // 获取所有工作表信息
    const sheets = await getSheetList(token, FEISHU_SPREADSHEET_TOKEN);
    const sheetsMap = new Map(sheets.map(s => [s.title, s.sheet_id]));
    
    // 验证所需的工作表是否都存在
    for (const [key, name] of Object.entries(SHEET_NAMES)) {
      if (!sheetsMap.has(name)) {
        throw new Error(`找不到工作表: ${name}`);
      }
    }
    
    // 获取各个表格的数据
    const [courses, characters, words, sentences] = await Promise.all([
      getSheetData(token, FEISHU_SPREADSHEET_TOKEN, sheetsMap.get(SHEET_NAMES.courses), SHEET_NAMES.courses),
      getSheetData(token, FEISHU_SPREADSHEET_TOKEN, sheetsMap.get(SHEET_NAMES.characters), SHEET_NAMES.characters),
      getSheetData(token, FEISHU_SPREADSHEET_TOKEN, sheetsMap.get(SHEET_NAMES.words), SHEET_NAMES.words),
      getSheetData(token, FEISHU_SPREADSHEET_TOKEN, sheetsMap.get(SHEET_NAMES.sentences), SHEET_NAMES.sentences)
    ]);
    
    if (!courses.length && !characters.length && !words.length && !sentences.length) {
      throw new Error('所有表格都没有获取到数据');
    }
    
    const appData = {
      lastUpdated: new Date().toISOString(),
      courses,
      characters,
      words,
      sentences
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(appData, null, 2));
    console.log(`数据已获取并保存到 ${OUTPUT_FILE}`);
    console.log('数据统计:', {
      课程: courses.length,
      汉字: characters.length,
      词语: words.length,
      句子: sentences.length
    });
  } catch (error) {
    console.error('获取数据失败:', error);
    process.exit(1);
  }
}

fetchAndConvertData();
