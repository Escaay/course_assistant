// 云函数 convertMarkdownToImage/index.js
const cloud = require('wx-server-sdk');
const { Transformer } = require('markmap-lib');
const sharp = require('sharp');
const { JSDOM } = require('jsdom');

cloud.init({ env: "cloud1-6gvmnnngc2e558b1" });

// 初始化虚拟DOM
const { document } = new JSDOM().window;
global.document = document;

exports.main = async (event) => {
  try {
    // 1. 转换Markdown为SVG
    const transformer = new Transformer();
    const { root } = transformer.transform(event.content);
    const { Markmap } = require('markmap-render');
    const svg = Markmap.create().setData(root).svg.node().outerHTML;

    // 2. SVG转PNG
    const pngBuffer = await sharp(Buffer.from(svg))
      .resize(1200, 800, { fit: 'contain' })
      .png({ quality: 90 })
      .toBuffer();

    // 3. 上传到云存储
    const uploadRes = await cloud.uploadFile({
      cloudPath: `previews/${Date.now()}.png`,
      fileContent: pngBuffer
    });

    return { fileID: uploadRes.fileID };
  } catch (err) {
    return { error: err.message };
  }
};