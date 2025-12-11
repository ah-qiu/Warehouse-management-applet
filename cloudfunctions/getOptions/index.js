const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
    const { action, configId, value } = event

    try {
        if (action === 'add' && configId && value) {
            // Find if config exists
            const res = await db.collection('Options').where({ config_id: configId }).get()
            if (res.data.length > 0) {
                const docId = res.data[0]._id
                await db.collection('Options').doc(docId).update({
                    data: {
                        items: _.push(value),
                        updatedAt: db.serverDate()
                    }
                })
            } else {
                await db.collection('Options').add({
                    data: {
                        config_id: configId,
                        items: [value],
                        createdAt: db.serverDate(),
                        updatedAt: db.serverDate()
                    }
                })
            }
            return { success: true }
        }

        if (action === 'remove' && configId && value) {
            const res = await db.collection('Options').where({ config_id: configId }).get()
            if (res.data.length > 0) {
                const docId = res.data[0]._id
                await db.collection('Options').doc(docId).update({
                    data: {
                        items: _.pull(value),
                        updatedAt: db.serverDate()
                    }
                })
            }
            return { success: true }
        }

        // Default: Fetch all configuration documents
        const res = await db.collection('Options').get()
        const allConfigs = res.data

        // Helper to find items by config_id
        const findItems = (id) => {
            const doc = allConfigs.find(c => c.config_id === id)
            // Return object with items and the REAL _id
            return {
                items: doc ? doc.items : [],
                _id: doc ? doc._id : null
            }
        }

        return {
            success: true,
            data: {
                categories: findItems('category_list'),
                specs: findItems('spec_list'),
                inboundNature: findItems('inbound_nature_list'),
                outboundNature: findItems('outbound_nature_list'),
                // Packaging options
                packageCategories: findItems('package_category_list'),
                packageSpecs: findItems('package_spec_list'),
                packageInboundNature: findItems('package_inbound_nature_list'),
                packageOutboundNature: findItems('package_outbound_nature_list')
            }
        }
    } catch (e) {
        return {
            success: false,
            errMsg: e.message
        }
    }
}
