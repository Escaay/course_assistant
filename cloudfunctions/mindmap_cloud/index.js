const express = require('express');
const bodyParser = require('body-parser');
const { Transformer } = require('markmap-lib');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
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
  let browser = null;
  
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
    
    // 简化HTML，减少外部依赖
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          width: 2400px;
          height: 1800px;
          margin: 0;
          padding: 0;
          background-color: white;
        }
        #markmap {
          width: 100%;
          height: 100%;
          background-color: white;
        }
      </style>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/markmap-view@0.14.4/dist/style.css">
    </head>
    <body>
      <svg id="markmap" style="width: 100%; height: 100%"></svg>
      <script src="https://cdn.jsdelivr.net/npm/d3@6.7.0"></script>
      <script src="https://cdn.jsdelivr.net/npm/markmap-view@0.14.4/dist/index.min.js"></script>
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
    
    // 增加启动参数和超时设置
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: {
        width: 2400,
        height: 1800
      },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      timeout: 60000 // 增加超时时间到60秒
    });
    
    const page = await browser.newPage();
    
    // 设置更长的超时时间
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(60000);
    
    // 设置内容并等待，使用更简单的等待条件
    await page.setContent(html, { 
      waitUntil: ['load', 'domcontentloaded'],
      timeout: 60000
    });
    
    console.log('页面内容已设置，等待渲染...');
    
    // 等待思维导图渲染完成
    await page.waitForSelector('#markmap', { timeout: 30000 });
    
    // 增加等待时间确保渲染完成
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('开始截图...');
    
    // 截图
    const imageBuffer = await page.screenshot({ 
      type: 'png',
      fullPage: true,
    });
    
    await browser.close();
    browser = null;
    const base64Image = Buffer.from(imageBuffer).toString('base64'); // 显式转换
    console.log(`图片生成成功，大小: ${imageBuffer.length} 字节`);
    res.json({ image: base64Image });
  } catch (err) {
    console.error('生成思维导图时发生错误:', err);
    
    // 尝试强制截图
    if (browser) {
      try {
        console.log('尝试强制截图...');
        const page = (await browser.pages())[0];
        if (page) {
          const imageBuffer = await page.screenshot({ 
            type: 'png',
            fullPage: true
          });
          await browser.close();
          const base64Image = Buffer.from(imageBuffer).toString('base64'); // 显式转换
          console.log(`强制截图成功，大小: ${imageBuffer.length} 字节`);
          return res.json({ image: base64Image });
        }
      } catch (screenshotErr) {
        console.error('强制截图失败:', screenshotErr);
      } finally {
        if (browser) {
          await browser.close().catch(e => console.error('关闭浏览器失败:', e));
        }
      }
    }
    
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