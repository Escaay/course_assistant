Component({
  properties: {
    data: {
      type: Object,
      value: {}
    },
    width: {
      type: Number,
      value: 375
    },
    height: {
      type: Number,
      value: 500
    }
  },
  
  data: {
    scale: 1,
    translateX: 0,
    translateY: 0,
    startX: 0,
    startY: 0,
    moving: false,
    nodeWidth: 200,  // 节点宽度
    nodeHeight: 40,  // 节点高度
    horizontalGap: 60,  // 水平间距
    verticalGap: 40,  // 垂直间距
    totalWidth: 0,  // 总宽度
    totalHeight: 0,  // 总高度
    autoFit: true,  // 是否自动适应
    canvasReady: false
  },
  
  lifetimes: {
    attached() {
      // 计算思维导图的总宽度和高度
      this.calculateSize(this.properties.data);
      
      // 自动适应屏幕
      if (this.data.autoFit) {
        this.autoFitToScreen();
      }
    },
    
    ready() {
      this.onReady();
    }
  },
  
  methods: {
    // 计算思维导图的总宽度和高度
    calculateSize(node, level = 0, index = 0) {
      if (!node) return { width: 0, height: 0 };
      
      const { nodeWidth, nodeHeight, horizontalGap, verticalGap } = this.data;
      
      // 如果没有子节点
      if (!node.children || node.children.length === 0) {
        return { width: nodeWidth, height: nodeHeight };
      }
      
      // 计算所有子节点的总高度
      let totalChildrenHeight = 0;
      let maxChildWidth = 0;
      
      node.children.forEach((child, i) => {
        const childSize = this.calculateSize(child, level + 1, i);
        totalChildrenHeight += childSize.height + (i > 0 ? verticalGap : 0);
        maxChildWidth = Math.max(maxChildWidth, childSize.width);
      });
      
      // 当前节点的宽度 + 水平间距 + 子节点的最大宽度
      const width = nodeWidth + horizontalGap + maxChildWidth;
      // 子节点的总高度或当前节点的高度（取较大值）
      const height = Math.max(nodeHeight, totalChildrenHeight);
      
      // 更新总宽度和高度
      this.setData({
        totalWidth: Math.max(this.data.totalWidth, width),
        totalHeight: Math.max(this.data.totalHeight, height)
      });
      
      return { width, height };
    },
    
    // 自动适应屏幕
    autoFitToScreen() {
      const { width, height, totalWidth, totalHeight } = this.data;
      
      // 计算合适的缩放比例
      const scaleX = width / (totalWidth + 40);  // 添加一些边距
      const scaleY = height / (totalHeight + 40);
      const scale = Math.min(scaleX, scaleY, 1);  // 不要放大，只缩小
      
      // 居中显示
      const translateX = (width - totalWidth * scale) / 2;
      const translateY = (height - totalHeight * scale) / 2;
      
      this.setData({
        scale,
        translateX,
        translateY
      });
    },
    
    // 处理触摸开始事件
    handleTouchStart(e) {
      const touch = e.touches[0];
      this.setData({
        startX: touch.clientX,
        startY: touch.clientY,
        moving: true
      });
    },
    
    // 处理触摸移动事件
    handleTouchMove(e) {
      if (!this.data.moving) return;
      
      const touch = e.touches[0];
      const deltaX = touch.clientX - this.data.startX;
      const deltaY = touch.clientY - this.data.startY;
      
      this.setData({
        translateX: this.data.translateX + deltaX,
        translateY: this.data.translateY + deltaY,
        startX: touch.clientX,
        startY: touch.clientY
      });
    },
    
    // 处理触摸结束事件
    handleTouchEnd() {
      this.setData({
        moving: false
      });
    },
    
    // 处理缩放事件
    handleScale(e) {
      const scale = this.data.scale * (e.detail.scale > 1 ? 1.1 : 0.9);
      this.setData({
        scale: Math.max(0.1, Math.min(2, scale))  // 限制缩放范围
      });
    },
    
    onReady() {
      const query = this.createSelectorQuery();
      query.select('#mindmap-canvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          
          // 设置canvas的宽高
          canvas.width = this.data.totalWidth;
          canvas.height = this.data.totalHeight;
          
          // 绘制思维导图
          this.drawMindMap(ctx, this.properties.data, 20, this.data.totalHeight / 2);
          
          this.setData({
            canvasReady: true
          });
        });
    },
    
    // 绘制思维导图
    drawMindMap(ctx, node, x, y, level = 0) {
      if (!node) return;
      
      const { nodeWidth, nodeHeight, horizontalGap } = this.data;
      
      // 绘制当前节点
      this.drawNode(ctx, node.name, x, y, level);
      
      if (!node.children || node.children.length === 0) return;
      
      // 计算子节点的起始y坐标
      const totalChildrenHeight = node.children.length * nodeHeight + (node.children.length - 1) * 20;
      let startY = y - totalChildrenHeight / 2 + nodeHeight / 2;
      
      // 绘制子节点
      node.children.forEach((child, index) => {
        const childX = x + nodeWidth + horizontalGap;
        const childY = startY + index * (nodeHeight + 20);
        
        // 绘制连接线
        ctx.beginPath();
        ctx.moveTo(x + nodeWidth, y);
        ctx.lineTo(childX, childY);
        ctx.strokeStyle = '#999';
        ctx.stroke();
        
        // 递归绘制子节点
        this.drawMindMap(ctx, child, childX, childY, level + 1);
      });
    },
    
    // 绘制节点
    drawNode(ctx, text, x, y, level) {
      const { nodeWidth, nodeHeight } = this.data;
      
      // 根据层级设置不同的样式
      let bgColor, textColor, borderColor;
      
      if (level === 0) {
        bgColor = '#0052d9';
        textColor = '#fff';
        borderColor = '#0052d9';
      } else if (level === 1) {
        bgColor = '#e6f7ff';
        textColor = '#0052d9';
        borderColor = '#0052d9';
      } else {
        bgColor = '#f0f0f0';
        textColor = '#333';
        borderColor = '#ccc';
      }
      
      // 绘制节点背景
      ctx.fillStyle = bgColor;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y - nodeHeight / 2, nodeWidth, nodeHeight, 5);
      ctx.fill();
      ctx.stroke();
      
      // 绘制文本
      ctx.fillStyle = textColor;
      ctx.font = level === 0 ? 'bold 14px sans-serif' : '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // 文本超出宽度时截断
      const maxTextWidth = nodeWidth - 20;
      let displayText = text;
      
      if (ctx.measureText(text).width > maxTextWidth) {
        // 截断文本并添加省略号
        let tempText = text;
        while (ctx.measureText(tempText + '...').width > maxTextWidth && tempText.length > 0) {
          tempText = tempText.substring(0, tempText.length - 1);
        }
        displayText = tempText + '...';
      }
      
      ctx.fillText(displayText, x + nodeWidth / 2, y);
    }
  }
}); 