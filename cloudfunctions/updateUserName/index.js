// cloudfunctions/updateUserName/index.js
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// SALT must match login function
const SALT = 'WECHAT_MINI_PROGRAM_SALT_2025'

function hashOpenId(openid) {
    return crypto.createHmac('sha256', SALT)
        .update(openid)
        .digest('hex')
}

exports.main = async (event, context) => {
    const { name } = event
    const { OPENID } = cloud.getWXContext()

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return { success: false, errMsg: '姓名不能为空' }
    }

    const uidHash = hashOpenId(OPENID)

    try {
        const result = await db.collection('users').where({
            uid_hash: uidHash
        }).update({
            data: { name: name.trim() }
        })

        if (result.stats.updated > 0) {
            return { success: true }
        } else {
            return { success: false, errMsg: '用户不存在' }
        }
    } catch (e) {
        console.error('Update name failed:', e)
        return { success: false, errMsg: e.message }
    }
}
