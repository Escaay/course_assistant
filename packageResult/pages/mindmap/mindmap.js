Page({
  data: {
    url: ''
  },

  onLoad: function(options) {
    if (options.url) {
      // 直接使用传入的 URL，因为 markdown 已经包含在 URL 中了
      this.setData({
        url: decodeURIComponent(options.url)
      });
    }
  },

  // 处理来自web-view的消息
  handleMessage(e) {
    console.log('收到 web-view 消息:', e.detail);
    const message = e.detail.data[0];
    if (message.action === 'error') {
      wx.showToast({
        title: '思维导图生成失败',
        icon: 'none'
      });
    }
  }
}); 