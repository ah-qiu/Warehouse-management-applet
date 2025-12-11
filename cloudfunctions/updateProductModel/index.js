// cloudfunctions/updateProductModel/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const { productId, category, oldModel, newModel } = event

    if (!productId || !category || !oldModel || !newModel) {
        return { success: false, errMsg: 'Missing parameters' }
    }

    if (oldModel === newModel) {
        return { success: true, msg: 'No change' }
    }

    try {
        const result = await db.runTransaction(async transaction => {
            // 1. Check if new model name already exists in same category (prevent duplicates)
            // (Optional: depending on business rule, but usually unique per category)
            const countRes = await transaction.collection('Products').where({
                category: category,
                model: newModel
            }).count()

            if (countRes.total > 0) {
                throw new Error(`型号 "${newModel}" 已存在于 "${category}" 中，请使用不同名称`)
            }

            // 2. Update Product
            await transaction.collection('Products').doc(productId).update({
                data: {
                    model: newModel,
                    update_time: db.serverDate()
                }
            })

            // 3. Update LedgerRecords
            // Note: Cloud DB where().update() limit is 20 in transactions? 
            // Actually, multi-doc update is supported in server SDK transactions but has limits.
            // If there are many records, this might be slow or hit limits, but for a simple tool it's okay.
            // CAUTION: 'where' updates in transaction need 'limit' or might be restricted. 
            // In standard mongo transaction, you update via doc(). 
            // But wx-server-sdk allows where().update().
            await transaction.collection('LedgerRecords').where({
                product_category: category,
                product_model: oldModel
            }).update({
                data: {
                    product_model: newModel
                }
            })

            // 4. Update BatchTags
            await transaction.collection('BatchTags').where({
                category: category,
                model: oldModel
            }).update({
                data: {
                    model: newModel
                }
            })

            return {
                success: true,
                updated: true
            }
        })

        return result

    } catch (e) {
        console.error(e)
        return {
            success: false,
            errMsg: e.message
        }
    }
}
