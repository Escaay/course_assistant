// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    console.log('开始清理云存储中的文件')
    const wxContext = cloud.getWXContext()
    const env = wxContext.ENV // 动态获取环境ID

    // 计算24小时前的时间戳
    const oneDayAgo = Date.now() - 86400000

    // 获取文件列表（需要确保getUploadFiles云函数正常工作）
    const { fileList } = await cloud.callFunction({
      name: 'getUploadFiles',
      data: { prefix: 'upload/' }
    }).then(res => {
      console.log('云函数返回结构:', res)
      return res.result || { fileList: [] }
    }).catch(err => {
      console.error('调用云函数失败:', err)
      return { fileList: [] }
    })

    console.log('原始文件列表:', fileList)
    if (!fileList?.length) return { success: true, deletedCount: 0 }

    // 筛选需要删除的文件
    const filesToDelete = fileList.filter(file => {
      try {
        const fileName = file.Key || file.key || file.fileID
        if (!fileName) return false

        // 验证文件路径格式：upload/时间戳_文件名
        const pathSegments = fileName.split('/')
        if (pathSegments.length < 2 || !pathSegments[1].includes('_')) {
          console.log('文件路径格式错误:', fileName)
          return false
        }

        // 提取时间戳部分
        const timestamp = parseInt(pathSegments[1].split('_')[0])
        return !isNaN(timestamp) && timestamp < oneDayAgo
      } catch (e) {
        console.error('文件处理失败:', file, e)
        return false
      }
    })

    console.log('符合删除条件的文件:', filesToDelete)
    if (!filesToDelete.length) return { success: true, deletedCount: 0 }

    // 构造文件ID列表
    const fileIDs = filesToDelete.map(file => {
      const fileName = file.Key || file.key || file.fileID
      return `cloud://${env}/${fileName}`
    })

    // 执行删除操作
    const deleteResult = await cloud.deleteFile({
      fileList: fileIDs
    }).catch(err => ({ fileList: [], err }))

    // 处理删除结果
    if (deleteResult.err) {
      console.error('删除操作失败:', deleteResult.err)
      return { success: false, error: deleteResult.err.message }
    }

    const successCount = deleteResult.fileList?.filter(
      f => f.status === 0
    ).length || 0

    return {
      success: true,
      deletedCount: successCount,
      totalCount: fileIDs.length,
      message: `成功删除 ${successCount}/${fileIDs.length} 个文件`
    }
  } catch (error) {
    console.error('全局错误:', error)
    return {
      success: false,
      error: error.message,
      stack: error.stack
    }
  }
}