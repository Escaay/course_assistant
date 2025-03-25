Page({
  data: {
    url: '',
    loadError: false,
    errorMsg: '加载失败'
  },
  
  onLoad: function(options) {
    // 设置页面标题
    wx.setNavigationBarTitle({
      title: '思维导图'
    });
    
    if (options.url) {
      try {
        // 解码URL
        const url = decodeURIComponent(options.url);
        console.log('思维导图URL:', url);
        
        // 检查URL是否有效
        if (!url.startsWith('http')) {
          this.setData({
            loadError: true,
            errorMsg: 'URL格式错误，必须以http或https开头'
          });
          return;
        }
        
        // 避免中文字符导致iOS白屏问题
        const encodedUrl = url.replace(/#/g, '%23').replace(/\?/g, '%3F');
        
        // 在iOS中，添加#wechat_redirect可解决JSSDK接口调用无响应问题
        const finalUrl = encodedUrl + (encodedUrl.indexOf('#') > -1 ? '' : '#wechat_redirect');
        
        this.setData({
          url: finalUrl
        });
      } catch (error) {
        console.error('URL解码失败:', error);
        this.setData({
          loadError: true,
          errorMsg: 'URL格式错误'
        });
      }
    } else {
      this.setData({
        loadError: true,
        errorMsg: '未提供思维导图URL'
      });
    }
  },
  
  // WebView加载成功
  handleWebViewLoad: function(e) {
    console.log('WebView加载成功', e);
  },
  
  // WebView加载失败
  handleWebViewError: function(e) {
    console.error('WebView加载失败', e.detail);
    this.setData({
      loadError: true,
      errorMsg: `思维导图加载失败: ${e.detail.errMsg || '未知错误'}`
    });
  },
  
  // 处理WebView消息
  handleWebViewMessage: function(e) {
    console.log('收到WebView消息', e.detail);
    // 可以处理网页发送的消息
    if (e.detail && e.detail.data && e.detail.data.length > 0) {
      const data = e.detail.data;
      console.log('消息数据:', data);
    }
  },
  
  // 返回上一页
  goBack: function() {
    const pages = getCurrentPages();
    
    if (pages.length > 1) {
      // 有上一页，正常返回
      const prevPage = pages[pages.length - 2];
      
      // 如果上一页是result页面，可以向它传递数据
      if (prevPage.route.includes('result') && !prevPage.data.isPageDestroyed) {
        try {
          // 获取页面间通信通道
          const eventChannel = this.getOpenerEventChannel();
          if (eventChannel && typeof eventChannel.emit === 'function') {
            // 触发返回事件
            eventChannel.emit('returnFromMindmap', { success: true });
          }
        } catch (error) {
          console.error('触发返回事件失败:', error);
        }
      }
      
      wx.navigateBack({
        delta: 1,
        success: function() {
          console.log('返回成功');
        },
        fail: function(err) {
          console.error('返回失败:', err);
          
          // 如果返回失败，可能需要重新加载首页
          wx.reLaunch({
            url: '/pages/index/index'
          });
        }
      });
    } else {
      // 没有上一页，可能是从分享链接直接进入的
      // 重定向到首页或其他页面
      wx.reLaunch({
        url: '/pages/index/index'
      });
    }
  },
  
  // 分享
  onShareAppMessage: function(options) {
    // 获取网页URL
    const webViewUrl = options.webViewUrl || this.data.url;
    
    return {
      title: '思维导图分享',
      path: `/packageResult/pages/mindmap/mindmap?url=${encodeURIComponent(this.data.url)}`
    };
  }
}); 