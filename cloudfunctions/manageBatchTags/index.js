const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const { action, category, model, batch, tag } = event

    // Unique identifier for a batch is combo of category, model, batch
    // For packages, batch might be empty or specific, but user interaction is consistent

    if (!category || !model) {
        return { success: false, errMsg: 'Missing parameters' }
    }

    try {
        if (action === 'add' && tag) {
            // Check if record exists
            const res = await db.collection('BatchTags').where({
                category,
                model,
                batch: batch || '' // Handle empty batch for packages if needed
            }).get()

            if (res.data.length > 0) {
                await db.collection('BatchTags').doc(res.data[0]._id).update({
                    data: {
                        tags: _.addToSet(tag),
                        updatedAt: db.serverDate()
                    }
                })
            } else {
                await db.collection('BatchTags').add({
                    data: {
                        category,
                        model,
                        batch: batch || '',
                        tags: [tag],
                        createdAt: db.serverDate(),
                        updatedAt: db.serverDate()
                    }
                })
            }
            return { success: true }
        }

        if (action === 'remove' && tag) {
            const res = await db.collection('BatchTags').where({
                category,
                model,
                batch: batch || ''
            }).get()

            if (res.data.length > 0) {
                await db.collection('BatchTags').doc(res.data[0]._id).update({
                    data: {
                        tags: _.pull(tag),
                        updatedAt: db.serverDate()
                    }
                })
            }
            return { success: true }
        }

        return { success: false, errMsg: 'Invalid action' }

    } catch (e) {
        console.error(e)
        return { success: false, errMsg: e.message }
    }
}
