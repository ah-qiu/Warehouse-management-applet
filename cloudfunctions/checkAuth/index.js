const cloud = require('wx-server-sdk')

cloud.init({
    env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID

    try {
        // 查询 users 集合，查找当前 openid 的用户
        const userRes = await db.collection('users').where({
            _openid: openid
        }).get()

        if (userRes.data.length > 0) {
            const user = userRes.data[0]
            // 严格判断 role 字段是否为 'admin'
            return {
                isAdmin: user.role === 'admin',
                openid: openid
            }
        } else {
            // 未找到用户，默认非管理员
            return {
                isAdmin: false,
                openid: openid
            }
        }
    } catch (e) {
        console.error('CheckAuth Error:', e)
        return {
            isAdmin: false,
            error: e,
            errMsg: 'Auth check failed'
        }
    }
}
