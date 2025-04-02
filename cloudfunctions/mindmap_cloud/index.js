const express = require('express');
const bodyParser = require('body-parser');
const { Transformer } = require('markmap-lib');
const puppeteer = require('puppeteer-core'); // 改为使用 puppeteer-core
const chromium = require('@sparticuz/chromium'); // 添加 @sparticuz/chromium
const fs = require('fs');

// 创建 Express 应用
const app = express();

// 使用中间件
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// 允许跨域请求
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 思维导图生成API
app.post('/generate-mindmap', async (req, res) => {
  console.log('收到生成思维导图请求');
  
  try {
    const content = req.body.content;
    
    if (!content) {
      console.log('请求缺少content字段');
      return res.status(400).json({ error: 'Content is required' });
    }

    console.log('开始转换Markdown内容...');
    const transformer = new Transformer();
    const { root, features } = transformer.transform(content);
    
    console.log('Markdown转换完成，开始构建HTML...');
    
    // 手动构建资源列表
    const assets = {
      styles: [
        'https://cdn.jsdelivr.net/npm/markmap-toolbar@0.14.4/dist/style.css',
        'https://cdn.jsdelivr.net/npm/markmap-view@0.14.4/dist/style.css'
      ],
      scripts: [
        'https://cdn.jsdelivr.net/npm/d3@6.7.0',
        'https://cdn.jsdelivr.net/npm/markmap-view@0.14.4/dist/index.min.js',
        'https://cdn.jsdelivr.net/npm/markmap-toolbar@0.14.4/dist/index.umd.min.js'
      ]
    };

    // 手动构建HTML
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body, #markmap {
          width: 2400px;
          height: 1800px;
          margin: 0;
          padding: 0;
        }
      </style>
      ${assets.styles.map(src => `<link rel="stylesheet" href="${src}">`).join('\n')}
    </head>
    <body>
      <svg id="markmap" style="width: 100%; height: 100%"></svg>
      ${assets.scripts.map(src => `<script src="${src}"></script>`).join('\n')}
      <script>
        (function() {
          const root = ${JSON.stringify(root)};
          const mm = markmap.Markmap.create('#markmap', {
            autoFit: true,
            duration: 0,
            maxInitialScale: 5
          }, root);
        })();
      </script>
    </body>
    </html>
    `;

    console.log('HTML构建完成，开始生成图片...');
    
    // 使用 @sparticuz/chromium 替代 SCF 环境中的 Puppeteer
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    // 等待思维导图渲染完成
    await page.waitForSelector('#markmap');
    
    // 使用 setTimeout 替代 waitForTimeout
    await new Promise(resolve => setTimeout(resolve, 1000)); // 额外等待一秒确保渲染完成
    
    // 截图
    const imageBuffer = await page.screenshot({ 
      type: 'png',
      fullPage: true
    });
    
    await browser.close();
    const base64Image = Buffer.from(imageBuffer).toString('base64'); // 显式转换
    console.log(`图片生成成功，大小: ${imageBuffer.length} 字节`);
    res.json({ image: base64Image });
  } catch (err) {
    console.error('生成思维导图时发生错误:', err);
    res.status(500).json({ error: err.message });
  }
});

// 健康检查端点
app.get('/', (req, res) => {
  res.send('思维导图生成服务正常运行');
});

// 启动服务器
const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
  console.log(`思维导图生成服务已启动，监听端口: ${PORT}`);
});