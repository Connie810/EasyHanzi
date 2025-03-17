/**
 * 飞书表格数据同步脚本
 * 
 * 功能：
 * 1. 从飞书表格获取课程、汉字、词语、句子数据
 * 2. 处理并验证数据
 * 3. 将数据上传到阿里云OSS
 * 
 * 依赖：
 * - axios: HTTP请求
 * - ali-oss: 阿里云OSS客户端
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const OSS = require('ali-oss');

// 本地输出文件路径
const OUTPUT_DIR = path.join(__dirname, '../data/output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'app-data.json');

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 飞书 API 配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const FEISHU_SPREADSHEET_TOKEN = process.env.FEISHU_SPREADSHEET_TOKEN;

// 阿里云 OSS 配置
const OSS_ACCESS_KEY_ID = process.env.OSS_ACCESS_KEY_ID;
const OSS_ACCESS_KEY_SECRET = process.env.OSS_ACCESS_KEY_SECRET;
const OSS_BUCKET = process.env.OSS_BUCKET;
const OSS_REGION = process.env.OSS_REGION || 'oss-cn-hangzhou';
// 设置固定的文件路径，不再依赖环境变量
const OSS_FILE_PATH = 'data/app-data.json';

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
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json; charset=utf-8'
  }
});

/**
 * 获取飞书访问令牌
 * @returns {Promise<string>} 访问令牌
 */
async function getFeishuToken() {
  try {
    console.log('正在获取飞书访问令牌...');
    
    // 检查环境变量
    if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
      throw new Error('缺少飞书应用凭证，请检查环境变量 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
    }
    
    // 请求访问令牌
    const response = await feishuAPI.post('/auth/v3/tenant_access_token/internal', {
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET
    });
    
    // 检查响应
    if (response.data.code !== 0) {
      throw new Error(`获取飞书令牌失败: ${response.data.msg} (错误码: ${response.data.code})`);
    }
    
    console.log('成功获取飞书访问令牌');
    return response.data.tenant_access_token;
  } catch (error) {
    console.error('获取飞书令牌错误:', error.message);
    if (error.response) {
      console.error('API 响应详情:', {
        状态码: error.response.status,
        响应数据: JSON.stringify(error.response.data, null, 2)
      });
    }
    throw error;
  }
}

/**
 * 获取工作表信息
 * @param {string} token 访问令牌
 * @param {string} spreadsheetToken 电子表格ID
 * @returns {Promise<Object>} 工作表名称到ID的映射
 */
async function getSheetInfo(token, spreadsheetToken) {
  try {
    console.log(`正在获取电子表格(${spreadsheetToken})的工作表信息...`);
    
    // 检查参数
    if (!token || !spreadsheetToken) {
      throw new Error('缺少访问令牌或电子表格ID');
    }
    
    // 请求工作表信息 - 使用正确的API路径
    const response = await feishuAPI.get(`/sheets/v3/spreadsheets/${spreadsheetToken}/sheets/query`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    // 检查响应
    if (response.data.code !== 0) {
      throw new Error(`获取工作表信息失败: ${response.data.msg} (错误码: ${response.data.code})`);
    }

    const sheets = response.data.data.sheets;
    console.log('获取到的工作表列表:', sheets.map(s => ({ 标题: s.title, ID: s.sheet_id })));
    
    // 创建工作表名称到ID的映射
    const sheetMap = sheets.reduce((acc, sheet) => {
      acc[sheet.title] = sheet.sheet_id;
      return acc;
    }, {});
    
    // 验证所需的工作表是否都存在
    for (const [key, name] of Object.entries(SHEET_NAMES)) {
      if (!sheetMap[name]) {
        throw new Error(`找不到必需的工作表: ${name}`);
      }
    }
    
    return sheetMap;
  } catch (error) {
    console.error('获取工作表信息错误:', error.message);
    if (error.response) {
      console.error('API 响应详情:', {
        状态码: error.response.status,
        响应数据: JSON.stringify(error.response.data, null, 2)
      });
    }
    throw error;
  }
}

/**
 * 批量获取表格数据
 * @param {string} token 访问令牌
 * @param {string} spreadsheetToken 电子表格ID
 * @param {Object} sheetsInfo 工作表信息
 * @returns {Promise<Array>} 表格数据数组
 */
async function batchGetSheetData(token, spreadsheetToken, sheetsInfo) {
  try {
    console.log('正在批量获取表格数据...');
    
    // 构建批量读取范围
    const ranges = Object.entries(SHEET_NAMES).map(([key, name]) => {
      const sheetId = sheetsInfo[name];
      // 使用工作表ID，格式为 sheetId!A1:Z3000
      return `${sheetId}!A1:Z3000`;
    });

    // 将ranges数组转换为逗号分隔的字符串
    const rangesParam = ranges.join(',');
    
    console.log('请求范围:', rangesParam);

    // 使用GET方法和查询参数获取数据
    const response = await feishuAPI.get(
      `/sheets/v2/spreadsheets/${spreadsheetToken}/values_batch_get`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          ranges: rangesParam,
          valueRenderOption: 'FormattedValue', // 计算并格式化单元格
          dateTimeRenderOption: 'FormattedString' // 日期时间格式化为字符串
        }
      }
    );

    if (response.data.code !== 0) {
      throw new Error(`获取表格数据失败: ${response.data.msg} (错误码: ${response.data.code})`);
    }

    console.log('成功获取所有工作表数据');
    return response.data.data.valueRanges;
  } catch (error) {
    console.error('批量获取表格数据错误:', error.message);
    if (error.response) {
      console.error('API 响应详情:', {
        状态码: error.response.status,
        响应数据: JSON.stringify(error.response.data, null, 2)
      });
    }
    throw error;
  }
}

/**
 * 处理表格数据
 * @param {Object} valueRange 表格数据范围
 * @returns {Array} 处理后的数据数组
 */
function processSheetData(valueRange) {
  // 检查数据有效性
  if (!valueRange || !valueRange.values || valueRange.values.length < 2) {
    console.warn(`工作表 ${valueRange.range} 数据不足或格式不正确`);
    return [];
  }

  // 提取表头和数据行
  const headers = valueRange.values[0];
  const rows = valueRange.values.slice(1);
  
  // 转换为对象数组
  const processedData = rows
    .map((row, rowIndex) => {
      const item = {};
      headers.forEach((header, index) => {
        if (header && header.trim()) {
          const value = index < row.length ? row[index] : '';
          
          // 处理icon字段的超链接数据
          if (header === 'icon') {
            console.log(`处理第 ${rowIndex + 1} 行的 icon 数据:`, JSON.stringify(value));
            if (value && typeof value === 'object') {
              // 优先使用 link，如果 link 为空则使用 text
              item[header] = value[0]?.link || value[0]?.text || '';
            } else {
              item[header] = value || '';
            }
            console.log(`处理结果:`, item[header]);
          } else {
            item[header] = value || '';
          }
        }
      });
      return item;
    })
    .filter(item => Object.values(item).some(v => v !== ''));

  console.log(`工作表 ${valueRange.range} 处理完成，共 ${processedData.length} 条数据`);
  return processedData;
}

/**
 * 上传数据到阿里云OSS
 * @param {Object} data 要上传的数据
 * @returns {Promise<Object>} 上传结果
 */
async function uploadToOSS(data) {
  try {
    console.log('===== OSS上传开始 =====');
    console.log('检查OSS配置...');
    
    // 检查OSS配置
    if (!OSS_ACCESS_KEY_ID) {
      console.error('缺少 OSS_ACCESS_KEY_ID 环境变量');
      throw new Error('缺少 OSS_ACCESS_KEY_ID 环境变量');
    }
    if (!OSS_ACCESS_KEY_SECRET) {
      console.error('缺少 OSS_ACCESS_KEY_SECRET 环境变量');
      throw new Error('缺少 OSS_ACCESS_KEY_SECRET 环境变量');
    }
    if (!OSS_BUCKET) {
      console.error('缺少 OSS_BUCKET 环境变量');
      throw new Error('缺少 OSS_BUCKET 环境变量');
    }
    
    console.log('OSS配置检查通过');
    console.log(`区域: ${OSS_REGION}`);
    console.log(`存储桶: ${OSS_BUCKET}`);
    console.log(`文件路径: ${OSS_FILE_PATH}`);
    
    // 创建OSS客户端
    const client = new OSS({
      region: OSS_REGION,
      accessKeyId: OSS_ACCESS_KEY_ID,
      accessKeySecret: OSS_ACCESS_KEY_SECRET,
      bucket: OSS_BUCKET,
    });
    
    // 将数据转换为JSON字符串
    const content = JSON.stringify(data, null, 2);
    console.log(`数据大小: ${content.length} 字节`);
    
    // 上传到OSS
    console.log(`正在上传数据到 ${OSS_BUCKET}/${OSS_FILE_PATH}...`);
    const result = await client.put(OSS_FILE_PATH, Buffer.from(content));
    
    console.log('OSS上传成功!');
    console.log(`URL: ${result.url}`);
    console.log('===== OSS上传完成 =====');
    return result;
  } catch (error) {
    console.error('===== OSS上传失败 =====');
    console.error(`错误信息: ${error.message}`);
    console.error(`错误堆栈: ${error.stack}`);
    if (error.code) {
      console.error(`OSS错误代码: ${error.code}`);
    }
    throw error;
  }
}

/**
 * 主函数：获取数据并上传到OSS
 */
async function fetchAndUploadData() {
  try {
    console.log('=== 开始数据同步流程 ===');
    console.log('时间:', new Date().toLocaleString());
    
    // 1. 获取飞书访问令牌
    const token = await getFeishuToken();
    
    // 2. 获取工作表信息
    const sheetsInfo = await getSheetInfo(token, FEISHU_SPREADSHEET_TOKEN);
    
    // 3. 批量获取表格数据
    const valueRanges = await batchGetSheetData(token, FEISHU_SPREADSHEET_TOKEN, sheetsInfo);
    
    // 4. 处理数据
    const appData = {
      lastUpdated: new Date().toISOString(),
      courses: processSheetData(valueRanges[0]),
      characters: processSheetData(valueRanges[1]),
      words: processSheetData(valueRanges[2]),
      sentences: processSheetData(valueRanges[3])
    };

    // 5. 验证数据
    const dataStats = {
      课程: appData.courses.length,
      汉字: appData.characters.length,
      词语: appData.words.length,
      句子: appData.sentences.length
    };
    
    console.log('数据统计:', dataStats);
    
    const hasData = Object.values(dataStats).some(count => count > 0);
    if (!hasData) {
      throw new Error('所有工作表都没有获取到有效数据，请检查表格内容');
    }

    // 6. 保存到本地文件
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(appData, null, 2));
    console.log(`数据已保存到本地: ${OUTPUT_FILE}`);
    
    // 7. 上传到阿里云OSS
    await uploadToOSS(appData);
    
    console.log('=== 数据同步流程完成 ===');
  } catch (error) {
    console.error('数据同步失败:', error.message);
    process.exit(1);
  }
}

// 执行主函数
fetchAndUploadData();
