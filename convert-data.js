const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// 输入和输出文件路径
const INPUT_DIR = path.join(__dirname, '../data/input');
const OUTPUT_FILE = path.join(__dirname, '../data/output/app-data.json');

// 确保输出目录存在
if (!fs.existsSync(path.dirname(OUTPUT_FILE))) {
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
}

// 读取Excel文件
function readExcel(filePath, sheetName) {
  console.log(`读取文件: ${filePath}`);
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet);
}

// 主函数
function convertData() {
  try {
    // 读取各个表格数据
    const courses = readExcel(path.join(INPUT_DIR, 'courses.xlsx'));
    const characters = readExcel(path.join(INPUT_DIR, 'characters.xlsx'));
    const words = readExcel(path.join(INPUT_DIR, 'words.xlsx'));
    const sentences = readExcel(path.join(INPUT_DIR, 'sentences.xlsx'));

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
    console.log(`数据已转换并保存到 ${OUTPUT_FILE}`);
  } catch (error) {
    console.error('转换数据失败:', error);
    process.exit(1);
  }
}

convertData();
