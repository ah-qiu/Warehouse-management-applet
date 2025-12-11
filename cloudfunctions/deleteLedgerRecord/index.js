// cloudfunctions/deleteLedgerRecord/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const { recordId } = event

    if (!recordId) {
        return { success: false, errMsg: 'Missing recordId' }
    }

    try {
        const result = await db.runTransaction(async transaction => {
            // 1. Get the record to be deleted
            const recordRes = await transaction.collection('LedgerRecords').doc(recordId).get()
            if (!recordRes.data) {
                throw new Error('Record not found')
            }
            const record = recordRes.data

            // 2. Determine stock adjustment based on action type
            // If it was 'in' (added stock), we need to substract (inc -qty)
            // If it was 'out' (removed stock), we need to add back (inc +qty)
            // BUT wait, 'out' usually means stock decreased. So rolling back means increasing stock.
            // 'in' means stock increased. Rolling back means decreasing stock.

            let adjustment = 0
            if (record.action_type === 'in') {
                adjustment = -record.quantity_kg
            } else if (record.action_type === 'out') {
                adjustment = record.quantity_kg
            }

            // 3. Update Product Stock
            if (record.product_id) {
                await transaction.collection('Products').doc(record.product_id).update({
                    data: {
                        total_stock_kg: _.inc(adjustment),
                        update_time: db.serverDate()
                    }
                })
            } else {
                // Fallback if product_id is missing (legacy data?), try to find by category/model
                // This acts as a safety net but might be risky if duplicates exist. 
                // Assuming product_id exists for now as it's standard in this app.
                // If not, we might throw error or skip. Let's throw for safety.
                // throw new Error('关联产品信息丢失，无法回滚库存')
                // Actually, let's try to look it up if missing
                const productRes = await transaction.collection('Products').where({
                    category: record.product_category,
                    model: record.product_model
                }).get()

                if (productRes.data.length > 0) {
                    const pid = productRes.data[0]._id
                    await transaction.collection('Products').doc(pid).update({
                        data: {
                            total_stock_kg: _.inc(adjustment),
                            update_time: db.serverDate()
                        }
                    })
                }
            }

            // 4. Delete the record
            await transaction.collection('LedgerRecords').doc(recordId).remove()

            return {
                success: true,
                adjustment: adjustment
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
