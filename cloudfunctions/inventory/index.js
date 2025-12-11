// cloudfunctions/inventory/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

exports.main = async (event, context) => {
    const { keyword, lowStock, item_type } = event
    const itemType = item_type || 'product'

    try {
        // We use aggregation for everything now to support the custom sort
        // Sort order demanded: IsLow (desc) -> UpdatedAt (desc)

        // Action: getModels (Fetch unique models for a category)
        if (event.action === 'getModels') {
            const { category } = event
            if (!category) return { success: true, data: [] }

            // Filter by item_type
            const match = { category }
            if (itemType === 'package') {
                match.item_type = 'package'
            } else {
                match.item_type = _.neq('package')
            }

            let allModels = []
            let page = 0
            const MAX_LIMIT = 100

            while (true) {
                const res = await db.collection('Products')
                    .aggregate()
                    .match(match)
                    .group({
                        _id: '$model'
                    })
                    .sort({ _id: 1 })
                    .skip(page * MAX_LIMIT)
                    .limit(MAX_LIMIT)
                    .end()

                const models = res.list.map(item => item._id).filter(m => m)
                allModels = allModels.concat(models)

                if (res.list.length < MAX_LIMIT) {
                    break
                }
                page++
            }
            return { success: true, data: allModels }
        }

        let matchStage = {}
        if (itemType === 'package') {
            matchStage.item_type = 'package'
        } else {
            matchStage.item_type = _.neq('package')
        }

        if (keyword) {
            const keywordMsg = _.or([
                { model: db.RegExp({ regexp: keyword, options: 'i' }) },
                { category: db.RegExp({ regexp: keyword, options: 'i' }) }
            ])
            matchStage = _.and([matchStage, keywordMsg])
        }

        let allResults = []
        const MAX_LIMIT = 100
        let page = 0

        while (true) {
            let agg = db.collection('Products').aggregate()
                .match(matchStage)
                .addFields({
                    thresholdVals: $.ifNull(['$warning_threshold', 0])
                })
                .addFields({
                    isLow: $.lt(['$total_stock_kg', '$thresholdVals'])
                })

            if (lowStock) {
                agg = agg.match({ isLow: true })
            }

            const res = await agg
                .sort({
                    isLow: -1,
                    updatedAt: -1,
                    update_time: -1
                })
                .skip(page * MAX_LIMIT)
                .limit(MAX_LIMIT)
                .end()

            allResults = allResults.concat(res.list)

            if (res.list.length < MAX_LIMIT) {
                break
            }
            page++
        }

        return { success: true, data: allResults }

    } catch (e) {
        return {
            success: false,
            errMsg: e.message
        }
    }
}
