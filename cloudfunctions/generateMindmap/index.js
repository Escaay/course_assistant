// 云函数 generateMindmap/index.js
const cloud = require('wx-server-sdk');
const { Transformer } = require('markmap-lib');
const { fillTemplate } = require('markmap-render');
const nodeHtmlToImage = require('node-html-to-image');

cloud.init({ env: "cloud1-0gys80m48da147a1" });

exports.main = async (event) => {
  try {
    if (!event.content) {
      throw new Error('Content is required');
    }

    const transformer = new Transformer();
    const { root, features } = transformer.transform(event.content);
    const assets = transformer.getUsedAssets(features);
    
    console.log('转换后的数据:', JSON.stringify(root, null, 2));

    // 使用 fillTemplate 生成 HTML
    const html = fillTemplate(root, assets, {
      jsonOptions: {
        duration: 0,
        maxInitialScale: 5,
      },
    }) + `
    <style>
      body, #markmap {
        width: 2400px;
        height: 1800px;
        margin: 0;
        overflow: hidden;
      }
    </style>
    `;

    // 使用 nodeHtmlToImage 生成图片
    const image = await nodeHtmlToImage({
      html,
      waitUntil: 'networkidle0',
      puppeteerArgs: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });
    
    return {
      image: image.toString('base64')
    };
  } catch (err) {
    console.error('错误:', err);
    return { error: err.message };
  }
};
