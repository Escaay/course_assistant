const cloud = require('wx-server-sdk');
const { Transformer } = require('markmap-lib');
const { fillTemplate } = require('markmap-render');

cloud.init({
  env: "cloud1-6gvmnnngc2e558b1" // 使用您的云环境ID
});

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    const { markdown } = event;
    
    if (!markdown) {
      return {
        success: false,
        error: '未提供Markdown内容'
      };
    }
    
    // 生成思维导图
    const transformer = new Transformer();
    const { root, features } = transformer.transform(markdown);
    const assets = transformer.getUsedAssets(features);
    
    // 自定义 URL 构建器，使用CDN
    const customUrlBuilder = {
      getFullUrl: (path) => {
        return `https://cdn.jsdelivr.net/npm/${path}`;
      }
    };
    
    // 生成完整的HTML文件，包含自动加载器
    const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="ie=edge">
  <title>思维导图</title>
  <style>
    * {
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    }
    .markmap {
      width: 100%;
      height: 100vh;
    }
    .markmap > svg {
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
  <div class="markmap">
    <script type="text/template">
${markdown}
    </script>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/markmap-autoloader@latest"></script>
</body>
</html>`;

    // 生成唯一文件名
    const fileName = `mindmap_${Date.now()}.html`;
    
    // 将HTML内容上传到云存储
    const uploadResult = await cloud.uploadFile({
      cloudPath: fileName,
      fileContent: Buffer.from(html),
    });
    
    if (!uploadResult.fileID) {
      return {
        success: false,
        error: '上传文件失败'
      };
    }
    
    // 获取文件的临时访问URL
    const tempUrlResult = await cloud.getTempFileURL({
      fileList: [uploadResult.fileID]
    });
    
    if (!tempUrlResult.fileList || tempUrlResult.fileList.length === 0) {
      return {
        success: false,
        error: '获取临时访问URL失败'
      };
    }
    
    const fileUrl = tempUrlResult.fileList[0].tempFileURL;
    
    return {
      success: true,
      fileID: uploadResult.fileID,
      fileUrl: fileUrl
    };
  } catch (error) {
    console.error('云函数执行出错:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}; 