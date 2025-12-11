// cloudfunctions/deleteProduct/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const { productId, deleteMode } = event

    if (!productId || !deleteMode) {
        return { success: false, errMsg: 'Missing parameters' }
    }

    try {
        const result = await db.runTransaction(async transaction => {
            // 1. Get Product to know its category/model (needed for finding associated records)
            const productRes = await transaction.collection('Products').doc(productId).get()
            if (!productRes.data) {
                throw new Error('Product not found')
            }
            const product = productRes.data

            // 2. Delete Ledger Records and Tags if mode is 'all'
            if (deleteMode === 'all') {
                // Determine query for associated records
                const query = {
                    product_category: product.category,
                    product_model: product.model
                }

                // For packages, item_type might be sufficient or combined with category/model
                if (product.item_type === 'package') {
                    query.item_type = 'package'
                    // Add category info to be safe
                    query.product_category = product.category
                    query.product_model = product.model
                }

                // Delete LedgerRecords
                // Since where().remove() is not fully supported in transaction API for some SDK versions (or limited),
                // and we might have many records, this is tricky.
                // However, wx-server-sdk transaction usually supports where().remove().
                await transaction.collection('LedgerRecords').where(query).remove()

                // Delete BatchTags
                await transaction.collection('BatchTags').where({
                    category: product.category,
                    model: product.model
                }).remove()
            }

            // 3. Delete the Product itself
            await transaction.collection('Products').doc(productId).remove()

            return {
                success: true,
                deletedId: productId
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
