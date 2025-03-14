const fs = require('fs');
const path = require('path');
const OSS = require('ali-oss');

// 输入文件路径
const INPUT_FILE = path.join(__dirname, '../data/output/app-data.json');

// OSS 配置
const ossClient = new OSS({
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
});

// 上传到 OSS
async function uploadToOSS() {
  try {
    if (!fs.existsSync(INPUT_FILE)) {
      throw new Error(`文件不存在: ${INPUT_FILE}`);
    }

    const fileContent = fs.readFileSync(INPUT_FILE);
    const result = await ossClient.put('app-data.json', fileContent);
    
    console.log('上传成功:', result.url);
  } catch (error) {
    console.error('上传失败:', error);
    process.exit(1);
  }
}

uploadToOSS();
