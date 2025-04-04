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
    let content = req.body.content;
    
    if (!content) {
      console.log('请求缺少content字段');
      return res.status(400).json({ error: 'Content is required' });
    }

    // 预处理Markdown内容，转换不支持的代码块
    content = preprocessMarkdown(content);

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
      timeout: 200000 // 这里只是浏览器启动的超时时间
    });
    
    const page = await browser.newPage();
    
    // 设置更长的超时时间
    page.setDefaultNavigationTimeout(200000); // 修改为200秒
    page.setDefaultTimeout(200000); // 修改为200秒
    
    // 设置内容并等待，使用更简单的等待条件
    await page.setContent(html, { 
      waitUntil: ['load', 'domcontentloaded'],
      timeout: 200000 // 修改为200秒
    });
    
    console.log('页面内容已设置，等待渲染...');
    
    // 等待思维导图渲染完成
    await page.waitForSelector('#markmap', { timeout: 200000 }); // 修改为200秒
    
    // 增加等待时间确保渲染完成
    await new Promise(resolve => setTimeout(resolve, 5000)); // 可以适当增加等待时间
    
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

// 预处理Markdown函数
function preprocessMarkdown(markdown) {
  // 处理yuml代码块
  markdown = markdown.replace(/```yuml[\s\S]*?```/g, (match) => {
    // 提取yuml内容
    const yumlContent = match.replace(/```yuml\n|```$/g, '');
    // 将yuml转换为文本描述
    return '**流程图描述**:\n- ' + yumlContent
      .split('\n')
      .filter(line => !line.startsWith('//') && line.trim() !== '')
      .map(line => {
        // 简单处理yuml语法，提取关系
        const parts = line.match(/\[(.*?)\]\s*(-+>)\s*\[(.*?)\]/);
        if (parts) {
          return `${parts[1]} 到 ${parts[3]}`;
        }
        return line;
      })
      .join('\n- ');
  });

  // 处理echarts代码块
  markdown = markdown.replace(/```echarts[\s\S]*?```/g, (match) => {
    try {
      // 提取echarts JSON内容
      const jsonStr = match.replace(/```echarts\n|\n```$/g, '');
      const chartData = JSON.parse(jsonStr);
      
      let result = '**图表数据**:\n';
      
      // 处理饼图
      if (chartData.series && chartData.series[0] && chartData.series[0].type === 'pie') {
        result += `- 图表标题: ${chartData.title?.text || '未命名'}\n`;
        if (chartData.title?.subtext) {
          result += `- 副标题: ${chartData.title.subtext}\n`;
        }
        result += '- 数据项:\n';
        
        chartData.series[0].data.forEach(item => {
          result += `  - ${item.name}: ${item.value}\n`;
        });
      }
      // 处理柱状图
      else if (chartData.series && chartData.series[0] && chartData.series[0].type === 'bar') {
        result += `- 图表类型: 柱状图\n`;
        if (chartData.xAxis && chartData.xAxis.data) {
          result += '- 数据项:\n';
          chartData.xAxis.data.forEach((category, index) => {
            const value = chartData.series[0].data[index] || '无数据';
            result += `  - ${category}: ${value}\n`;
          });
        }
      }
      // 其他类型图表的通用处理
      else {
        result += `- 图表类型: ${chartData.series?.[0]?.type || '未知'}\n`;
        result += `- 图表内容: 包含复杂数据结构，已简化显示\n`;
      }
      
      return result;
    } catch (e) {
      console.error('处理echarts代码块时出错:', e);
      return '**图表数据**: (解析错误，无法显示)';
    }
  });

  // 处理数学公式，确保它们能正确显示
  // markmap通常支持基本的LaTeX语法，但可能需要调整格式
  markdown = markdown.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
    return `**数学公式**: \`${formula.trim()}\``;
  });

  // 处理行内公式
  markdown = markdown.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
    return `\`${formula.trim()}\``;
  });

  return markdown;
}

// 健康检查端点
app.get('/', (req, res) => {
  res.send('思维导图生成服务正常运行');
});

// 启动服务器
const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
  console.log(`思维导图生成服务已启动，监听端口: ${PORT}`);
});