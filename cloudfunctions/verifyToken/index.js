// cloudfunctions/verifyToken/index.js
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const { token } = event

    if (!token) {
        return { success: false, errMsg: 'No token provided' }
    }

    try {
        const now = new Date()

        // Find user with valid token
        const userRes = await db.collection('users').where({
            login_token: token,
            token_expire_at: _.gte(now)
        }).limit(1).get()

        if (userRes.data.length === 0) {
            return { success: false, errMsg: 'Token expired or invalid' }
        }

        const user = userRes.data[0]
        return {
            success: true,
            name: user.name || '未命名用户',
            role: user.role || 'user',
            uid_hash: user.uid_hash
        }
    } catch (e) {
        console.error('Token verification failed:', e)
        return { success: false, errMsg: e.message }
    }
}
