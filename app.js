// app.js
App({
  onLaunch: function() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-0gys80m48da147a1', // 替换为你的云环境ID
        traceUser: true,
      });
    }
  },
  globalData: {
    fileList: [],
    markdownContent: '',
    mindMapData: null,
    originalMarkdown: '',
    isStreamingMarkdown: false,
    streamedMarkdown: '',
    streamingComplete: false
  }
})
