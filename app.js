// app.js
App({
  onLaunch: async function() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      var c1 = new wx.cloud.Cloud({
				// 资源方 AppID
				resourceAppid: 'wx93739e7f65cff363',
				// 资源方环境 ID
				resourceEnv: 'cloud1-0gys80m48da147a1',
			  })
			  
			  // 跨账号调用，必须等待 init 完成
			  // init 过程中，资源方小程序对应环境下的 cloudbase_auth 函数会被调用，并需返回协议字段（见下）来确认允许访问、并可自定义安全规则
			await c1.init()
      
      // 获取云存储图片的真实URL
      c1.getTempFileURL({
        fileList: ['cloud://cloud1-0gys80m48da147a1.636c-cloud1-0gys80m48da147a1-1304271127/course_assitant/share.jpg'],
        success: (res) => {
          this.globalData.shareImageUrl = res.fileList[0].tempFileURL;
          console.log('分享图片URL获取成功:', this.globalData.shareImageUrl);
        },
        fail: (err) => {
          console.error('获取分享图片失败:', err);
        }
      });
    }
  },
  
  onShow: function() {
    // 可以添加更新管理器
    if (typeof updateManager === 'function') {
      updateManager();
    }
  },
  
  globalData: {
    fileList: [],
    markdownContent: '',
    mindMapData: null,
    originalMarkdown: '',
    isStreamingMarkdown: false,
    streamedMarkdown: '',
    streamingComplete: false,
    shareImageUrl: ''
  }
})
