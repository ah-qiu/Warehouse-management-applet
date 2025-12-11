// cloudfunctions/operation/index.js
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// SALT must match login function
const SALT = 'WECHAT_MINI_PROGRAM_SALT_2025'

function hashOpenId(openid) {
    return crypto.createHmac('sha256', SALT)
        .update(openid)
        .digest('hex')
}

exports.main = async (event, context) => {
    const { action, data } = event
    const { OPENID } = cloud.getWXContext()

    // Default item_type to 'product'
    const itemType = data.item_type || 'product'

    // For package, force model to be same as spec if not provided
    if (itemType === 'package' && !data.model) {
        data.model = data.spec
    }

    const unit = itemType === 'package' ? '个' : '公斤'

    try {
        const result = await db.runTransaction(async transaction => {
            // [TRACEABILITY] Fetch Operator Info
            let operatorName = '未命名用户'
            const uidHash = hashOpenId(OPENID)

            // Use Hash to find user
            const userQuery = await transaction.collection('users').where({ uid_hash: uidHash }).get()
            if (userQuery.data.length > 0) {
                operatorName = userQuery.data[0].name || '未命名用户'
            }

            // 1. Get Product info
            // For 'product', we match if item_type is 'product' OR missing (legacy)
            // For 'package', we match strict item_type: 'package'

            let queryClause = {
                category: data.category,
                model: data.model
            }

            if (itemType === 'package') {
                queryClause.item_type = 'package'
            } else {
                queryClause.item_type = _.neq('package')
            }

            const productRes = await transaction.collection('Products').where(queryClause).get()

            let product = null
            if (productRes.data.length > 0) {
                product = productRes.data[0]
            }

            if (action === 'out') {
                if (!product) {
                    throw new Error(itemType === 'package' ? '包装物库存不存在' : '产品不存在，无法出库')
                }
                if (product.total_stock_kg < data.quantity) {
                    throw new Error(`库存不足，当前库存: ${product.total_stock_kg} ${unit}`)
                }
            }

            // 2. Prepare Ledger Record
            const ledgerRecord = {
                item_type: itemType, // [NEW]
                product_category: data.category,
                product_model: data.model,
                action_type: action,
                batch_number: data.batch,
                package_spec: data.spec,
                quantity_kg: Number(data.quantity), // Kept name for compatibility, but represents QTY
                unit: unit, // [NEW]
                nature: data.nature,
                operate_date: data.date,
                createdAt: db.serverDate(),
                _openid: OPENID, // System field, kept for cloud console access control if needed
                uid_hash: uidHash, // [SECURE] Store hash for business logic
                operator_name: operatorName, // [SECURE] Used fetched name

                // Snapshot
                current_stock_snapshot: action === 'in'
                    ? (product ? product.total_stock_kg : 0) + Number(data.quantity)
                    : product.total_stock_kg - Number(data.quantity)
            }

            // 3. Update Product Stock
            if (product) {
                await transaction.collection('Products').doc(product._id).update({
                    data: {
                        total_stock_kg: _.inc(action === 'in' ? Number(data.quantity) : -Number(data.quantity)),
                        updatedAt: db.serverDate()
                    }
                })
                ledgerRecord.product_id = product._id
            } else {
                // New Product/Package (only for 'in')
                const newProduct = await transaction.collection('Products').add({
                    data: {
                        item_type: itemType, // [NEW]
                        category: data.category,
                        model: data.model,
                        total_stock_kg: Number(data.quantity),
                        unit: unit,
                        warning_threshold: 100, // Default
                        updatedAt: db.serverDate(),
                        createdAt: db.serverDate(),
                        _openid: OPENID
                    }
                })
                ledgerRecord.product_id = newProduct._id
            }

            // 4. Add Ledger Record
            await transaction.collection('LedgerRecords').add({
                data: ledgerRecord
            })

            return {
                success: true,
                stock: ledgerRecord.current_stock_snapshot
            }
        })

        return result

    } catch (e) {
        return {
            success: false,
            errMsg: e.message
        }
    }
}
