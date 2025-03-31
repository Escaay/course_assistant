const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()

  console.log('共享环境调用信息:', {
    event,
    context,
    FROM_APPID: wxContext.FROM_APPID,
    FROM_OPENID: wxContext.FROM_OPENID,
    FROM_UNIONID: wxContext.FROM_UNIONID
  })

  // 这里可以添加自定义的权限验证逻辑
  const allowedAppIds = ['wx0fde645e16e77a3e', 'wx93739e7f65cff363']; // 允许访问的小程序 AppID 列表
  
  if (!allowedAppIds.includes(wxContext.FROM_APPID)) {
    return {
      errCode: -1,
      errMsg: '未授权的访问',
      auth: null
    }
  }

  return {
    errCode: 0,
    errMsg: 'ok',
    auth: JSON.stringify({
      appId: wxContext.FROM_APPID,
      openId: wxContext.FROM_OPENID,
      unionId: wxContext.FROM_UNIONID,
      timestamp: Date.now(),
      // 可以添加其他自定义权限字段
      permissions: {
        storage: true,
        database: true,
        functions: ['convertToMarkdown', 'generateMindmap']
      }
    })
  }
} 