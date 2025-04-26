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
    
    // 简化HTML，减少外部依赖，添加调试信息
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
      </script>
    </head>
    <body>
      <div id="debug">Debug: Loading...</div>
      <svg id="markmap" style="width: 100%; height: 100%"></svg>
      <script>
        // 存储根数据，以便后续使用
        window.rootData = ${JSON.stringify(root)};
        
        // 先加载D3库
        document.getElementById('debug').innerText = 'Debug: Loading D3...';
        const d3Script = document.createElement('script');
        d3Script.src = 'https://cdnjs.cloudflare.com/ajax/libs/d3/6.7.0/d3.min.js';
        d3Script.onload = function() {
          document.getElementById('debug').innerText = 'Debug: Loading Markmap...';
          // 加载markmap
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/markmap-view@0.14.4/dist/index.min.js';
          script.onload = function() {
            try {
              document.getElementById('debug').innerText = 'Debug: Creating markmap...';
              if (typeof markmap === 'undefined') {
                document.getElementById('debug').innerText = 'Debug: Error: markmap is not defined after loading';
              } else {
                const mm = markmap.Markmap.create('#markmap', {
                  autoFit: true,
                  duration: 0,
                  maxInitialScale: 5
                }, window.rootData);
                document.getElementById('debug').innerText = 'Debug: Markmap created successfully';
              }
            } catch (e) {
              console.error('创建思维导图时出错:', e);
              document.getElementById('debug').innerText = 'Debug: Error: ' + e.message;
            }
          };
          script.onerror = function(error) {
            const errorInfo = {
              type: 'Markmap Load Error',
              time: new Date().toISOString(),
              userAgent: navigator.userAgent,
              error: error
            };
            console.error('Markmap加载失败:', errorInfo);
            document.getElementById('debug').innerText = 'Debug: Error loading Markmap';
            window._errors.push(errorInfo);
          };
          document.head.appendChild(script);
        };
        d3Script.onerror = function(error) {
          const errorInfo = {
            type: 'D3 Load Error',
            time: new Date().toISOString(),
            userAgent: navigator.userAgent,
            error: error
          };
          console.error('D3加载失败:', errorInfo);
          document.getElementById('debug').innerText = 'Debug: Error loading D3';
          window._errors.push(errorInfo);
        };
        document.head.appendChild(d3Script);
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
              script.src = 'https://unpkg.com/markmap-view@0.14.4/dist/index.min.js';
              document.head.appendChild(script);
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
  // 处理yuml代码块
  markdown = markdown.replace(/```yuml[\s\S]*?```/g, (match) => {
    try {
      // 提取yuml内容，处理可能的空格和格式问题
      const yumlContent = match
        .replace(/```yuml\s*/i, '') // 移除开头的```yuml及其后的空白
        .replace(/\s*```$/i, '')    // 移除结尾的```及其前的空白
        .trim();                    // 去除首尾空白
      
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
    } catch (e) {
      console.error('处理yuml代码块时出错:', e);
      console.error('问题代码块:', match);
      return '**流程图描述**: (解析错误，无法显示)';
    }
  });

  console.log('开始处理echarts代码块...');
  // 处理echarts代码块
  markdown = markdown.replace(/```echarts[\s\S]*?```/g, (match) => {
    try {
      // 提取echarts JSON内容，处理可能的空格和格式问题
      const jsonStr = match
        .replace(/```echarts\s*/i, '') // 移除开头的```echarts及其后的空白
        .replace(/\s*```$/i, '')       // 移除结尾的```及其前的空白
        .trim();                       // 去除首尾空白
      
      console.log('尝试解析的JSON字符串:', jsonStr);
      
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
        result += `- 图表标题: ${chartData.title?.text || '未命名'}\n`;
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
        result += `- 图表标题: ${chartData.title?.text || '未命名'}\n`;
        result += `- 图表内容: 包含复杂数据结构，已简化显示\n`;
      }
      
      return result;
    } catch (e) {
      console.error('处理echarts代码块时出错:', e);
      console.error('问题代码块:', match);
      
      // 尝试简单显示，避免完全失败
      return '**图表数据**:\n- 解析错误，无法显示详细内容\n- 原始代码已保留';
    }
  });

  console.log('开始处理表格...');
  // 先处理表格，确保在处理公式前完成
  // 处理Markdown表格，将其转换为更适合思维导图显示的结构化格式
  // 使用正则表达式匹配整个表格（包括表头、分隔行和数据行）
  let tablePattern = /^\|(.+)\|$[\r\n]+^\|([\s\-:\|]+)\|$[\r\n]+((?:^\|.+\|$[\r\n]?)+)/gm;

  markdown = markdown.replace(tablePattern, (match, headerRow, separatorRow, bodyRows) => {
    // 解析表头
    const headers = headerRow.split('|').map(cell => cell.trim()).filter(cell => cell);
    
    // 解析数据行
    const rows = bodyRows.split('\n')
      .filter(row => row.trim().startsWith('|') && row.trim().endsWith('|'))
      .map(row => {
        return row.trim().substring(1, row.trim().length - 1) // 去除首尾的 |
          .split('|')
          .map(cell => cell.trim())
          .filter(cell => cell !== '');
      });
    
    // 检查是否有标题行上方的标题（通常是 ### 开头的标题）
    const tableTitle = match.match(/^###\s+(.+)$/m);
    const titlePrefix = tableTitle ? `- ${tableTitle[1]}:\n` : '- 表格数据:\n';
    let result = titlePrefix;
    
    // 表格主体内容处理
    // 根据表格结构，决定最适合的显示方式
    if (headers.length >= 2 && rows.length > 0) {
      // 检查是否有主键列（第一列），通常用作分类
      const hasKeyColumn = true;
      
      // 如果表头是"主体|出资比例|责任范围"这样的格式，采用更直观的结构
      if (headers.includes('主体') || headers.includes('类型') || headers.includes('名称') || 
          headers.includes('项目') || headers.includes('分类') || headers[0].includes('名') || 
          headers[0].includes('类') || headers[0].includes('项') || headers[0].includes('体')) {
        
        // 直接以表格行作为一级节点，列内容作为属性
        const keyColumnIndex = 0; // 假设第一列是主键
        
        // 将表头显示为顶层节点
        result += `  - 表头: ${headers.join(' | ')}\n`;
        
        // 为每行数据创建节点，使用主键列的值作为节点名称
        rows.forEach((row, rowIndex) => {
          // 添加行号方便识别，但以内容为主
          result += `  - ${row[keyColumnIndex] || '行 ' + (rowIndex + 1)}:\n`;
          
          // 将剩余列作为该行的属性
          for (let i = 0; i < row.length; i++) {
            if (i !== keyColumnIndex && i < headers.length) {
              result += `    - ${headers[i]}: ${row[i]}\n`;
            }
          }
        });
      } else {
        // 采用传统表格视图
        result += `  - 表格内容:\n`;
        // 显示表头
        result += `    - ${headers.join(' | ')}\n`;
        
        // 显示数据行
        rows.forEach((row, rowIndex) => {
          result += `    - ${row.join(' | ')}\n`;
        });
      }
    } else {
      // 简单表格，直接按行显示
      result += `  - 表头: ${headers.join(' | ')}\n`;
      
      rows.forEach((row, rowIndex) => {
        result += `  - 行 ${rowIndex + 1}: ${row.join(' | ')}\n`;
      });
    }
    
    // 确保表格后面有足够的换行来分隔其他内容
    return result + "\n\n";
  });

  console.log('开始处理数学公式...');
  // 处理公式 - 在处理表格后进行
  // 使用更安全的方式处理多行公式，避免重复处理
  let processedMarkdown = '';
  let lastIndex = 0;
  
  // 使用正则表达式匹配所有多行公式 - 使用非贪婪匹配和明确的边界
  const multilineFormulaPattern = /(\n|^)(\$\$[\s\S]*?\$\$)(\n|$)/g;
  let match;
  
  // 记录已处理的位置，确保不会重复处理
  while ((match = multilineFormulaPattern.exec(markdown)) !== null) {
    // 添加当前匹配之前的文本
    processedMarkdown += markdown.substring(lastIndex, match.index);
    
    // 提取匹配的分组
    const [fullMatch, beforeText, formulaContent, afterText] = match;
    
    // 创建处理后的公式
    // 将双$改为单$并添加破折号，保持原格式
    // 确保处理后的公式与其他内容有明确分隔
    const processedFormula = beforeText + '- $' + formulaContent.substring(2, formulaContent.length-2).replace(/\n\s*/g, ' ').trim() + '$' + afterText;
    
    // 添加处理后的公式
    processedMarkdown += processedFormula;
    
    // 更新lastIndex，防止重复处理
    lastIndex = match.index + fullMatch.length;
    
    // 确保正则表达式不会卡在同一位置
    if (multilineFormulaPattern.lastIndex <= match.index) {
      multilineFormulaPattern.lastIndex = lastIndex;
    }
    
    console.log(`处理公式: 从位置 ${match.index} 到 ${lastIndex}`);
  }
  
  // 添加剩余未处理的文本
  processedMarkdown += markdown.substring(lastIndex);
  
  // 使用处理后的文本替换原始文本
  markdown = processedMarkdown;

  // 移除处理行内公式的代码，让它们按原样显示
  // 不再需要添加前导破折号

  console.log('Markdown预处理完成', markdown);
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