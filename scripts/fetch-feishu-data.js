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
const SHEET_NAMES = ['Courses', 'Characters', 'Words', 'Sentences'];

// 创建 axios 实例
const feishuAPI = axios.create({
  baseURL: 'https://open.feishu.cn/open-apis',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json; charset=utf-8'
  }
});

// 获取飞书访问令牌
async function getFeishuToken() {
  try {
    const response = await feishuAPI.post('/auth/v3/tenant_access_token/internal', {
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET
    });
    
    if (response.data.code !== 0) {
      throw new Error(`获取飞书令牌失败: ${response.data.msg}`);
    }
    
    return response.data.tenant_access_token;
  } catch (error) {
    console.error('获取飞书令牌错误:', error.message);
    throw error;
  }
}

// 获取工作表数据
async function getSheetData(token, spreadsheetToken, sheetName) {
  try {
    console.log(`正在获取工作表 ${sheetName} 的数据...`);
    
    // 获取工作表范围数据
    const response = await feishuAPI.get(`/sheets/v2/spreadsheets/${spreadsheetToken}/values/${sheetName}!A1:Z3000`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.data.code !== 0) {
      throw new Error(`获取工作表数据失败: ${response.data.msg}`);
    }
    
    const rows = response.data.data.values || [];
    if (rows.length < 2) {
      console.warn(`警告: 工作表 ${sheetName} 数据为空或只有表头`);
      return [];
    }
    
    const headers = rows[0];
    const data = rows.slice(1).map(row => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = row[index] || '';
      });
      return item;
    }).filter(item => Object.values(item).some(v => v !== ''));
    
    console.log(`工作表 ${sheetName} 数据获取成功:`, {
      总行数: rows.length,
      有效数据行: data.length
    });
    
    return data;
  } catch (error) {
    if (error.response?.status === 404) {
      console.error(`工作表 ${sheetName} 不存在`);
      return [];
    }
    throw error;
  }
}

// 主函数
async function fetchAndConvertData() {
  try {
    console.log('开始从飞书获取数据...');
    console.log('使用的电子表格 Token:', FEISHU_SPREADSHEET_TOKEN);
    
    const token = await getFeishuToken();
    console.log('成功获取访问令牌');
    
    const results = {};
    
    // 串行获取数据以避免并发问题
    for (const sheetName of SHEET_NAMES) {
      const data = await getSheetData(token, FEISHU_SPREADSHEET_TOKEN, sheetName);
      results[sheetName.toLowerCase()] = data;
    }
    
    // 验证数据
    const hasData = Object.values(results).some(arr => arr.length > 0);
    if (!hasData) {
      throw new Error('所有工作表都没有获取到有效数据');
    }
    
    const appData = {
      lastUpdated: new Date().toISOString(),
      courses: results.courses || [],
      characters: results.characters || [],
      words: results.words || [],
      sentences: results.sentences || []
    };
    
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(appData, null, 2));
    console.log(`数据已保存到: ${OUTPUT_FILE}`);
    console.log('数据统计:', {
      课程: appData.courses.length,
      汉字: appData.characters.length,
      词语: appData.words.length,
      句子: appData.sentences.length
    });
  } catch (error) {
    console.error('数据同步失败:', error.message);
    if (error.response) {
      console.error('API 错误详情:', {
        状态码: error.response.status,
        响应数据: error.response.data
      });
    }
    process.exit(1);
  }
}

fetchAndConvertData();
