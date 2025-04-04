import towxml from '../../lib/towxml/index';
import { base64Encode } from '../../../utils/base64';
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
    disabledTabs: {}, // 确保没有禁用任何标签
    isAutoScrolling: false, // 标记是否正在自动滚动
    lastScrollTop: 0, // 记录最后一次滚动位置
    mindmapSvgUrl: '', // 存储思维导图 SVG URL
    mindmapHtml: null, // 存储思维导图 HTML 内容
    isPageDestroyed: false,
    mindmapSvg: '', // 存储思维导图SVG
    mindmapImage: '', // 存储思维导图图片 URL
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
        markdownContent: '',
        isGeneratingMindMap: true, // 在流式接收开始时就设置思维导图生成状态
        disabledTabs: {} // 确保没有禁用任何标签
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
    console.log('tabchange');
    const index = parseInt(e.currentTarget.dataset.index);
    
    // 如果切换到思维导图标签，设置用户已交互标志，阻止自动滚动
    if (index === 1) {
      this.setData({ 
        userHasInteracted: true 
      });
      
      // 如果还没有开始生成思维导图，且有内容，则开始生成
      if (!this.data.isGeneratingMindMap && !this.data.mindmapImage && this.data.markdownContent) {
        this.generateMindMap(this.data.markdownContent);
      }
    }
    
    if (index === 1 && this.data.mindmapUrl) {
      // 保存当前页面状态
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      
      wx.navigateTo({
        url: `/packageResult/pages/mindmap/mindmap?url=${encodeURIComponent(this.data.mindmapUrl)}`,
        success: (res) => {
          // 通过eventChannel向被打开页面传送数据
          res.eventChannel.emit('acceptDataFromOpenerPage', { 
            markdown: this.data.markdownContent
          });
        },
        fail: (err) => {
          console.error('打开思维导图页面失败:', err);
          wx.showToast({
            title: '打开思维导图失败',
            icon: 'none'
          });
        }
      });
      return;
    }
    
    // 直接设置活动标签，不检查禁用状态
    this.setData({
      activeTab: index
    });
  },
  
  // 生成思维导图
  async generateMindMap(markdownContent) {
    if (!markdownContent || markdownContent === '# 没有内容') return;

    this.setData({
      isGeneratingMindMap: true,
      // 不再禁用思维导图标签
      // disabledTabs: {1: true} // 移除这一行
    });

    try {
      // 获取Web函数URL
      const functionUrl = 'https://1350435035-3t9bmfv4tb.ap-guangzhou.tencentscf.com/generate-mindmap';
      
      console.log('调用腾讯云Web函数生成思维导图...');
      
      // 使用wx.request调用Web函数，增加timeout参数
      const response = await new Promise((resolve, reject) => {
        wx.request({
          url: functionUrl,
          method: 'POST',
          data: {
            content: markdownContent
          },
          header: {
            'Content-Type': 'application/json'
          },
          timeout: 200000, // 设置为200秒
          success: res => resolve(res),
          fail: err => reject(err)
        });
      });
      
      console.log('Web函数返回结果:', response);
      
      if (response.statusCode !== 200) {
        throw new Error(`请求失败，状态码: ${response.statusCode}`);
      }
      
      const result = response.data;
      
      if (result.error) {
        throw new Error(result.error);
      }

      // 处理返回的图片数据
      if (result.image) {
        console.log('图片数据长度:', result.image.length);
        
        // 直接使用Base64 URL
        const imageUrl = 'data:image/png;base64,' + result.image;
        
        this.setData({
          mindmapImage: imageUrl,
          isGeneratingMindMap: false,
          disabledTabs: {1: false} // 确保思维导图标签启用
        });
        
        console.log('思维导图生成成功');
      } else {
        throw new Error('未返回图片数据');
      }
    } catch (error) {
      console.error('生成思维导图失败:', error);
      this.setData({
        isGeneratingMindMap: false,
        // 即使生成失败也不禁用标签
        disabledTabs: {1: false}
      });
      wx.showToast({
        title: '生成思维导图失败',
        icon: 'none'
      });
    }
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
    } catch (error) {
      console.error('解析 Markdown 失败:', error);
      // 出错时显示原始内容
      this.setData({
        markdownContent: content
      });
    }
  },
  
  // 处理特殊代码块（echarts、yuml、LaTeX）
  processEchartsBlocks(content) {
    if (!content) return content;
    
    let processedContent = '';
    let inSpecialBlock = false;
    let currentBlock = '';
    let blockType = '';
    let blockStartMarker = '';
    
    // 按行处理内容
    const lines = content.split(/\r?\n/);
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trimRight();
        
        // 检查是否是特殊代码块的开始
        if (line.trim().startsWith('```markdown')) {
            inSpecialBlock = true;
            blockType = 'markdown';
            currentBlock = '';
            continue;
        } else if (line.trim().startsWith('```latex')) {
            inSpecialBlock = true;
            blockType = 'latex';
            currentBlock = '';
            continue;
        } else if (line.trim().startsWith('```yuml')) {
            inSpecialBlock = true;
            blockType = 'yuml';
            blockStartMarker = line;
            currentBlock = '';
            continue;
        } else if (line.trim().startsWith('```echarts')) {
            inSpecialBlock = true;
            blockType = 'echarts';
            blockStartMarker = line;
            currentBlock = '';
            continue;
        } else if (line.trim() === '$$') {
            // console.log('数学公式标记:', line)
            if (!inSpecialBlock) {
                // 多行数学公式开始
                // console.log('多行数学公式开始')
                inSpecialBlock = true;
                blockType = 'math-block';
                currentBlock = '$$\n';  // 保留开始标记
            } else if (blockType === 'math-block') {
                // 多行数学公式结束
                currentBlock += '$$';  // 保留结束标记
                // console.log('多行数学公式结束，内容:', currentBlock)
                inSpecialBlock = false;
                processedContent += `${currentBlock}\n`;
                continue;
            }
            continue;
        } else if (line.includes('$') && !inSpecialBlock) {
            // 处理单行数学公式
            let processedLine = line;
            const matches = line.match(/\$[^\$]+\$/g);
            if (matches) {
                matches.forEach(match => {
                    // 检查是否是有效的行内公式（前后都是$，且不是$$，且不包含HTML标签）
                    if (match.startsWith('$') && 
                        match.endsWith('$') && 
                        !match.startsWith('$$')) {
                        processedLine += `${match}\n`
                    } else {
                        console.log('无效的行内数学公式格式:', match);
                    }
                });
            }
            processedContent += processedLine + '\n';
            continue;
        }
        
        // 检查其他代码块的结束
        if (inSpecialBlock && line === '```' && blockType !== 'math-block') {
            inSpecialBlock = false;
            
            switch (blockType) {
                case 'markdown':
                    processedContent += currentBlock + '\n';
                    break;
                    
                case 'latex':
                    processedContent += currentBlock + '\n';
                    break;
                    
                case 'yuml':
                    processedContent += blockStartMarker + '\n' + currentBlock + '\n```\n';
                    break;
                    
                case 'echarts':
                    try {
                        const jsonContent = currentBlock.trim();
                        JSON.parse(jsonContent);
                        processedContent += blockStartMarker + '\n' + currentBlock + '\n```\n';
                    } catch (error) {
                        console.error('echarts 解析失败:', error);
                        processedContent += '> *数据正在加载中...*\n\n';
                    }
                    break;
            }
            continue;
        }
        
        // 收集代码块内容或添加普通行
        if (inSpecialBlock) {
            currentBlock += line + '\n';
        } else {
            processedContent += line + '\n';
        }
    }
    
    // 处理未闭合的代码块
    if (inSpecialBlock) {
        processedContent += '> *内容正在加载中...*\n\n';
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
            
            // 使用 towxml 渲染更新的内容
            this.renderMarkdown(latestContent);
            
            // 如果用户没有交互且当前在文档标签页，则自动滚动到底部
            if (!this.data.userHasInteracted && this.data.activeTab === 0) {
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
    if (this.data.mindmapImage) {
      wx.previewImage({
        urls: [this.data.mindmapImage],
        current: this.data.mindmapImage
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
  },
  
  // 添加重新生成方法
  regenerateMindmap: function() {
    if (this.data.isGeneratingMindMap) return;
    
    // 清空现有的思维导图
    this.setData({
      mindmapImage: '',
      isGeneratingMindMap: true
    });
    
    // 重新生成思维导图
    if (this.data.markdownContent) {
      this.generateMindMap(this.data.markdownContent);
    }
  },
  
  // 保存思维导图图片
  saveMindmapImage: function() {
    if (!this.data.mindmapImage) {
      wx.showToast({
        title: '没有可保存的图片',
        icon: 'none'
      });
      return;
    }
    
    wx.showLoading({
      title: '保存中...',
    });
    
    // 获取临时文件路径
    wx.getFileSystemManager().writeFile({
      filePath: `${wx.env.USER_DATA_PATH}/mindmap_temp.png`,
      data: this.data.mindmapImage.replace(/^data:image\/\w+;base64,/, ""),
      encoding: 'base64',
      success: (res) => {
        // 保存图片到相册
        wx.saveImageToPhotosAlbum({
          filePath: `${wx.env.USER_DATA_PATH}/mindmap_temp.png`,
          success: () => {
            wx.hideLoading();
            wx.showToast({
              title: '已保存到相册',
              icon: 'success'
            });
          },
          fail: (err) => {
            wx.hideLoading();
            console.error('保存到相册失败:', err);
            if (err.errMsg.indexOf('auth deny') >= 0) {
              wx.showModal({
                title: '提示',
                content: '需要您授权保存图片到相册',
                confirmText: '去授权',
                success: (res) => {
                  if (res.confirm) {
                    wx.openSetting({
                      success: (settingRes) => {
                        console.log('设置结果:', settingRes);
                      }
                    });
                  }
                }
              });
            } else {
              wx.showToast({
                title: '保存失败',
                icon: 'none'
              });
            }
          }
        });
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('写入临时文件失败:', err);
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        });
      }
    });
  },
  
  // 复制为Markdown
  copyAsMarkdown: function() {
    if (!this.data.markdownContent) {
      wx.showToast({
        title: '没有可复制的内容',
        icon: 'none'
      });
      return;
    }
    
    wx.setClipboardData({
      data: this.data.markdownContent,
      success: function() {
        wx.showToast({
          title: 'Markdown已复制',
          icon: 'success'
        });
      },
      fail: function(err) {
        console.error('复制失败:', err);
        wx.showToast({
          title: '复制失败',
          icon: 'none'
        });
      }
    });
  },
});

