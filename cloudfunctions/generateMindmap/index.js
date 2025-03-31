// 云函数 convertMarkdownToImage/index.js
const cloud = require('wx-server-sdk');
const { Transformer } = require('markmap-lib');

cloud.init({ env: "cloud1-0gys80m48da147a1" });

// 定义颜色数组
const COLORS = [
  '#2196f3', // 蓝色
  '#4caf50', // 绿色
  '#ff9800', // 橙色
  '#f44336', // 红色
  '#9c27b0', // 紫色
  '#00bcd4', // 青色
  '#e91e63'  // 粉色
];

exports.main = async (event) => {
  try {
    if (!event.content) {
      throw new Error('Content is required');
    }

    const transformer = new Transformer();
    const { root } = transformer.transform(event.content);
    
    console.log('转换后的数据:', JSON.stringify(root, null, 2));

    const width = 2000; // 增加宽度
    const height = 1600; // 增加高度
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <style>
        .markmap-node { cursor: pointer; }
        .markmap-node-circle { stroke-width: 1.5px; }
        .markmap-node-text { font: 300 14px/20px sans-serif; }
        .markmap-link { fill: none; stroke-width: 1.5px; }
        .markmap-node-text tspan { font: 300 14px/20px sans-serif; }
        .markmap-node-text code { font-family: monospace; }
        .markmap-node-text strong { font-weight: 500; }
      </style>
      <g transform="translate(60,${height/2})">${generateNodes(root, width, height)}</g>
    </svg>`;

    return {
      image: Buffer.from(svg).toString('base64')
    };
  } catch (err) {
    console.error('错误:', err);
    return { error: err.message };
  }
};

function generateNodes(node, width, height, x = 0, y = 0, level = 0, colorIndex = 0) {
  let output = '';
  const content = node.v || '';
  const hasChildren = node.c && node.c.length > 0;
  const color = COLORS[colorIndex % COLORS.length];
  const circleRadius = Math.max(5 - level * 0.5, 3);
  const fontSize = Math.max(16 - level, 12);
  
  // 生成当前节点
  output += `<g class="markmap-node">
    <circle class="markmap-node-circle" cx="${x}" cy="${y}" r="${circleRadius}" fill="#fff" stroke="${color}"/>
  </g>`;

  // 如果有子节点，递归生成
  if (hasChildren) {
    const nodeHeight = calculateNodeHeight(content);
    const totalChildrenHeight = node.c.reduce((sum, child) => 
      sum + calculateNodeHeight(child.v || ''), 0);
    const childSpacing = Math.max(40, nodeHeight);
    
    let currentY = y - totalChildrenHeight / 2;
    
    node.c.forEach((child, index) => {
      const childHeight = calculateNodeHeight(child.v || '');
      currentY += childHeight / 2;
      
      const childX = x + 150;
      const childContent = child.v || '';
      
      // 计算文本长度和直线段起点
      const textLength = childContent.length * fontSize * 0.6;
      const directLineStart = childX - Math.max(textLength + 30, 70); // 确保直线段足够长
      
      // 绘制连接线：曲线段 + 直线段
      output += `<path class="markmap-link" d="
        M ${x + circleRadius} ${y}
        C ${x + 75},${y} 
          ${directLineStart - 30},${currentY} 
          ${directLineStart},${currentY}
        L ${childX - circleRadius},${currentY}
      " stroke="${color}"/>`;
      
      // 生成子节点的文本，放在直线段上方，支持多行显示
      if (childContent) {
        // 处理文本换行
        const maxLineWidth = 200; // 每行最大宽度（像素）
        const charWidth = fontSize * 0.6;
        const charsPerLine = Math.floor(maxLineWidth / charWidth);
        
        // 分割文本为多行
        const lines = [];
        let remainingText = childContent;
        
        while (remainingText.length > 0) {
          const lineLength = Math.min(remainingText.length, charsPerLine);
          lines.push(remainingText.substring(0, lineLength));
          remainingText = remainingText.substring(lineLength);
        }
        
        // 计算文本块的总高度和起始Y坐标
        const lineHeight = fontSize * 1.2;
        const textBlockHeight = lines.length * lineHeight;
        const textStartY = currentY - textBlockHeight / 2;
        
        // 渲染每一行文本
        lines.forEach((line, lineIndex) => {
          const lineY = textStartY + lineIndex * lineHeight;
          output += `<text class="markmap-node-text" 
            x="${(directLineStart + childX - circleRadius) / 2}" 
            y="${lineY}"
            style="font-size: ${fontSize}px; fill: ${color}"
            text-anchor="middle">${escapeHtml(line)}</text>`;
        });
      }
      
      // 递归生成子节点
      output += generateNodes(child, width, height, childX, currentY, level + 1, colorIndex + 1);
      
      currentY += childHeight / 2 + childSpacing;
    });
  } else if (content) {
    // 如果是叶子节点，直接在节点右侧显示文本
    output += `<text class="markmap-node-text" 
      x="${x + circleRadius * 2}" 
      y="${y}"
      dy=".3em"
      style="font-size: ${fontSize}px; fill: ${color}"
      text-anchor="start">${escapeHtml(content)}</text>`;
  }
  
  return output;
}

// 辅助函数：转义 HTML 特殊字符
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function calculateNodeHeight(content) {
  const fontSize = 14;
  const lineHeight = fontSize * 1.2;
  const maxWidth = 200;
  const charWidth = fontSize * 0.6;
  
  // 计算文本行数
  const chars = (content || '').length;
  const charsPerLine = Math.floor(maxWidth / charWidth);
  const lines = Math.ceil(chars / charsPerLine);
  
  return Math.max(lines * lineHeight, 30) + 20; // 最小高度30px，额外增加20px间距
}
