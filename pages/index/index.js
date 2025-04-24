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
    showUploadOptionsPopup: false,
    logoUrl: '',
    slogans: [
      "上传你的文件，自动生成总结",
      "一键生成思维导图，让知识可视化",
      "智能文档助手，让学习更轻松"
    ]
  },

  onLoad() {
    // 页面加载时清空全局数据
    app.globalData.fileList = [];
    app.globalData.markdownContent = '';
    app.globalData.mindMapData = null;

    // 初始化云环境并获取logo
    const c1 = new wx.cloud.Cloud({
      resourceAppid: 'wx93739e7f65cff363',
      resourceEnv: 'cloud1-0gys80m48da147a1',
    });
    
    c1.init().then(() => {
      // 获取logo文件的真实链接
      return c1.getTempFileURL({
        fileList: ['cloud://cloud1-0gys80m48da147a1.636c-cloud1-0gys80m48da147a1-1304271127/course_assitant/course_logo.webp']
      });
    }).then(res => {
      if (res.fileList && res.fileList[0] && res.fileList[0].tempFileURL) {
        this.setData({
          logoUrl: res.fileList[0].tempFileURL
        });
      }
    }).catch(err => {
      console.error('获取logo失败:', err);
    });
  },

  chooseFile() {
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
          const fileExt = fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();
          
          // 验证文件类型
          if (fileExt !== 'pdf' && fileExt !== 'doc' && fileExt !== 'docx') {
            wx.showToast({
              title: '仅支持PDF和Word文档',
              icon: 'none'
            });
            return;
          }
          
          const fileType = fileExt === 'pdf' ? 'PDF' : 'DOC';
          
          // 计算文件大小（KB）
          const fileSizeKB = Math.round(file.size / 1024);
          
          // 添加到文件列表
          const newFile = {
            path: file.path,
            name: fileName,
            size: fileSizeKB,
            type: fileType,
            originalName: fileName
          };
          
          this.setData({
            fileList: [...this.data.fileList, newFile]
          });
        }
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
  
  async convertFiles() {
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
    
    try {
      // 创建新的云实例
      const c1 = new wx.cloud.Cloud({
        resourceAppid: 'wx93739e7f65cff363',
        resourceEnv: 'cloud1-0gys80m48da147a1',
      });
      
      await c1.init();
      console.log('云环境初始化成功');

      // 使用初始化后的云实例上传文件
      const fileIDs = await this.uploadFilesToCloud(c1);
      console.log('上传的文件IDs类型:', typeof fileIDs, '内容:', fileIDs, '是否是数组:', Array.isArray(fileIDs));

      // 使用同一个云实例调用云函数
      const res = await c1.callFunction({
        name: 'convertToMarkdown',
        data: {
          fileIDs: fileIDs,
          deleteAfterConversion: true
        }
      });

      console.log('转换结果:', res);
      
      if (res.result && res.result.success) {
        const markdown = res.result.markdown;
        console.log('云函数返回的Markdown:', markdown);
        
        this.setData({
          markdownContent: markdown,
          aiProcessing: true,
          aiProgress: 0
        });
        
        // 使用AI优化内容
        await this.processWithAI(markdown);
      } else {
        throw new Error(res.result.error || '转换失败');
      }
    } catch (err) {
      console.error('转换错误:', err);
      wx.showToast({
        title: '转换失败: ' + (err.message || '未知错误'),
        icon: 'none'
      });
    } finally {
      this.setData({
        isConverting: false
      });
    }
  },
  
  async processWithAI(markdown) {
    try {
			var c1 = new wx.cloud.Cloud({
				// 资源方 AppID
				resourceAppid: 'wx93739e7f65cff363',
				// 资源方环境 ID
				resourceEnv: 'cloud1-0gys80m48da147a1',
			  })
    
      // 跨账号调用，必须等待 init 完成
      // init 过程中，资源方小程序对应环境下的 cloudbase_auth 函数会被调用，并需返回协议字段（见下）来确认允许访问、并可自定义安全规则
      await c1.init()
      // 创建模型实例
      const model = c1.extend.AI.createModel("deepseek");
      
      // 构建系统消息和用户消息
      const messages = [
        {
          role: "system", 
          content: `你是一位AI Markdown优化大师，你的任务是对接收到的Markdown文本进行优化，使其结构清晰、重点突出并且美观易读。

目标：
- 提炼和总结内容，突出重点
- 使用合适的标题和子标题组织内容
- 通过加粗、斜体等方式强调关键点
- 适当使用echarts图表（仅限柱状图、折线图、饼图）
  - 图表必须使用\`\`\`echarts 和 \`\`\`包裹
  - 所有echarts图表必须包含完整的xAxis和yAxis配置
  - 柱状图和折线图必须同时包含xAxis和yAxis配置
  - 饼图必须包含完整的series配置
  - echarts中可以使用中文文本，但必须确保JSON格式严格有效
  - 所有JSON键和值必须使用双引号，不能使用单引号
  - 示例格式:
    // 柱状图示例 - 必须包含这些完整配置
    \`\`\`echarts
    {
      "title": {
        "text": "销售数据分析"
      },
      "tooltip": {},
      "xAxis": {
        "type": "category",
        "data": ["一月", "二月", "三月"]
      },
      "yAxis": {
        "type": "value"
      },
      "series": [{
        "name": "销售额",
        "data": [120, 200, 150],
        "type": "bar"
      }]
    }
    \`\`\`

    // 饼图示例 - 必须包含这些完整配置
    \`\`\`echarts
    {
      "title": {
        "text": "收入来源分布",
        "left": "center"
      },
      "tooltip": {
        "trigger": "item"
      },
      "series": [{
        "type": "pie",
        "radius": "50%",
        "data": [
          { "value": 40, "name": "产品销售" },
          { "value": 30, "name": "技术服务" },
          { "value": 30, "name": "咨询业务" }
        ],
        "emphasis": {
          "itemStyle": {
            "shadowBlur": 10,
            "shadowOffsetX": 0,
            "shadowColor": "rgba(0, 0, 0, 0.5)"
          }
        }
      }]
    }
    \`\`\`
    
    // 折线图示例 - 必须包含这些完整配置
    \`\`\`echarts
    {
      "title": {
        "text": "月度趋势分析"
      },
      "tooltip": {},
      "xAxis": {
        "type": "category",
        "data": ["一月", "二月", "三月", "四月", "五月"]
      },
      "yAxis": {
        "type": "value"
      },
      "series": [{
        "data": [820, 932, 901, 934, 1290],
        "type": "line"
      }]
    }
    \`\`\`

- 可以使用latex数学公式
  - 行内公式使用单个$包裹，如 $E=mc^2$
  - 多行公式使用$$包裹，且$$符号必须单独占一行，例如：
    $$
    \\begin{aligned}
    y &= x^2 \\\\
    &= (a+b)^2 \\\\
    &= a^2 + 2ab + b^2
    \\end{aligned}
    $$
  - 错误示例（不要这样做）：
    $$ y = x^2 $$
  - 正确示例（必须这样做）：
    $$
    y = x^2
    $$
  - 不要使用\`\`\`math代码块，必须使用$$符号
  - 在数学公式中，必须使用\\&来表示"与"符号，不要直接使用&符号
  - 例如，写"研发(R&D)"应该写成"研发(R\\&D)"或者直接写"研发(RD)"
- 可以使用yuml图表示流程
  - 必须使用\`\`\`yuml和\`\`\`包裹
  - 必须使用正确的类型声明，支持的类型有：
    - // {type:class} - 用于类图
    - // {type:activity} - 用于活动图
    - // {type:usecase} - 用于用例图
    - // {type:state} - 用于状态图
    - // {type:deployment} - 用于部署图
    - // {type:sequence} - 用于序列图
  - 活动图示例（推荐使用）:
    \`\`\`yuml
    // {type:activity}
    (start)->[构建预警系统]->[加强合规管理]->[推进贸易协定]->(end)
    \`\`\`
  - 类图示例:
    \`\`\`yuml
    // {type:class}
    [客户]<>-订单*>[订单]
    [订单]++-0..1>[配送地址]
    \`\`\`
  - 不要使用冒号(:)开头的语法，使用方括号和箭头
  - 确保每个节点都用方括号或圆括号包围
  - 确保所有节点之间都有箭头连接
  - YUML图表中可以使用中文

注意：
- 保持核心信息准确
- 绝对不要使用\`\`\`markdown包裹内容，直接输出格式化文本即可
- 不要输出类似"五号宋体，首行缩进2字符，1.5倍行距"这样的格式说明，直接应用格式
- 不要使用\`\`\`math代码块，数学公式必须使用$$符号
- 不要使用mermaid格式
- 确保所有格式标签正确闭合
- 所有图表必须使用正确的代码块格式
- 多行数学公式的$$符号必须单独占一行，不能与公式内容在同一行
- echarts配置必须完整，柱状图和折线图必须同时包含xAxis和yAxis配置
- 不要在echarts中使用不完整的配置，必须按照示例格式提供所有必要的配置项
- 不要在echarts中使用复杂的formatter函数，保持配置简单
- echarts中的JSON必须严格有效：
  - 可以使用中文文本，但要确保JSON格式正确
  - 所有键和值必须使用双引号，不能使用单引号
  - 不要在JSON中使用注释
  - 数值不需要引号，但文本必须使用引号
  - 避免在JSON文本中使用特殊控制字符
- 特殊字符处理：
  - 在数学公式中使用特殊字符时需要正确转义，例如使用\\&代替&
  - 在文本中避免直接使用HTML特殊字符，如&、<、>等，应使用对应的转义形式
  - 在LaTeX公式中，&符号用于对齐，如果要表示字面上的"&"，必须使用\\&
  - 如果需要表示"R&D"这样的术语，请使用"R\\&D"或简单地使用"RD"代替
- YUML图表注意事项：
  - 不要使用冒号(:)开头的活动语法，这可能导致解析错误
  - 活动图中的节点必须用方括号[...]或圆括号(...)包围
  - 节点之间必须使用箭头(->)连接
  - 开始和结束节点应使用(start)和(end)
  - 必须使用ASCII箭头"->"，不能使用Unicode箭头字符"→"或其他箭头符号
  - 所有箭头必须使用连字符和大于号组合"->"表示，不能使用其他箭头表示法
  - 错误示例（不要这样做）：(start)→[步骤1]→[步骤2]→(end)
  - 正确示例（必须这样做）：(start)->[步骤1]->[步骤2]->(end)`
        },
        {
          role: "user",
          content: markdown
        }
      ];

      // 调用模型
      const res = await model.streamText({
        data: {
          model: "deepseek-r1",
          messages: messages
        }
      });
      
      // 保存原始 Markdown 到全局变量
      app.globalData.originalMarkdown = markdown;
      
      // 设置流式接收标志
      app.globalData.isStreamingMarkdown = true;
      app.globalData.streamingComplete = false;
      app.globalData.streamedMarkdown = '';
      
      // 跳转到结果页面
      wx.navigateTo({
        url: '/packageResult/pages/result/result',
        success: () => {
          this.setData({
            isConverting: false,
            aiProcessing: false
          });
        }
      });
      
      // 处理流式响应
      let fullContent = '';
      let lastUpdateTime = Date.now();
      
      const processStream = new Promise(async (resolve, reject) => {
        try {
          for await (let event of res.eventStream) {
            if (event.data === '[DONE]') {
              console.log('AI响应完成', fullContent);
              // 确保最终内容被保存到全局变量
              app.globalData.markdownContent = fullContent;
              app.globalData.streamedMarkdown = fullContent;
              break;
            }
            
            try {
              const data = JSON.parse(event.data);
              
              // 获取思维链内容
              const think = data?.choices?.[0]?.delta?.reasoning_content;
              if (think) {
                // console.log('思维链:', think);
              }
              
              // 获取生成的文本内容
              const text = data?.choices?.[0]?.delta?.content;
              if (text) {
                fullContent += text;
                app.globalData.markdownContent = fullContent;
                app.globalData.streamedMarkdown = fullContent;
                lastUpdateTime = Date.now();
              }
            } catch (parseError) {
              console.error('解析事件数据失败:', parseError);
            }
          }
          
          // 在循环结束后再次确保最终内容被保存
          app.globalData.markdownContent = fullContent;
          app.globalData.streamedMarkdown = fullContent;
          resolve(fullContent);
        } catch (error) {
          // 即使出错，也保存已收集的内容
          app.globalData.markdownContent = fullContent;
          app.globalData.streamedMarkdown = fullContent;
          reject(error);
        }
      });
      
      // 超时检查
      const timeoutCheck = () => {
        const now = Date.now();
        if (now - lastUpdateTime > 60000) {
          app.globalData.markdownContent = fullContent;
          app.globalData.isStreamingMarkdown = false;
          app.globalData.streamingComplete = true;
          return;
        }
        
        if (!app.globalData.streamingComplete) {
          setTimeout(timeoutCheck, 2000);
        }
      };
      
      setTimeout(timeoutCheck, 2000);
      
      try {
        fullContent = await processStream;
        app.globalData.markdownContent = fullContent;
        app.globalData.isStreamingMarkdown = false;
        app.globalData.streamingComplete = true;
      } catch (streamError) {
        console.error('处理流式响应失败:', streamError);
        app.globalData.markdownContent = fullContent || markdown;
        app.globalData.isStreamingMarkdown = false;
        app.globalData.streamingComplete = true;
      }
      
    } catch (error) {
      console.error('AI处理失败:', error);
      app.globalData.markdownContent = markdown;
      app.globalData.isStreamingMarkdown = false;
      app.globalData.streamingComplete = true;
      
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
  
  async uploadFilesToCloud(cloudInstance) {
    if (!this.data.fileList || this.data.fileList.length === 0) {
      throw new Error('文件列表为空');
    }

    const uploadPromises = this.data.fileList.map(file => {
      return cloudInstance.uploadFile({
        cloudPath: `uploads/${new Date().getTime()}_${file.originalName}`,
        filePath: file.path
      }).catch(error => {
        console.error(`文件 ${file.originalName} 上传失败:`, error);
        wx.showToast({
          title: `${file.originalName} 上传失败: ${error.errMsg || '未知错误'}`,
          icon: 'none',
          duration: 3000
        });
        throw error;
      });
    });

    const results = await Promise.all(uploadPromises);
    return results.map(res => res.fileID);
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

  // 添加分享功能
  onShareAppMessage() {
    return {
      title: '智能文档小助手',
      path: '/pages/index/index',
      imageUrl: getApp().globalData?.shareImageUrl
    };
  },

  onShareTimeline() {
    return {
      title: '智能文档小助手',
      query: '',
      imageUrl: getApp().globalData?.shareImageUrl
    };
  },
});
