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

// 获取工作表信息
async function getSheetInfo(token, spreadsheetToken) {
  try {
    const response = await feishuAPI.get(`/sheets/v3/spreadsheets/${spreadsheetToken}/sheets`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.data.code !== 0) {
      throw new Error(`获取工作表信息失败: ${response.data.msg}`);
    }

    const sheets = response.data.data.sheets;
    console.log('获取到的工作表列表:', sheets.map(s => ({ title: s.title, id: s.sheet_id })));
    
    return sheets.reduce((acc, sheet) => {
      acc[sheet.title] = sheet.sheet_id;
      return acc;
    }, {});
  } catch (error) {
    console.error('获取工作表信息错误:', error.message);
    throw error;
  }
}

// 处理表格数据
function processSheetData(valueRange) {
  if (!valueRange || !valueRange.values || valueRange.values.length < 2) {
    return [];
  }

  const headers = valueRange.values[0];
  return valueRange.values.slice(1)
    .map(row => {
      const item = {};
      headers.forEach((header, index) => {
        item[header] = row[index] || '';
      });
      return item;
    })
    .filter(item => Object.values(item).some(v => v !== ''));
}

// 主函数
async function fetchAndConvertData() {
  try {
    console.log('开始从飞书获取数据...');
    
    const token = await getFeishuToken();
    console.log('成功获取访问令牌');
    
    // 获取工作表信息
    const sheetsInfo = await getSheetInfo(token, FEISHU_SPREADSHEET_TOKEN);
    console.log('工作表映射:', sheetsInfo);
    
    // 构建批量读取范围
    const ranges = Object.entries(SHEET_NAMES).map(([key, name]) => {
      const sheetId = sheetsInfo[name];
      if (!sheetId) {
        throw new Error(`找不到工作表: ${name}`);
      }
      return `${sheetId}!A1:Z3000`;
    });

    // 使用批量读取接口获取所有工作表数据
    const response = await feishuAPI.get(`/sheets/v3/spreadsheets/${FEISHU_SPREADSHEET_TOKEN}/values_batch_get`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        ranges: ranges.join(',')
      }
    });

    if (response.data.code !== 0) {
      throw new Error(`获取表格数据失败: ${response.data.msg}`);
    }

    const valueRanges = response.data.data.valueRanges;
    console.log('成功获取所有工作表数据');

    // 处理每个工作表的数据
    const appData = {
      lastUpdated: new Date().toISOString(),
      courses: processSheetData(valueRanges[0]),
      characters: processSheetData(valueRanges[1]),
      words: processSheetData(valueRanges[2]),
      sentences: processSheetData(valueRanges[3])
    };

    // 验证数据
    const hasData = Object.values(appData).some(arr => 
      Array.isArray(arr) && arr.length > 0
    );

    if (!hasData) {
      throw new Error('所有工作表都没有获取到有效数据');
    }

    // 保存数据
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
