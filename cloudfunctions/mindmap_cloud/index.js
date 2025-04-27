const express = require('express');
const bodyParser = require('body-parser');
const { Transformer } = require('markmap-lib');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');
const path = require('path');

// 在文件顶部添加本地 markmap-view 的引入
const markmapViewScript = fs.readFileSync(path.join(__dirname, './markmap-view.js'), 'utf8');

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
  console.log('==================== 开始生成思维导图 ====================');
  console.log(`请求时间: ${new Date().toISOString()}`);
  console.log(`请求内容长度: ${req.body.content ? req.body.content.length : 0} 字符`);
  let browser = null;
  
  try {
    let content = req.body.content;
    
    if (!content) {
      console.log('请求缺少content字段');
      return res.status(400).json({ error: 'Content is required' });
    }

    console.log('Markdown内容前50个字符预览:', content.substring(0, 50).replace(/\n/g, ' ') + '...');
    
    // 预处理Markdown内容，转换不支持的代码块
    console.log('开始预处理Markdown...');
    content = preprocessMarkdown(content);
    console.log('Markdown预处理完成，处理后长度:', content.length);

    console.log('开始转换Markdown内容为思维导图数据...');
    const transformer = new Transformer();
    const { root, features } = transformer.transform(content);
    console.log('Markdown转换完成，根节点信息:', {
      depth: getNodeDepth(root),
      childrenCount: root.children ? root.children.length : 0,
      features: Object.keys(features || {})
    });
    
    console.log('开始构建HTML...');
    
    // 修改 HTML 模板部分
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
        #debug {
          position: absolute;
          top: 10px;
          left: 10px;
          color: red;
          font-size: 24px;
          z-index: 1000;
        }
        .markmap{font:300 16px/20px sans-serif}
        .markmap-link{fill:none}
        .markmap-node>circle{cursor:pointer}
        .markmap-foreign{display:inline-block}
        .markmap-foreign a{color:#0097e6}
        .markmap-foreign a:hover{color:#00a8ff}
        .markmap-foreign code{background-color:#f0f0f0;border-radius:2px;color:#555;font-size:calc(1em - 2px)}
        .markmap-foreign :not(pre)>code{padding:.2em .4em}
        .markmap-foreign del{text-decoration:line-through}
        .markmap-foreign em{font-style:italic}
        .markmap-foreign strong{font-weight:bolder}
        .markmap-foreign mark{background:#ffeaa7}
        .markmap-foreign pre,.markmap-foreign pre[class*=language-]{margin:0;padding:.2em .4em}
      </style>
    </head>
    <body>
      <div id="debug">Debug: Loading...</div>
      <svg id="markmap" style="width: 100%; height: 100%"></svg>
      <script>
        // 错误收集
        window._errors = [];
        window.addEventListener('error', function(e) {
          window._errors.push({
            message: e.message,
            source: e.filename,
            lineno: e.lineno,
            colno: e.colno,
            time: new Date().toISOString()
          });
          console.error('捕获到错误:', e.message);
        });

        // 存储根数据
        window.rootData = ${JSON.stringify(root)};
        
        // 加载 D3
        async function initializeMarkmap() {
          const debug = document.getElementById('debug');
          try {
            debug.innerText = 'Debug: Loading D3...';
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js');
            
            debug.innerText = 'Debug: Loading Markmap...';
            // 直接注入本地的 markmap-view 脚本
            const script = document.createElement('script');
            script.textContent = ${JSON.stringify(markmapViewScript)};
            document.head.appendChild(script);
            
            debug.innerText = 'Debug: Creating Markmap...';
            if (typeof markmap === 'undefined') {
              throw new Error('Markmap library not loaded');
            }
            const mm = markmap.Markmap.create('#markmap', {
              autoFit: true,
              duration: 0,
              maxInitialScale: 5
            }, window.rootData);

            debug.innerText = 'Debug: Markmap created successfully';
          } catch (error) {
            console.error('Markmap initialization error:', error);
            debug.innerText = 'Debug: Error: ' + error.message;
            throw error;
          }
        }

        // 安全加载脚本
        function loadScript(url) {
          return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.async = false;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
          });
        }

        // 开始初始化
        initializeMarkmap().catch(error => {
          console.error('Failed to initialize markmap:', error);
        });
      </script>
    </body>
    </html>
    `;

    console.log('HTML构建完成，HTML大小:', html.length);
    console.log('开始启动浏览器...');
    
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
    
    console.log('浏览器启动成功，chromium版本:', await browser.version());
    const page = await browser.newPage();
    
    // 记录页面的console日志
    page.on('console', msg => {
      console.log(`页面Console.${msg.type()}: ${msg.text()}`);
    });
    
    // 记录页面错误
    page.on('pageerror', err => {
      console.error('页面JavaScript错误:', err.message);
    });
    
    // 记录请求失败
    page.on('requestfailed', request => {
      console.error(`页面资源加载失败: ${request.url()}, 原因: ${request.failure().errorText}`);
    });
    
    // 设置更长的超时时间
    console.log('设置页面超时时间为5分钟');
    page.setDefaultNavigationTimeout(300000); // 修改为5分钟
    page.setDefaultTimeout(300000); // 修改为5分钟
    
    // 设置内容并等待，使用更简单的等待条件
    console.log('开始设置页面内容...');
    const startTime = Date.now();
    await page.setContent(html, { 
      waitUntil: ['load', 'domcontentloaded', 'networkidle0'],
      timeout: 300000 // 修改为5分钟
    });
    
    console.log(`页面内容已设置，耗时: ${(Date.now() - startTime) / 1000}秒`);
    
    console.log('页面内容已设置，等待渲染...');
    
    // 等待思维导图渲染完成
    await page.waitForSelector('#markmap', { timeout: 300000 }); // 修改为5分钟
    
    // 先等待3秒钟，给脚本加载和执行的时间
    console.log('等待3秒钟让脚本加载和执行...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 递归检查思维导图是否渲染完成
    const checkMapRendered = async (maxAttempts = 8, currentAttempt = 1, waitTime = 2000) => {
      console.log(`检查思维导图渲染状态 (尝试 ${currentAttempt}/${maxAttempts})...`);
      
      // 检查思维导图是否已渲染
      const isMapRendered = await page.evaluate(() => {
        const svg = document.querySelector('#markmap');
        const hasNodes = svg && svg.querySelector('g') !== null;
        const debugElement = document.getElementById('debug');
        const debugInfo = debugElement ? debugElement.innerText : 'Debug element not found';
        
        // 检查markmap全局对象是否定义
        const markmapDefined = typeof window.markmap !== 'undefined';
        
        // 收集更多调试信息
        return { 
          hasNodes, 
          debugInfo,
          markmapDefined,
          nodeCount: svg ? svg.querySelectorAll('g').length : 0,
          svgHtml: svg ? svg.outerHTML.substring(0, 200) + '...' : 'No SVG',
          documentReady: document.readyState,
          scripts: Array.from(document.scripts).map(s => s.src),
          windowProp: Object.keys(window).filter(k => k.includes('mark') || k.includes('d3')),
          errors: window._errors || []
        };
      });
      
      console.log(`渲染状态 (尝试 ${currentAttempt}/${maxAttempts}):`);
      console.log(` - 有节点: ${isMapRendered.hasNodes}`);
      console.log(` - 节点数: ${isMapRendered.nodeCount}`);
      console.log(` - markmap已定义: ${isMapRendered.markmapDefined}`);
      console.log(` - 文档状态: ${isMapRendered.documentReady}`);
      console.log(` - 调试信息: "${isMapRendered.debugInfo}"`);
      console.log(` - 相关全局对象: ${isMapRendered.windowProp.join(', ')}`);
      
      // 如果已渲染或达到最大尝试次数，则返回
      if (isMapRendered.hasNodes && isMapRendered.nodeCount > 1) {
        console.log('思维导图已成功渲染');
        return true;
      }
      
      if (currentAttempt >= maxAttempts) {
        console.log(`达到最大尝试次数 (${maxAttempts})，停止等待`);
        console.log('SVG内容预览:', isMapRendered.svgHtml);
        console.log('已加载脚本:', isMapRendered.scripts);
        
        // 尝试进行诊断操作
        try {
          console.log('执行诊断操作...');
          await page.evaluate(() => {
            // 检查并记录页面资源
            const resources = performance.getEntriesByType('resource');
            const failedResources = resources.filter(r => r.responseEnd === 0);
            console.log('资源加载情况:', {
              total: resources.length,
              failed: failedResources.length,
              failedUrls: failedResources.map(r => r.name)
            });
            
            // 尝试重新加载markmap
            if (typeof markmap === 'undefined') {
              console.log('尝试重新加载markmap库...');
              const script = document.createElement('script');
              script.textContent = markmapViewScript;
              document.head.appendChild(script);
              console.log('通过内联脚本加载markmap-view');
            }
            
            // 检查DOM结构
            console.log('DOM结构检查:', {
              body: document.body ? 'OK' : 'Missing',
              markmap: document.querySelector('#markmap') ? 'OK' : 'Missing',
              debug: document.querySelector('#debug') ? 'OK' : 'Missing'
            });
          });
        } catch (diagErr) {
          console.error('诊断操作失败:', diagErr.message);
        }
        
        return false;
      }
      
      // 使用渐进式等待时间，但不超过4秒
      const nextWaitTime = Math.min(waitTime * 1.5, 4000);
      console.log(`思维导图尚未完全渲染，等待 ${nextWaitTime/1000} 秒后重试...`);
      await new Promise(resolve => setTimeout(resolve, nextWaitTime));
      
      // 递归调用
      return checkMapRendered(maxAttempts, currentAttempt + 1, nextWaitTime);
    };
    
    // 开始递归检查
    const renderResult = await checkMapRendered();
    
    // 如果渲染失败，尝试强制刷新页面
    if (!renderResult) {
      console.log('渲染检查失败，尝试刷新页面后重新截图...');
      try {
        // 重新加载页面
        await page.reload({ waitUntil: ['load', 'networkidle0'], timeout: 60000 });
        console.log('页面已刷新，等待3秒后继续...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 尝试强制执行脚本
        await page.evaluate(() => {
          console.log('尝试手动执行markmap创建...');
          try {
            if (typeof markmap !== 'undefined' && typeof window.rootData !== 'undefined') {
              console.log('手动创建markmap...');
              markmap.Markmap.create('#markmap', {
                autoFit: true,
                duration: 0,
                maxInitialScale: 5
              }, window.rootData);
              console.log('手动创建完成');
            } else {
              console.log('无法手动创建，markmap或数据不存在');
            }
          } catch (e) {
            console.error('手动创建失败:', e.message);
          }
        });
        
        console.log('再等待3秒后截图...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      } catch (refreshErr) {
        console.error('刷新页面失败:', refreshErr.message);
      }
    }
    
    console.log('开始截图...');
    const screenshotStartTime = Date.now();
    
    // 在截图前隐藏调试信息
    await page.evaluate(() => {
      const debugElement = document.getElementById('debug');
      if (debugElement) {
        debugElement.style.display = 'none';
      }
    });
    
    const imageBuffer = await page.screenshot({ 
      type: 'png',
      fullPage: true,
    });
    console.log(`截图完成，耗时: ${(Date.now() - screenshotStartTime) / 1000}秒`);
    
    await browser.close();
    browser = null;
    const base64Image = Buffer.from(imageBuffer).toString('base64'); // 显式转换
    console.log(`图片生成成功，大小: ${imageBuffer.length} 字节，Base64大小: ${base64Image.length} 字符`);
    console.log('==================== 思维导图生成完成 ====================');
    res.json({ image: base64Image });
  } catch (err) {
    console.error('==================== 生成思维导图时发生错误 ====================');
    console.error('错误类型:', err.name);
    console.error('错误消息:', err.message);
    console.error('错误堆栈:', err.stack);
    
    // 尝试强制截图
    if (browser) {
      try {
        console.log('尝试强制截图...');
        const page = (await browser.pages())[0];
        if (page) {
          // 尝试获取调试信息
          const debugInfo = await page.evaluate(() => {
            const debugElement = document.getElementById('debug');
            if (debugElement) {
              const info = debugElement.innerText;
              debugElement.style.display = 'none'; // 隐藏调试信息再截图
              return info;
            }
            return 'No debug info';
          }).catch(e => 'Failed to get debug info: ' + e.message);
          
          console.log('调试信息:', debugInfo);
          
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

// 测量节点深度的辅助函数
function getNodeDepth(node) {
  if (!node.children || node.children.length === 0) {
    return 1;
  }
  return 1 + Math.max(...node.children.map(getNodeDepth));
}

// 预处理Markdown函数
function preprocessMarkdown(markdown) {
  console.log('开始预处理Markdown...');
  
  // 处理数学公式块，确保标题和公式之间有换行
  markdown = markdown.replace(/(?:^|\n)(#+[^\n]+)(?:\n)?(\$\$\n[^\n]+\n\$\$)/g, (match, title, formula) => {
    // 确保标题和公式之间有一个空行
    return `${title}\n\n${formula}`;
  });

  // 处理数学公式块，但只处理那些还没有前缀的公式
  markdown = markdown.replace(/(?:^|\n)(?!-\s*\$\$)\$\$\n([^\n]+)\n\$\$/g, (match, formula) => {
    return `\n- $$\n  ${formula.trim()}\n  $$\n`;
  });

  // 处理yuml代码块
  markdown = markdown.replace(/```yuml[\s\S]*?```/g, (match) => {
    try {
      const yumlContent = match
        .replace(/```yuml\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      
      return '**流程图描述**:\n- ' + yumlContent
        .split('\n')
        .filter(line => !line.startsWith('//') && line.trim() !== '')
        .map(line => {
          const parts = line.match(/\[(.*?)\]\s*(-+>)\s*\[(.*?)\]/);
          if (parts) {
            return `${parts[1]} 到 ${parts[3]}`;
          }
          return line;
        })
        .join('\n- ');
    } catch (e) {
      console.error('处理yuml代码块时出错:', e);
      return '**流程图描述**: (解析错误，无法显示)';
    }
  });

  // 处理echarts代码块
  markdown = markdown.replace(/```echarts[\s\S]*?```/g, (match) => {
    try {
      const jsonStr = match
        .replace(/```echarts\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      
      const chartData = JSON.parse(jsonStr);
      let result = '**图表数据**:\n';
      
      if (chartData.series?.[0]?.type === 'pie') {
        result += `- 图表标题: ${chartData.title?.text || '未命名'}\n`;
        if (chartData.title?.subtext) {
          result += `- 副标题: ${chartData.title.subtext}\n`;
        }
        result += '- 数据项:\n';
        chartData.series[0].data.forEach(item => {
          result += `  - ${item.name}: ${item.value}\n`;
        });
      }
      else if (chartData.series?.[0]?.type === 'bar') {
        result += `- 图表类型: 柱状图\n`;
        result += `- 图表标题: ${chartData.title?.text || '未命名'}\n`;
        if (chartData.xAxis?.data) {
          result += '- 数据项:\n';
          chartData.xAxis.data.forEach((category, index) => {
            const value = chartData.series[0].data[index] || '无数据';
            result += `  - ${category}: ${value}\n`;
          });
        }
      }
      else {
        result += `- 图表类型: ${chartData.series?.[0]?.type || '未知'}\n`;
        result += `- 图表标题: ${chartData.title?.text || '未命名'}\n`;
        result += `- 图表内容: 包含复杂数据结构，已简化显示\n`;
      }
      
      return result;
    } catch (e) {
      console.error('处理echarts代码块时出错:', e);
      return '**图表数据**:\n- 解析错误，无法显示详细内容\n';
    }
  });

  console.log('Markdown预处理完成');
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