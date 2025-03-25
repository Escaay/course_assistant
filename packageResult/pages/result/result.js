import towxml from '../../lib/towxml/index';
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
    mindmapUrl: '', // 思维导图 WebView URL
    isGeneratingMindMap: false, // 是否正在生成思维导图
    disabledTabs: {1: true}, // 默认禁用思维导图标签
    isAutoScrolling: false, // 标记是否正在自动滚动
    lastScrollTop: 0, // 记录最后一次滚动位置
    mindmapSvgUrl: '', // 存储思维导图 SVG URL
    mindmapHtml: null, // 存储思维导图 HTML 内容
    isPageDestroyed: false
  },
  
  onLoad() {
    // 设置页面标题
    wx.setNavigationBarTitle({
      title: '文档内容'
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
      
      // 生成思维导图
      this.generateMindMap(markdownContent);
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
    const index = parseInt(e.currentTarget.dataset.index);
    
    // 如果标签被禁用，则不切换
    if (this.data.disabledTabs[index]) {
      return;
    }
    
    if (index === 1 && this.data.mindmapUrl) {
      // 保存当前页面状态
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      
      // 使用navigateTo而不是redirectTo，确保可以返回
      wx.navigateTo({
        url: `/packageResult/pages/mindmap/mindmap?url=${encodeURIComponent(this.data.mindmapUrl)}`,
        events: {
          // 监听页面返回事件
          returnFromMindmap: function() {
            console.log('从思维导图页面返回');
          }
        },
        success: function(res) {
          // 页面打开成功
          console.log('思维导图页面打开成功');
          
          // 通过eventChannel向被打开页面传送数据
          res.eventChannel.emit('acceptDataFromOpenerPage', { data: 'from result page' });
        },
        fail: function(err) {
          console.error('打开思维导图页面失败:', err);
          wx.showToast({
            title: '打开思维导图失败',
            icon: 'none'
          });
        }
      });
      return;
    }
    
    this.setData({
      activeTab: index
    });
  },
  
  // 生成思维导图
  generateMindMap(markdownContent) {
    console.log('开始生成思维导图');
    console.log('Markdown内容长度:', markdownContent ? markdownContent.length : 0);
    
    if (!markdownContent) {
      console.log('没有内容，不生成思维导图');
      return;
    }
    
    this.setData({
      isGeneratingMindMap: true
    });
    
    // 生成HTML内容
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
${markdownContent}
    </script>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/markmap-autoloader@latest"></script>
</body>
</html>`;

    // 生成唯一文件名
    const fileName = `mindmap_${Date.now()}.html`;
    
    // 将HTML内容转换为ArrayBuffer
    const fsm = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
    
    try {
      // 写入临时文件
      fsm.writeFileSync(filePath, html, 'utf8');
      
      // 上传到云存储
      wx.cloud.uploadFile({
        cloudPath: fileName,
        filePath: filePath,
        success: res => {
          console.log('上传成功', res);
          
          // 获取临时访问URL
          wx.cloud.getTempFileURL({
            fileList: [res.fileID],
            success: result => {
              console.log('获取临时URL成功', result);
              
              if (result.fileList && result.fileList.length > 0) {
                const fileUrl = result.fileList[0].tempFileURL;
                
                this.setData({
                  mindmapUrl: fileUrl,
                  isGeneratingMindMap: false,
                  disabledTabs: {1: false} // 启用思维导图标签
                });
                
                console.log('思维导图标签已启用');
              } else {
                this.handleMindmapError('获取临时访问URL失败');
              }
            },
            fail: err => {
              console.error('获取临时URL失败', err);
              this.handleMindmapError('获取临时访问URL失败');
            }
          });
        },
        fail: err => {
          console.error('上传失败', err);
          this.handleMindmapError('上传文件失败');
        }
      });
    } catch (error) {
      console.error('生成思维导图失败', error);
      this.handleMindmapError('生成思维导图失败');
    }
  },
  
  // 处理思维导图生成错误
  handleMindmapError(errorMsg) {
    wx.showToast({
      title: errorMsg || '思维导图生成失败',
      icon: 'none'
    });
    
    this.setData({
      isGeneratingMindMap: false
    });
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
  
  // 开始轮询获取流式内容
  startStreamingPolling() {
    // 如果页面已被销毁，不执行任何操作
    if (this.data.isPageDestroyed) return;
    
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
            this.generateMindMap(this.data.markdownContent);
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
            this.generateMindMap(this.data.markdownContent);
          }
        }
      });
    }, pollingInterval);
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
    // 如果页面已被销毁，不执行任何操作
    if (this.data.isPageDestroyed) return;
    
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
  
  // 处理WebView消息
  handleWebViewMessage: function(e) {
    console.log('收到WebView消息:', e.detail);
    
    if (e.detail.data && e.detail.data.length > 0) {
      const message = e.detail.data[0];
      
      if (message.action === 'loaded') {
        console.log('思维导图加载完成');
        // 可以在这里添加加载完成后的处理逻辑
      } else if (message.action === 'error') {
        console.error('思维导图加载失败:', message.message);
        wx.showToast({
          title: '思维导图加载失败',
          icon: 'none'
        });
      }
    }
  },
  
  // 预览思维导图
  previewMindmap: function() {
    if (this.data.mindmapSvgUrl) {
      wx.previewImage({
        urls: [this.data.mindmapSvgUrl],
        current: this.data.mindmapSvgUrl
      });
    }
  },
  
  // 添加页面生命周期函数
  onShow: function() {
    console.log('result页面显示');
    // 可以在这里恢复页面状态
  },
  
  onHide: function() {
    console.log('result页面隐藏');
    // 可以在这里保存页面状态
  },
  
  // 处理页面返回
  onUnload: function() {
    console.log('result页面卸载');
    
    // 标记页面已被销毁
    this.setData({
      isPageDestroyed: true
    });
    
    // 清理所有定时器和事件监听器
    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = null;
    }
    
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
      this.scrollTimer = null;
    }
    
    // 如果有其他定时器或事件监听器，也应该在这里清理
    
    // 如果不是跳转到思维导图页面，才清空全局数据
    if (!this.isNavigatingToMindmap) {
      const app = getApp();
      if (app && app.globalData) {
        app.globalData.markdownContent = '';
        app.globalData.isStreamingMarkdown = false;
      }
    }
  }
});

