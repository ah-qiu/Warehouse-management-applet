// cloudfunctions/login/index.js
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// Salt for hashing - In production, this should be an environment variable
const SALT = 'WECHAT_MINI_PROGRAM_SALT_2025'

function hashOpenId(openid) {
  return crypto.createHmac('sha256', SALT)
    .update(openid)
    .digest('hex')
}

// Generate random token
function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return {
      success: false,
      errMsg: 'Login failed: No OpenID'
    }
  }

  const uidHash = hashOpenId(openid)

  try {
    // Generate new login token
    const token = generateToken()
    const expireAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // 1. Check if user exists by Hash
    const userRes = await db.collection('users').where({
      uid_hash: uidHash
    }).get()

    if (userRes.data.length > 0) {
      // 2. User exists, update token and return info
      const user = userRes.data[0]

      await db.collection('users').doc(user._id).update({
        data: {
          login_token: token,
          token_expire_at: expireAt,
          last_login: db.serverDate()
        }
      })

      return {
        success: true,
        token: token,
        name: user.name || '未命名用户',
        role: user.role || 'user',
        isNew: false
      }
    } else {
      // 3. New User, create with token
      const newUser = {
        uid_hash: uidHash,
        name: '微信用户',
        role: 'user',
        login_token: token,
        token_expire_at: expireAt,
        createTime: db.serverDate(),
        last_login: db.serverDate()
      }

      await db.collection('users').add({
        data: newUser
      })

      return {
        success: true,
        token: token,
        name: newUser.name,
        role: newUser.role,
        isNew: true
      }
    }
  } catch (e) {
    console.error('Login Failed:', e)
    return {
      success: false,
      errMsg: 'Login failed: ' + e.message
    }
  }
}
