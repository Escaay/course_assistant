// 云函数 convertToMarkdown/index.js
const cloud = require('wx-server-sdk');

cloud.init({
  env: 'cloud1-0gys80m48da147a1'
})

// 引入PDF和Word解析库
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    console.log(123)
    const { fileIDs } = event;
    console.log(fileIDs)
    if (!fileIDs || !Array.isArray(fileIDs) || fileIDs.length === 0) {
      return {
        success: false,
        error: '未提供有效的文件ID'
      };
    }
    
    let combinedMarkdown = '';
    
    for (const fileID of fileIDs) {
      try {
        // 下载文件
        console.log('fileID', fileID)
        const res = await cloud.downloadFile({
          fileID: 'cloud://cloud1-0gys80m48da147a1.636c-cloud1-0gys80m48da147a1-1304271127/uploads/1743332465288_本科毕业论文要求说明（仅供正文排版参考） - 副本.docx',
        });
        
        const buffer = res.fileContent;
        const fileName = fileID.split('/').pop();
        const fileExt = fileName.split('.').pop().toLowerCase();
        
        let markdown = '';
        
        // 根据文件类型进行转换
        if (fileExt === 'pdf') {
          console.log(`开始处理PDF文件: ${fileName}`);
          try {
            // 验证 buffer 是否有效
            if (!Buffer.isBuffer(buffer)) {
              throw new Error('无效的文件内容');
            }
            console.log('PDF文件大小:', buffer.length, 'bytes');

            // 添加 PDF 解析选项
            const options = {
              max: 0,  // 不限制页数
              version: 'v2.0.550'  // 指定 pdf-parse 版本
            };

            const pdfData = await pdfParse(buffer, options).catch(err => {
              console.error('PDF解析错误:', err);
              throw new Error(`PDF解析失败: ${err.message}`);
            });

            if (!pdfData || !pdfData.text) {
              throw new Error('PDF解析结果无效');
            }

            markdown = convertPdfToMarkdown(pdfData.text);
          } catch (pdfError) {
            console.error('PDF处理错误:', pdfError);
            markdown = `PDF文件处理失败: ${pdfError.message}\n\n`;
          }
        } else if (fileExt === 'doc' || fileExt === 'docx') {
          console.log(`开始处理Word文件: ${fileName}`);
          const result = await mammoth.extractRawText({ buffer });
          markdown = convertDocToMarkdown(result.value);
        } else {
          console.log(`不支持的文件类型: ${fileExt}`);
          markdown = `不支持的文件类型: ${fileExt}`;
        }
        
        combinedMarkdown += `# ${fileName}\n\n${markdown}\n\n`;
      } catch (fileError) {
        console.error(`处理文件 ${fileID} 时出错:`, fileError);
        combinedMarkdown += `# ${fileID}\n\n处理此文件时出错: ${fileError.message}\n\n`;
      }
    }
    
    return {
      success: true,
      markdown: combinedMarkdown
    };
  } catch (error) {
    console.error('云函数执行出错:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// 将PDF文本转换为Markdown格式
function convertPdfToMarkdown(text) {
  // 简单的文本处理，实际应用中可能需要更复杂的处理
  const lines = text.split('\n');
  let markdown = '';
  
  // 尝试识别标题和段落
  let currentSection = '';
  let inList = false;
  
  lines.forEach(line => {
    line = line.trim();
    
    if (!line) {
      // 空行表示段落结束
      if (currentSection) {
        markdown += `${currentSection}\n\n`;
        currentSection = '';
      }
      inList = false;
      return;
    }
    
    // 尝试识别标题 (全大写且较短的行可能是标题)
    if (line.length < 100 && line.toUpperCase() === line && line.length > 3) {
      // 先结束当前段落
      if (currentSection) {
        markdown += `${currentSection}\n\n`;
        currentSection = '';
      }
      
      // 添加标题
      markdown += `## ${line}\n\n`;
      inList = false;
    } 
    // 尝试识别列表项
    else if (line.match(/^[\d\.\-\*]\s+/) || line.match(/^\s*[\d\.\-\*]\s+/)) {
      // 如果之前不是列表，先结束当前段落
      if (!inList && currentSection) {
        markdown += `${currentSection}\n\n`;
        currentSection = '';
      }
      
      // 添加列表项
      markdown += `- ${line.replace(/^[\d\.\-\*\s]+/, '')}\n`;
      inList = true;
    } 
    // 普通段落
    else {
      // 如果之前是列表，先结束列表
      if (inList) {
        markdown += '\n';
        inList = false;
      }
      
      // 添加到当前段落
      if (currentSection) {
        currentSection += ' ' + line;
      } else {
        currentSection = line;
      }
    }
  });
  
  // 处理最后一个段落
  if (currentSection) {
    markdown += `${currentSection}\n\n`;
  }
  
  return markdown;
}

// 将Word文档转换为Markdown格式
function convertDocToMarkdown(text) {
  // Word文档通过mammoth已经有了基本的结构
  // 这里可以进行一些额外的格式化
  
  // 分割成段落
  const paragraphs = text.split('\n');
  let markdown = '';
  
  paragraphs.forEach(paragraph => {
    paragraph = paragraph.trim();
    if (!paragraph) return;
    
    // 尝试识别标题 (短且重要的段落)
    if (paragraph.length < 100 && !paragraph.endsWith('.') && paragraph.length > 3) {
      markdown += `## ${paragraph}\n\n`;
    } else {
      markdown += `${paragraph}\n\n`;
    }
  });
  
  return markdown;
}