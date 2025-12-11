// cloudfunctions/updateProduct/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
    const { productId, data } = event

    if (!productId || !data) {
        return { success: false, errMsg: 'Missing productId or data' }
    }

    try {
        await db.collection('Products').doc(productId).update({
            data: {
                ...data,
                update_time: Date.now()
            }
        })
        return { success: true }
    } catch (e) {
        return { success: false, errMsg: e.message }
    }
}
