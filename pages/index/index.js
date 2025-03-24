// index.js
const app = getApp();

Page({
  data: {
    fileList: [],
    isConverting: false,
    markdownContent: '',
    aiProcessing: false,
    aiProgress: 0,
    aiResponseVisible: false,
    aiResponseText: '',
    showUploadOptionsPopup: false
  },

  onLoad() {
    // 页面加载时清空全局数据
    app.globalData.fileList = [];
    app.globalData.markdownContent = '';
    app.globalData.mindMapData = null;
    
    // 初始化云开发
    wx.cloud.init({
      env: "cloud1-6gvmnnngc2e558b1"
    });
  },

  chooseFile() {
    wx.chooseMessageFile({
      count: 1, // 限制只能选择一个文件，避免界面过长
      type: 'file',
      extension: ['pdf', 'doc', 'docx'],
      success: (res) => {
        const tempFiles = res.tempFiles;
        const newFileList = [...this.data.fileList];
        
        tempFiles.forEach(file => {
          // 获取文件类型
          const extension = file.name.split('.').pop().toLowerCase();
          let type = '';
          
          if (extension === 'pdf') {
            type = 'PDF';
          } else if (extension === 'doc' || extension === 'docx') {
            type = 'DOC';
          }
          
          // 计算文件大小（KB）
          const size = (file.size / 1024).toFixed(2);
          
          // 限制文件名长度，避免显示溢出
          let displayName = file.name;
          if (displayName.length > 20) {
            const ext = displayName.split('.').pop();
            displayName = displayName.substring(0, 17) + '...' + (ext ? '.' + ext : '');
          }
          
          newFileList.push({
            path: file.path,
            name: displayName,
            originalName: file.name,
            size: size,
            type: type
          });
        });
        
        this.setData({
          fileList: newFileList
        });
        
        app.globalData.fileList = newFileList;
      }
    });
  },
  
  deleteFile(e) {
    const index = e.currentTarget.dataset.index;
    const newFileList = [...this.data.fileList];
    newFileList.splice(index, 1);
    
    this.setData({
      fileList: newFileList
    });
    
    app.globalData.fileList = newFileList;
  },
  
  convertFiles() {
    if (this.data.fileList.length === 0) {
      wx.showToast({
        title: '请先选择文件',
        icon: 'none'
      });
      return;
    }
    
    this.setData({
      isConverting: true
    });
    
    // 上传文件到云存储
    this.uploadFilesToCloud().then(fileIDs => {
      // 调用云函数进行文件转换
      return wx.cloud.callFunction({
        name: 'convertToMarkdown',
        data: {
          fileIDs: fileIDs
        }
      });
    }).then(res => {
      console.log('转换结果:', res);
      
      if (res.result && res.result.success) {
        const markdown = res.result.markdown;
        console.log('云函数返回的Markdown:', markdown);
        
        // 保存Markdown内容
        this.setData({
          markdownContent: markdown,
          aiProcessing: true,
          aiProgress: 0
        });
        
        // 使用AI优化内容
        this.processWithAI(markdown);
      } else {
        throw new Error(res.result.error || '转换失败');
      }
    }).catch(err => {
      console.error('转换错误:', err);
      wx.showToast({
        title: '转换失败: ' + err.message,
        icon: 'none'
      });
      
      this.setData({
        isConverting: false
      });
    });
  },
  
  async processWithAI(markdown) {
    try {
      // 使用小程序内置的AI能力
      const res = await wx.cloud.extend.AI.bot.sendMessage({
        data: {
          botId: 'bot-1e0396fa',
          msg: markdown
        }
      });
      
      // 保存原始 Markdown 到全局变量
      app.globalData.originalMarkdown = markdown;
      
      // 设置流式接收标志
      app.globalData.isStreamingMarkdown = true;
      app.globalData.streamingComplete = false; // 确保初始状态为未完成
      
      // 初始化接收到的内容
      app.globalData.streamedMarkdown = '';
      
      // 立即跳转到结果页面
      console.log('跳转结果页面');
      wx.navigateTo({
        url: '/packageResult/pages/result/result',
        success: () => {
          // 跳转成功后，隐藏首页的loading状态
          this.setData({
            isConverting: false,
            aiProcessing: false
          });
        }
      });
      
      // 在后台继续接收数据
      let fullContent = '';
      let lastUpdateTime = Date.now();
      
      // 创建一个Promise来等待所有数据接收完成
      const processStream = new Promise(async (resolve, reject) => {
        try {
          for await (let event of res.eventStream) {
            // 收到结束信号，终止循环
            if (event.data === '[DONE]') {
              console.log('AI响应完成 - 收到[DONE]信号');
              break;
            }
            
            try {
              // 打印原始数据
              // console.log('AI返回数据:', event.data);
              
              const data = JSON.parse(event.data);
              
              // 获取思维链内容（如果有）
              const think = data.reasoning_content;
              if (think) {
                // console.log('AI思维链:', think);
              }
              
              // 获取输出内容
              const content = data.content;
              if (content) {
                // console.log('AI内容片段:', content);
                fullContent += content;
                
                // 更新全局变量中的流式内容
                app.globalData.markdownContent = fullContent;
                app.globalData.streamedMarkdown = fullContent;
                // console.log('当前累积内容长度:', fullContent.length);
                lastUpdateTime = Date.now();
              }
            } catch (parseError) {
              console.error('解析事件数据失败:', parseError);
              // 继续处理下一个事件
            }
          }
          
          // 所有数据接收完成
          console.log('事件流处理完成');
          resolve(fullContent);
        } catch (error) {
          console.error('处理事件流时出错:', error);
          reject(error);
        }
      });
      
      // 设置一个超时检查，确保在没有新数据时也能正确完成
      const timeoutCheck = () => {
        const now = Date.now();
        const timeSinceLastUpdate = now - lastUpdateTime;
        
        // 如果超过10秒没有新数据，认为生成已完成
        if (timeSinceLastUpdate > 60000) {
          console.log('超过60秒没有新数据，认为生成已完成');
          app.globalData.markdownContent = fullContent;
          app.globalData.isStreamingMarkdown = false;
          app.globalData.streamingComplete = true;
          return;
        }
        
        // 如果还在接收数据，继续检查
        if (!app.globalData.streamingComplete) {
          setTimeout(timeoutCheck, 2000);
        }
      };
      
      // 启动超时检查
      setTimeout(timeoutCheck, 2000);
      
      try {
        // 等待所有数据接收完成
        fullContent = await processStream;
        
        console.log('AI完整响应:', fullContent);
        
        // AI处理完成
        app.globalData.markdownContent = fullContent;
        app.globalData.isStreamingMarkdown = false;
        app.globalData.streamingComplete = true;
        
        console.log('流式生成完成，已设置streamingComplete=true');
      } catch (streamError) {
        console.error('处理流式响应失败:', streamError);
        
        // 如果处理失败但已有部分内容，使用已接收的内容
        if (fullContent) {
          app.globalData.markdownContent = fullContent;
        } else {
          app.globalData.markdownContent = markdown;
        }
        
        app.globalData.isStreamingMarkdown = false;
        app.globalData.streamingComplete = true;
      }
      
    } catch (error) {
      console.error('AI处理失败:', error);
      
      // 如果AI处理失败，使用原始Markdown
      app.globalData.markdownContent = markdown;
      app.globalData.isStreamingMarkdown = false;
      app.globalData.streamingComplete = true;
      
      // 如果用户还在首页，显示错误提示
      if (getCurrentPages().slice(-1)[0].route === 'pages/index/index') {
        this.setData({
          isConverting: false,
          aiProcessing: false
        });
        
        wx.showToast({
          title: 'AI优化失败，使用原始内容',
          icon: 'none',
          duration: 2000
        });
      }
    }
  },
  
  uploadFilesToCloud() {
    return new Promise((resolve, reject) => {
      const fileList = this.data.fileList;
      const uploadPromises = fileList.map(file => {
        return wx.cloud.uploadFile({
          cloudPath: `uploads/${new Date().getTime()}_${file.originalName}`,
          filePath: file.path
        });
      });
      
      Promise.all(uploadPromises)
        .then(results => {
          const fileIDs = results.map(res => res.fileID);
          resolve(fileIDs);
        })
        .catch(err => {
          reject(err);
        });
    });
  },
  
  generateMindMapData(markdown) {
    const lines = markdown.split('\n');
    const rootNode = {
      name: '文档概览',
      children: []
    };
    
    let currentH1 = null;
    let currentH2 = null;
    
    lines.forEach(line => {
      line = line.trim();
      
      // 检测H1标题 (# 开头)
      if (line.startsWith('# ')) {
        const title = line.substring(2).trim();
        currentH1 = {
          name: title,
          children: []
        };
        rootNode.children.push(currentH1);
        currentH2 = null;
      } 
      // 检测H2标题 (## 开头)
      else if (line.startsWith('## ')) {
        const title = line.substring(3).trim();
        if (currentH1) {
          currentH2 = {
            name: title,
            children: []
          };
          currentH1.children.push(currentH2);
        } else {
          currentH2 = {
            name: title,
            children: []
          };
          rootNode.children.push(currentH2);
        }
      }
      // 检测H3标题或重要内容 (### 开头或短句)
      else if (line.startsWith('### ') || (line.length > 0 && line.length < 50 && !line.includes('. '))) {
        const title = line.startsWith('### ') ? line.substring(4).trim() : line;
        if (currentH2) {
          currentH2.children.push({
            name: title
          });
        } else if (currentH1) {
          currentH1.children.push({
            name: title
          });
        }
      }
    });
    
    return rootNode;
  },

  // 显示上传选项弹框
  showUploadOptions() {
    this.setData({
      showUploadOptionsPopup: true
    });
  },

  // 关闭上传选项弹框
  closeUploadOptions() {
    this.setData({
      showUploadOptionsPopup: false
    });
  },

  // 处理弹框可见性变化
  onPopupVisibleChange(e) {
    if (!e.detail.visible) {
      this.closeUploadOptions();
    }
  },

  // 从微信文件选择
  chooseWechatFile() {
    this.closeUploadOptions();
    
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf', 'doc', 'docx'],
      success: (res) => {
        const tempFiles = res.tempFiles;
        if (tempFiles.length > 0) {
          const file = tempFiles[0];
          
          // 获取文件类型
          const fileName = file.name || '';
          const fileExt = fileName.substring(fileName.lastIndexOf('.') + 1).toUpperCase();
          const fileType = fileExt === 'PDF' ? 'PDF' : 'DOC';
          
          // 计算文件大小（KB）
          const fileSizeKB = Math.round(file.size / 1024);
          
          // 添加到文件列表
          const newFile = {
            path: file.path,
            name: fileName,
            size: fileSizeKB,
            type: fileType
          };
          
          this.setData({
            fileList: [...this.data.fileList, newFile]
          });
        }
      }
    });
  },

  // 从本机文件选择
  chooseLocalFile() {
    this.closeUploadOptions();
    
    // 使用wx.chooseMessageFile但设置type为file
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf', 'doc', 'docx'],
      success: (res) => {
        const tempFiles = res.tempFiles;
        if (tempFiles.length > 0) {
          const file = tempFiles[0];
          
          // 获取文件类型
          const fileName = file.name || '';
          const fileExt = fileName.substring(fileName.lastIndexOf('.') + 1).toUpperCase();
          const fileType = fileExt === 'PDF' ? 'PDF' : 'DOC';
          
          // 计算文件大小（KB）
          const fileSizeKB = Math.round(file.size / 1024);
          
          // 将文件复制到用户目录下以便后续读取
          const fs = wx.getFileSystemManager();
          const targetPath = `${wx.env.USER_DATA_PATH}/${fileName}`;
          
          fs.copyFile({
            srcPath: file.path,
            destPath: targetPath,
            success: () => {
              console.log('文件复制成功，保存路径：', targetPath);
              
              // 添加到文件列表
              const newFile = {
                path: targetPath, // 使用新的路径
                name: fileName,
                size: fileSizeKB,
                type: fileType
              };
              
              this.setData({
                fileList: [...this.data.fileList, newFile]
              });
              
              // 如果需要读取文件内容，可以在这里添加读取逻辑
              this.readFileContent(targetPath, fileExt);
            },
            fail: (err) => {
              console.error('复制文件失败：', err);
              wx.showToast({
                title: '文件处理失败',
                icon: 'none'
              });
            }
          });
        }
      }
    });
  },

  // 读取文件内容
  readFileContent(filePath, fileExt) {
    const fs = wx.getFileSystemManager();
    
    // 根据文件类型选择不同的处理方式
    if (fileExt === 'TXT' || fileExt === 'JSON') {
      // 读取文本文件
      fs.readFile({
        filePath: filePath,
        encoding: 'utf-8', // 使用utf-8编码避免中文乱码
        success: (res) => {
          console.log('文件内容：', res.data);
          // 这里可以处理文件内容，例如显示在界面上
        },
        fail: (err) => {
          console.error('读取文件失败：', err);
        }
      });
    } else if (fileExt === 'PDF' || fileExt === 'DOC' || fileExt === 'DOCX') {
      // 对于PDF和Word文档，可以使用wx.openDocument打开
      wx.openDocument({
        filePath: filePath,
        showMenu: true,
        success: () => {
          console.log('打开文档成功');
        },
        fail: (err) => {
          console.error('打开文档失败：', err);
        }
      });
    }
  },

  // 获取指定目录下的所有文件列表
  getFilesList(dirPath) {
    const fs = wx.getFileSystemManager();
    let filesList = [];
    
    try {
      const files = fs.readdirSync(dirPath);
      files.forEach(file => {
        // 排除文件夹
        if (!fs.statSync(dirPath + '/' + file).isDirectory()) {
          filesList.push(file);
        }
      });
      console.log('目录下的文件列表：', filesList);
      return filesList;
    } catch (e) {
      console.log('读取文件列表失败', e);
      return [];
    }
  },
});
