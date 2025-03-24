import towxml from '../../lib/towxml/index';
// 引入 F6
const F6 = require('../../lib/@antv/f6-wx/index');
const TreeGraph = require('../../lib/@antv/f6-wx/extends/graph/treeGraph');

// 注册树图
F6.registerGraph('TreeGraph', TreeGraph);

const app = getApp();

Page({
  data: {
    markdownContent: '',
    article: null, // towxml解析后的内容
    isStreaming: false,
    streamingComplete: false,
    lastValidContent: '', // 保存最后一次有效的内容
    userHasInteracted: false, // 标记用户是否已交互
    activeTab: 0,
    canvasWidth: 300,
    canvasHeight: 500,
    pixelRatio: 1,
    forceMini: false,
    mindMapData: null, // 思维导图数据
    isGeneratingMindMap: false, // 是否正在生成思维导图
    disabledTabs: {1: true}, // 默认禁用思维导图标签
    graphReady: false, // 图表是否准备好
    isAutoScrolling: false, // 标记是否正在自动滚动
    lastScrollTop: 0 // 记录最后一次滚动位置
  },
  
  onLoad() {
    // 设置页面标题
    wx.setNavigationBarTitle({
      title: '文档内容'
    });
    
    // 获取设备信息
    const info = wx.getSystemInfoSync();
    const pixelRatio = info.pixelRatio;
    const windowWidth = info.windowWidth;
    const windowHeight = info.windowHeight - 100; // 减去头部和标签栏高度
    
    this.setData({
      canvasWidth: windowWidth,
      canvasHeight: windowHeight,
      pixelRatio: pixelRatio,
      markdownContent: app.globalData.markdownContent,
      mindMapData: app.globalData.mindMapData,
      disabledTabs: {1: true} // 设置默认禁用思维导图标签
    });
    
    // 检查是否是流式接收模式
    const isStreaming = app.globalData.isStreamingMarkdown || false;
    
    if (isStreaming) {
      // 流式接收模式
      this.setData({
        isStreaming: true,
        markdownContent: ''
      });
      
      // 开始轮询获取流式内容
      this.startStreamingPolling();
    } else {
      // 非流式模式，直接获取完整内容
      const markdownContent = app.globalData.markdownContent || '# 没有内容';
      this.renderMarkdown(markdownContent);
      
      // 生成思维导图数据
      this.generateMindMapData(markdownContent);
    }
  },
  
  // 处理触摸事件
  handleTouchStart: function() {
    console.log('触摸事件触发');
    if (!this.data.userHasInteracted) {
      console.log('检测到用户触摸，停止自动滚动');
      this.setData({ userHasInteracted: true });
    }
  },
  
  onTabChange: function(e) {
    const index = e.detail.index;
    
    // 如果标签被禁用，则不切换
    if (this.data.disabledTabs[index]) {
      return;
    }
    
    this.setData({
      activeTab: index
    });
  },
  
  // 滚动到底部
  scrollToBottom() {
    console.log(this.data.userHasInteracted);
    // 如果用户已交互，则不自动滚动
    if (this.data.userHasInteracted) {
      return;
    }
    
    setTimeout(() => {
      // 使用 pageScrollTo 滚动到底部
      wx.pageScrollTo({
        scrollTop: 100000, // 一个更大的值，确保滚动到底部
        duration: 300
      });
      console.log('执行滚动到底部');
    }, 100);
  },
  
  // 提供一个方法让用户重新启用自动滚动
  enableAutoScroll() {
    console.log('重新启用自动滚动');
    this.setData({ userHasInteracted: false });
    this.scrollToBottom();
  },
  
  // 在流式更新时调用滚动方法前设置标志
  autoScrollToBottom() {
    // 设置自动滚动标志
    this.isAutoScrolling = true;
    
    // 使用 requestAnimationFrame 确保在下一帧执行滚动，避免阻塞
    wx.nextTick(() => {
      // 使用 pageScrollTo 滚动到底部
      wx.pageScrollTo({
        scrollTop: 100000, // 一个更大的值，确保滚动到底部
        duration: 300
      });
      console.log('执行滚动到底部');
      
      // 300毫秒后重置标志（与滚动动画持续时间相同）
      setTimeout(() => {
        this.isAutoScrolling = false;
      }, 300);
    });
  },
  
  // 开始轮询获取流式内容
  startStreamingPolling() {
    console.log('开始轮询获取流式内容');
    
    // 清除可能存在的旧定时器
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }
    
    // 设置轮询间隔
    const pollingInterval = 300; // 300毫秒，更快的更新频率
    let lastContentLength = 0; // 记录上次内容长度
    let noUpdateCount = 0; // 记录连续无更新次数
    const maxNoUpdateCount = 10; // 3秒内没有新数据就认为结束了 (10 * 300ms = 3000ms)
    let hasStartedCounting = false; // 标记是否已开始计数
    
    this.pollingTimer = setInterval(() => {
      // 使用 wx.nextTick 确保在下一帧执行，避免阻塞UI
      wx.nextTick(() => {
        // 从全局数据中获取最新的流式内容
        const latestContent = app.globalData.markdownContent || '';
        
        // 检查是否有新内容
        if (latestContent.length > 0) {
          // 只有在内容长度大于0时才开始计数
          if (!hasStartedCounting) {
            console.log('收到第一次有内容的数据，开始计数');
            hasStartedCounting = true;
          }
          
          if (latestContent.length > lastContentLength) {
            console.log('流式内容更新:', latestContent.length, '上次长度:', lastContentLength);
            
            // 使用 towxml 渲染更新的内容
            this.renderMarkdown(latestContent);
            
            // 如果用户没有交互，则自动滚动到底部
            if (!this.data.userHasInteracted) {
              this.autoScrollToBottom();
            }
            
            // 更新上次内容长度
            lastContentLength = latestContent.length;
            noUpdateCount = 0; // 重置无更新计数
          } else if (hasStartedCounting) {
            // 只有在已开始计数的情况下才增加无更新计数
            noUpdateCount++; // 增加无更新计数
            console.log('无新内容更新，计数:', noUpdateCount);
          }
        } else {
          console.log('等待第一次有内容的数据...');
        }
        
        // 检查是否已经完成流式接收
        if (app.globalData.streamingComplete) {
          console.log('全局数据标记流式接收完成');
          this.setData({
            streamingComplete: true,
            isStreaming: false
          });
          clearInterval(this.pollingTimer);
          
          // 流式接收完成后，立即生成思维导图
          if (this.data.markdownContent) {
            console.log('流式接收完成，立即生成思维导图');
            this.generateMindMapData(this.data.markdownContent);
            
            // 在生成思维导图数据后，调用初始化方法
            setTimeout(() => {
              console.log('调用 initMindMap 初始化思维导图');
              this.initMindMap();
            }, 500); // 延迟500毫秒，确保数据已更新
          }
          return;
        }
        
        // 如果已开始计数且3秒内没有新数据，则认为流式接收已完成
        if (hasStartedCounting && noUpdateCount >= maxNoUpdateCount) {
          console.log('3秒内没有新数据，认为流式接收已完成');
          
          this.setData({
            streamingComplete: true,
            isStreaming: false
          });
          
          // 设置全局完成标志
          app.globalData.streamingComplete = true;
          
          clearInterval(this.pollingTimer);
          
          // 流式接收完成后，立即生成思维导图
          if (this.data.markdownContent) {
            console.log('流式接收完成，立即生成思维导图');
            this.generateMindMapData(this.data.markdownContent);
            
            // 在生成思维导图数据后，调用初始化方法
            setTimeout(() => {
              console.log('调用 initMindMap 初始化思维导图');
              this.initMindMap();
            }, 500); // 延迟500毫秒，确保数据已更新
          }
        }
      });
    }, pollingInterval);
  },
  
  // 渲染 Markdown 内容
  renderMarkdown(content) {
    if (!content) {
      content = '# 没有内容';
    }
    
    try {
      // 处理 echarts 代码块，确保它们完整
      const processedContent = this.processEchartsBlocks(content);
      
      // 使用 towxml 解析 markdown
      let article = towxml(processedContent, 'markdown', {
        theme: 'light',
        events: {
          tap: (e) => {
            // 处理点击事件
            const tag = e.currentTarget.dataset.data;
            if (tag && tag.attr && tag.attr.href) {
              // 如果是链接，则复制链接
              wx.setClipboardData({
                data: tag.attr.href,
                success: () => {
                  wx.showToast({
                    title: '链接已复制',
                    icon: 'success'
                  });
                }
              });
            }
          }
        }
      });
      
      // 更新数据，触发视图更新
      this.setData({
        article: article,
        markdownContent: content
      });
      
      console.log('Markdown 渲染完成，内容长度:', content.length);
    } catch (error) {
      console.error('解析 Markdown 失败:', error);
      // 出错时显示原始内容
      this.setData({
        markdownContent: content
      });
    }
  },
  
  // 处理 echarts 代码块，确保它们完整
  processEchartsBlocks(content) {
    if (!content) return content;
    
    // 存储处理后的内容
    let processedContent = '';
    // 标记是否在 echarts 代码块内
    let inEchartsBlock = false;
    // 存储当前的 echarts 代码块内容
    let currentEchartsBlock = '';
    // 存储 echarts 代码块的开始标记
    let echartsStartMarker = '';
    
    // 按行处理内容
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 检查是否是 echarts 代码块的开始
      if (line.trim().startsWith('```echarts')) {
        inEchartsBlock = true;
        echartsStartMarker = line;
        currentEchartsBlock = '';
        continue;
      }
      
      // 检查是否是代码块的结束
      if (inEchartsBlock && line.trim() === '```') {
        inEchartsBlock = false;
        
        // 尝试解析 JSON 以验证完整性
        try {
          const jsonContent = currentEchartsBlock.trim();
          JSON.parse(jsonContent);
          
          // JSON 有效，添加完整的 echarts 代码块
          processedContent += echartsStartMarker + '\n' + currentEchartsBlock + '\n```\n';
        } catch (error) {
          console.error('echarts JSON 解析失败，跳过此代码块:', error);
          // JSON 无效，添加注释说明
          processedContent += '> *图表数据正在加载中...*\n\n';
        }
        
        continue;
      }
      
      // 如果在 echarts 代码块内，收集内容
      if (inEchartsBlock) {
        currentEchartsBlock += line + '\n';
      } else {
        // 不在 echarts 代码块内，直接添加到处理后的内容
        processedContent += line + '\n';
      }
    }
    
    // 处理可能未闭合的 echarts 代码块
    if (inEchartsBlock) {
      processedContent += '> *图表数据正在加载中...*\n\n';
    }
    
    return processedContent;
  },
  
  // 生成思维导图数据
  generateMindMapData(markdownContent) {
    console.log('开始生成思维导图数据');
    
    if (!markdownContent) {
      console.log('没有内容，不生成思维导图');
      return;
    }
    
    this.setData({
      isGeneratingMindMap: true
    });
    
    try {
      // 解析 Markdown 内容，生成思维导图数据
      const lines = markdownContent.split('\n');
      let rootNode = null;
      let currentHeadings = []; // 存储当前的标题节点
      let currentLevel = 0;
      let inCodeBlock = false; // 标记是否在代码块内
      let inTable = false; // 标记是否在表格内
      let tableContent = []; // 存储表格内容
      let paragraphBuffer = []; // 存储段落文本
      
      // 创建一个新节点
      const createNode = (text) => {
        return {
          id: text,
          children: []
        };
      };
      
      // 处理段落缓冲区
      const processParagraphBuffer = () => {
        if (paragraphBuffer.length > 0 && currentHeadings.length > 0) {
          const paragraphText = paragraphBuffer.join(' ').trim();
          if (paragraphText) {
            // 将长段落分割成多个短段落
            const maxLength = 100;
            let remainingText = paragraphText;
            
            while (remainingText.length > 0) {
              let chunkLength = Math.min(maxLength, remainingText.length);
              
              // 尝试在句子结束处截断
              if (chunkLength < remainingText.length) {
                const possibleEndPoints = ['.', '!', '?', '。', '！', '？', '；', ';'];
                let lastEndPoint = -1;
                
                for (let i = 0; i < chunkLength; i++) {
                  if (possibleEndPoints.includes(remainingText[i])) {
                    lastEndPoint = i;
                  }
                }
                
                if (lastEndPoint !== -1) {
                  chunkLength = lastEndPoint + 1;
                }
              }
              
              const chunk = remainingText.substring(0, chunkLength).trim();
              if (chunk) {
                const paragraphNode = createNode(chunk);
                currentHeadings[currentHeadings.length - 1].children.push(paragraphNode);
              }
              
              remainingText = remainingText.substring(chunkLength).trim();
            }
          }
          paragraphBuffer = []; // 清空段落缓冲区
        }
      };
      
      // 处理表格内容
      const processTable = () => {
        if (tableContent.length > 0 && currentHeadings.length > 0) {
          // 提取表格标题行
          const headerRow = tableContent[0].trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
          
          // 创建表格节点
          const tableNode = createNode('表格数据');
          
          // 为表格的每一列创建子节点
          for (let i = 0; i < headerRow.length; i++) {
            const columnNode = createNode(headerRow[i]);
            
            // 添加该列的数据
            for (let j = 2; j < tableContent.length; j++) { // 跳过标题行和分隔行
              const row = tableContent[j].trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
              if (row.length > i) {
                const cellNode = createNode(row[i]);
                columnNode.children.push(cellNode);
              }
            }
            
            tableNode.children.push(columnNode);
          }
          
          currentHeadings[currentHeadings.length - 1].children.push(tableNode);
          tableContent = []; // 清空表格内容
        }
      };
      
      // 处理每一行
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // 处理代码块
        if (line.startsWith('```')) {
          if (!inCodeBlock) {
            // 开始代码块
            inCodeBlock = true;
            processParagraphBuffer(); // 处理之前的段落
            
            // 检查是否是 mermaid 图表
            const isMermaid = line.includes('mermaid');
            const isEcharts = line.includes('echarts');
            
            // 收集代码块内容
            let codeContent = [];
            i++;
            
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
              codeContent.push(lines[i]);
              i++;
            }
            
            // 创建代码块节点
            if (codeContent.length > 0 && currentHeadings.length > 0) {
              let nodeLabel = '代码';
              
              // 根据代码块类型设置标签
              if (isMermaid) {
                nodeLabel = '图表';
                const firstLine = codeContent[0].trim();
                if (firstLine.includes('pie')) {
                  nodeLabel = '饼图';
                } else if (firstLine.includes('graph')) {
                  nodeLabel = '流程图';
                }
              } else if (isEcharts) {
                nodeLabel = 'ECharts图表';
                try {
                  const jsonContent = codeContent.join('\n');
                  const chartData = JSON.parse(jsonContent);
                  if (chartData.option && chartData.option.series) {
                    const series = chartData.option.series;
                    if (Array.isArray(series) && series.length > 0) {
                      if (series[0].type === 'pie') {
                        nodeLabel = '饼图';
                      } else if (series[0].type === 'bar') {
                        nodeLabel = '柱状图';
                      } else if (series[0].type === 'line') {
                        nodeLabel = '折线图';
                      } else if (series[0].type === 'radar') {
                        nodeLabel = '雷达图';
                      }
                    }
                  }
                } catch (e) {
                  console.error('解析ECharts数据失败:', e);
                }
              }
              
              const codeNode = createNode(nodeLabel);
              currentHeadings[currentHeadings.length - 1].children.push(codeNode);
            }
            
            inCodeBlock = false; // 结束代码块
          } else {
            // 结束代码块
            inCodeBlock = false;
          }
          continue;
        }
        
        // 如果在代码块内，跳过处理
        if (inCodeBlock) {
          continue;
        }
        
        // 处理表格
        if (line.startsWith('|')) {
          if (!inTable) {
            // 开始新表格
            inTable = true;
            processParagraphBuffer(); // 处理之前的段落
          }
          
          tableContent.push(line);
          continue;
        } else if (inTable) {
          // 结束表格
          inTable = false;
          processTable();
        }
        
        // 跳过分隔线
        if (line.match(/^-{3,}$/) || line.match(/^\*{3,}$/) || line.match(/^_{3,}$/)) {
          processParagraphBuffer();
          continue;
        }
        
        // 检查是否是标题行
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          // 处理之前的段落
          processParagraphBuffer();
          
          const level = headingMatch[1].length;
          const title = headingMatch[2].trim();
          
          // 创建标题节点
          const headingNode = createNode(title);
          
          // 如果是根节点
          if (!rootNode) {
            rootNode = headingNode;
            currentHeadings = [rootNode];
            currentLevel = level;
            continue;
          }
          
          // 处理层级关系
          if (level > currentLevel) {
            // 子标题
            currentHeadings[currentHeadings.length - 1].children.push(headingNode);
            currentHeadings.push(headingNode);
          } else if (level === currentLevel) {
            // 同级标题
            currentHeadings.pop();
            if (currentHeadings.length > 0) {
              currentHeadings[currentHeadings.length - 1].children.push(headingNode);
            } else {
              // 如果没有父节点，则作为根节点的同级节点
              rootNode.children.push(headingNode);
            }
            currentHeadings.push(headingNode);
          } else {
            // 上级标题
            while (currentHeadings.length > 1 && currentLevel - level < 0) {
              currentHeadings.pop();
            }
            if (currentHeadings.length > 0) {
              currentHeadings[currentHeadings.length - 1].children.push(headingNode);
            } else {
              // 如果没有父节点，则作为根节点的同级节点
              rootNode.children.push(headingNode);
            }
            currentHeadings.push(headingNode);
          }
          
          currentLevel = level;
        } else if (line) {
          // 非空行，添加到段落缓冲区
          paragraphBuffer.push(line);
        } else {
          // 空行，处理段落缓冲区
          processParagraphBuffer();
        }
      }
      
      // 处理最后的段落或表格
      if (inTable) {
        processTable();
      } else {
        processParagraphBuffer();
      }
      
      // 如果没有找到根节点，创建一个默认的
      if (!rootNode) {
        rootNode = createNode('文档内容');
      }
      
      console.log('思维导图数据生成完成');
      
      // 更新思维导图数据
      this.setData({
        mindMapData: rootNode,
        isGeneratingMindMap: false,
        disabledTabs: {1: false} // 启用思维导图标签
      });
      
      // 保存到全局数据
      app.globalData.mindMapData = rootNode;
      
      console.log('思维导图数据已更新，等待 Canvas 初始化完成');
    } catch (error) {
      console.error('生成思维导图数据出错:', error);
      this.setData({
        isGeneratingMindMap: false
      });
    }
  },
  
  // 修改 Canvas 初始化方法，参考示例代码
  onCanvasInit(event) {
    console.log('Canvas 初始化事件触发', event);
    
    if (!event || !event.detail) {
      console.error('Canvas 初始化事件缺少 detail 属性');
      this.setData({ disabledTabs: {1: true} });
      return;
    }
    
    const { ctx, rect, canvas, renderer } = event.detail;
    
    console.log('Canvas 初始化详情:', {
      hasCtx: !!ctx,
      hasRect: !!rect,
      hasCanvas: !!canvas,
      renderer: renderer
    });
    
    if (!ctx || !rect) {
      console.error('Canvas 初始化事件缺少必要属性');
      this.setData({ disabledTabs: {1: true} });
      return;
    }
    
    // 标记 Canvas 已初始化
    this.setData({ graphReady: true });
    
    // 缓存 Canvas 上下文和渲染器
    this.ctx = ctx;
    this.renderer = renderer;
    this.canvas = canvas;
    
    // 如果已有思维导图数据，则立即初始化图形
    if (this.data.mindMapData) {
      console.log('Canvas 已初始化，且有思维导图数据，立即初始化图形');
      this.initMindMap();
    } else {
      console.log('Canvas 已初始化，但没有思维导图数据，等待数据更新');
    }
  },
  
  // 处理 Canvas 触摸事件
  onCanvasTouch(e) {
    if (this.graph) {
      this.graph.emitEvent(e.detail);
    }
  },
  
  // 页面卸载时清除定时器
  onUnload() {
    // 清除定时器
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }
    
    // 清除全局数据
    const app = getApp();
    app.globalData.markdownContent = '';
    app.globalData.mindMapData = null;
    app.globalData.isStreamingMarkdown = false;
    app.globalData.streamingComplete = false;
    
    // 清除页面数据
    this.setData({
      markdownContent: '',
      article: null,
      mindMapData: null,
      isStreaming: false,
      streamingComplete: false,
      lastValidContent: '',
      userHasInteracted: false
    });
    
    // 如果存在图表实例，销毁它
    if (this.graph) {
      this.graph.destroy();
      this.graph = null;
    }
  },
  
  copyContent: function() {
    wx.setClipboardData({
      data: this.data.markdownContent,
      success: function() {
        wx.showToast({
          title: '内容已复制',
          icon: 'success'
        });
      }
    });
  },
  
  saveToFile: function() {
    const fs = wx.getFileSystemManager();
    const fileName = `AI文档分析_${new Date().getTime()}.md`;
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
    
    fs.writeFile({
      filePath: filePath,
      data: this.data.markdownContent,
      encoding: 'utf8',
      success: () => {
        wx.shareFileMessage({
          filePath: filePath,
          success: () => {
            wx.showToast({
              title: '文件已保存',
              icon: 'success'
            });
          },
          fail: (err) => {
            console.error('保存文件失败:', err);
            wx.showToast({
              title: '保存失败',
              icon: 'none'
            });
          }
        });
      },
      fail: (err) => {
        console.error('写入文件失败:', err);
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        });
      }
    });
  },
  
  // 初始化思维导图
  initMindMap() {
    console.log('初始化思维导图');
    
    if (!this.ctx || !this.data.mindMapData) {
      console.error('初始化思维导图失败：Canvas 上下文或思维导图数据不存在');
      return;
    }
    
    try {
      // 创建树图
      this.graph = new F6.TreeGraph({
        context: this.ctx,
        renderer: this.renderer,
        width: this.data.canvasWidth,
        height: this.data.canvasHeight,
        pixelRatio: this.data.pixelRatio,
        fitView: true,
        modes: {
          default: [
            {
              type: 'collapse-expand',
              onChange: function onChange(item, collapsed) {
                const model = item.getModel();
                model.collapsed = collapsed;
                return true;
              },
            },
            'drag-canvas',
            'zoom-canvas',
          ],
        },
        defaultNode: {
          size: 26,
          anchorPoints: [
            [0, 0.5],
            [1, 0.5],
          ],
        },
        defaultEdge: {
          type: 'cubic-horizontal',
        },
        layout: {
          type: 'dendrogram',
          direction: 'LR',
          nodeSep: 30,
          rankSep: 100,
          getId: function getId(d) {
            return d.id;
          },
          getHeight: function getHeight() {
            return 16;
          },
          getWidth: function getWidth() {
            return 16;
          },
          getVGap: function getVGap() {
            return 10;
          },
          getHGap: function getHGap() {
            return 100;
          },
        },
      });
      
      // 自定义节点样式
      this.graph.node(function(node) {
        return {
          label: node.id,
          labelCfg: {
            offset: 5,
            position: node.children && node.children.length > 0 ? 'left' : 'right',
          },
        };
      });
      
      // 设置数据并渲染
      this.graph.data(this.data.mindMapData);
      this.graph.render();
      this.graph.fitView();
      
      console.log('思维导图初始化完成');
    } catch (error) {
      console.error('初始化思维导图出错:', error);
    }
  },
  
  // 解析思维导图数据的方法
  parseMindMapData: function(markdownContent) {
    console.log('开始解析思维导图数据');
    
    if (!markdownContent) {
      return null;
    }
    
    try {
      // 解析 Markdown 内容，生成思维导图数据
      const lines = markdownContent.split('\n');
      let rootNode = null;
      let currentHeadings = []; // 存储当前的标题节点
      let currentLevel = 0;
      let inCodeBlock = false; // 标记是否在代码块内
      let inTable = false; // 标记是否在表格内
      let tableContent = []; // 存储表格内容
      let paragraphBuffer = []; // 存储段落文本
      
      // 创建一个新节点
      const createNode = (text) => {
        return {
          id: text,
          children: []
        };
      };
      
      // 处理段落缓冲区
      const processParagraphBuffer = () => {
        if (paragraphBuffer.length > 0 && currentHeadings.length > 0) {
          const paragraphText = paragraphBuffer.join(' ').trim();
          if (paragraphText) {
            // 将长段落分割成多个短段落
            const maxLength = 100;
            let remainingText = paragraphText;
            
            while (remainingText.length > 0) {
              let chunkLength = Math.min(maxLength, remainingText.length);
              
              // 尝试在句子结束处截断
              if (chunkLength < remainingText.length) {
                const possibleEndPoints = ['.', '!', '?', '。', '！', '？', '；', ';'];
                let lastEndPoint = -1;
                
                for (let i = 0; i < chunkLength; i++) {
                  if (possibleEndPoints.includes(remainingText[i])) {
                    lastEndPoint = i;
                  }
                }
                
                if (lastEndPoint !== -1) {
                  chunkLength = lastEndPoint + 1;
                }
              }
              
              const chunk = remainingText.substring(0, chunkLength).trim();
              if (chunk) {
                const paragraphNode = createNode(chunk);
                currentHeadings[currentHeadings.length - 1].children.push(paragraphNode);
              }
              
              remainingText = remainingText.substring(chunkLength).trim();
            }
          }
          paragraphBuffer = []; // 清空段落缓冲区
        }
      };
      
      // 处理表格内容
      const processTable = () => {
        if (tableContent.length > 0 && currentHeadings.length > 0) {
          // 提取表格标题行
          const headerRow = tableContent[0].trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
          
          // 创建表格节点
          const tableNode = createNode('表格数据');
          
          // 为表格的每一列创建子节点
          for (let i = 0; i < headerRow.length; i++) {
            const columnNode = createNode(headerRow[i]);
            
            // 添加该列的数据
            for (let j = 2; j < tableContent.length; j++) { // 跳过标题行和分隔行
              const row = tableContent[j].trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
              if (row.length > i) {
                const cellNode = createNode(row[i]);
                columnNode.children.push(cellNode);
              }
            }
            
            tableNode.children.push(columnNode);
          }
          
          currentHeadings[currentHeadings.length - 1].children.push(tableNode);
          tableContent = []; // 清空表格内容
        }
      };
      
      // 处理每一行
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // 处理代码块
        if (line.startsWith('```')) {
          if (!inCodeBlock) {
            // 开始代码块
            inCodeBlock = true;
            processParagraphBuffer(); // 处理之前的段落
            
            // 检查是否是 mermaid 图表
            const isMermaid = line.includes('mermaid');
            
            // 收集代码块内容
            let codeContent = [];
            i++;
            
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
              codeContent.push(lines[i]);
              i++;
            }
            
            // 创建代码块节点
            if (codeContent.length > 0 && currentHeadings.length > 0) {
              let nodeLabel = isMermaid ? '图表' : '代码';
              
              // 对于 mermaid 图表，尝试提取图表类型
              if (isMermaid) {
                const firstLine = codeContent[0].trim();
                if (firstLine.includes('pie')) {
                  nodeLabel = '饼图';
                } else if (firstLine.includes('graph')) {
                  nodeLabel = '流程图';
                }
              }
              
              const codeNode = createNode(nodeLabel);
              currentHeadings[currentHeadings.length - 1].children.push(codeNode);
            }
            
            inCodeBlock = false; // 结束代码块
          } else {
            // 结束代码块
            inCodeBlock = false;
          }
          continue;
        }
        
        // 如果在代码块内，跳过处理
        if (inCodeBlock) {
          continue;
        }
        
        // 处理表格
        if (line.startsWith('|')) {
          if (!inTable) {
            // 开始新表格
            inTable = true;
            processParagraphBuffer(); // 处理之前的段落
          }
          
          tableContent.push(line);
          continue;
        } else if (inTable) {
          // 结束表格
          inTable = false;
          processTable();
        }
        
        // 跳过分隔线
        if (line.match(/^-{3,}$/) || line.match(/^\*{3,}$/) || line.match(/^_{3,}$/)) {
          processParagraphBuffer();
          continue;
        }
        
        // 检查是否是标题行
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          // 处理之前的段落
          processParagraphBuffer();
          
          const level = headingMatch[1].length;
          const title = headingMatch[2].trim();
          
          // 创建标题节点
          const headingNode = createNode(title);
          
          // 如果是根节点
          if (!rootNode) {
            rootNode = headingNode;
            currentHeadings = [rootNode];
            currentLevel = level;
            continue;
          }
          
          // 处理层级关系
          if (level > currentLevel) {
            // 子标题
            currentHeadings[currentHeadings.length - 1].children.push(headingNode);
            currentHeadings.push(headingNode);
          } else if (level === currentLevel) {
            // 同级标题
            currentHeadings.pop();
            if (currentHeadings.length > 0) {
              currentHeadings[currentHeadings.length - 1].children.push(headingNode);
            } else {
              // 如果没有父节点，则作为根节点的同级节点
              rootNode.children.push(headingNode);
            }
            currentHeadings.push(headingNode);
          } else {
            // 上级标题
            while (currentHeadings.length > 1 && currentLevel - level < 0) {
              currentHeadings.pop();
            }
            if (currentHeadings.length > 0) {
              currentHeadings[currentHeadings.length - 1].children.push(headingNode);
            } else {
              // 如果没有父节点，则作为根节点的同级节点
              rootNode.children.push(headingNode);
            }
            currentHeadings.push(headingNode);
          }
          
          currentLevel = level;
        } else if (line) {
          // 非空行，添加到段落缓冲区
          paragraphBuffer.push(line);
        } else {
          // 空行，处理段落缓冲区
          processParagraphBuffer();
        }
      }
      
      // 处理最后的段落或表格
      if (inTable) {
        processTable();
      } else {
        processParagraphBuffer();
      }
      
      // 如果没有找到根节点，创建一个默认的
      if (!rootNode) {
        rootNode = createNode('文档内容');
      }
      
      // 返回简化的数据格式
      return rootNode;
    } catch (error) {
      console.error('解析思维导图数据失败:', error);
      return null;
    }
  }
});

