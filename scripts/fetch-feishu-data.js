/**
 * 获取工作表信息 - 使用v3版本API
 * @param {string} token 访问令牌
 * @param {string} spreadsheetToken 电子表格ID
 * @returns {Promise<Object>} 工作表名称到ID的映射
 */
async function getSheetInfo(token, spreadsheetToken) {
  try {
    console.log(`正在获取电子表格(${spreadsheetToken})的工作表信息...`);
    
    // 使用v3版本API获取工作表信息
    const response = await feishuAPI.get(`/sheets/v3/spreadsheets/${spreadsheetToken}/sheets`, {
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
    
    return sheetMap;
  } catch (error) {
    console.error('获取工作表信息错误:', error.message);
    if (error.response) {
      console.error('API 响应详情:', error.response);
    }
    throw error;
  }
}

/**
 * 批量获取表格数据 - 使用v2版本API
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

    // 使用v2版本API获取数据
    const response = await feishuAPI.get(
      `/sheets/v2/spreadsheets/${spreadsheetToken}/values_batch_get`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        params: {
          ranges: rangesParam,
          valueRenderOption: 'FormattedValue',
          dateTimeRenderOption: 'FormattedString'
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
      console.error('API 响应详情:', error.response);
    }
    throw error;
  }
}
