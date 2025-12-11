// cloudfunctions/getStatistics/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

exports.main = async (event, context) => {
    try {
        const { startDate, endDate, nature, itemType } = event

        // 1. Match Stage
        const matchStage = {}

        // Date Filter
        if (startDate && endDate && typeof startDate === 'string' && typeof endDate === 'string') {
            matchStage.operate_date = _.gte(startDate).and(_.lte(endDate + ' 23:59:59'))
        }

        // Nature Filter
        if (nature && nature !== '全部') {
            matchStage.nature = nature
        }

        // Item Type Filter
        if (itemType && itemType !== 'all') {
            matchStage.item_type = itemType
        }

        // 2. Aggregate Summary (Split In/Out)
        const summaryRes = await db.collection('LedgerRecords')
            .aggregate()
            .match(matchStage)
            .group({
                _id: null,
                totalInbound: $.sum($.cond({
                    if: $.eq(['$action_type', 'in']),
                    then: '$quantity_kg',
                    else: 0
                })),
                totalOutbound: $.sum($.cond({
                    if: $.eq(['$action_type', 'out']),
                    then: '$quantity_kg',
                    else: 0
                })),
                count: $.sum(1)
            })
            .end()

        let summaryData = {
            totalInbound: 0,
            totalOutbound: 0,
            count: 0
        }

        if (summaryRes.list.length > 0) {
            summaryData = summaryRes.list[0]
        }
        // Rounding
        summaryData.totalInbound = Math.round(summaryData.totalInbound * 100) / 100
        summaryData.totalOutbound = Math.round(summaryData.totalOutbound * 100) / 100

        // If simple request, return summary only
        if (!event.detailed) {
            return {
                success: true,
                data: summaryData
            }
        }

        // 3. Aggregate Daily Trend (Total Quantity of matches)
        const trendRes = await db.collection('LedgerRecords')
            .aggregate()
            .match(matchStage)
            .group({
                _id: '$operate_date',
                totalQuantity: $.sum('$quantity_kg')
            })
            .sort({ _id: 1 })
            .limit(30)
            .end()

        const dailyTrend = trendRes.list.map(item => ({
            operate_date: item._id,
            totalQuantity: Math.round(item.totalQuantity * 100) / 100
        }))



        // 5. Category Analysis
        // 5. Category Analysis
        let allCats = []
        let catPage = 0
        const MAX_CAT = 100

        while (true) {
            const catRes = await db.collection('LedgerRecords')
                .aggregate()
                .match(matchStage)
                .group({
                    _id: '$product_category',
                    totalQuantity: $.sum('$quantity_kg')
                })
                .sort({ totalQuantity: -1, _id: 1 }) // Stable sort
                .skip(catPage * MAX_CAT)
                .limit(MAX_CAT)
                .end()

            allCats = allCats.concat(catRes.list)
            if (catRes.list.length < MAX_CAT) break
            catPage++
        }

        const categoryAnalysis = allCats.map(item => ({
            category: item._id,
            totalQuantity: Math.round(item.totalQuantity * 100) / 100
        }))

        // 6. Nature Analysis
        const natureRes = await db.collection('LedgerRecords')
            .aggregate()
            .match(matchStage)
            .group({
                _id: '$nature',
                totalQuantity: $.sum('$quantity_kg')
            })
            .sort({ totalQuantity: -1 })
            .end()

        const natureAnalysis = natureRes.list.map(item => ({
            nature: item._id,
            totalQuantity: Math.round(item.totalQuantity * 100) / 100
        }))

        return {
            success: true,
            data: {
                summary: summaryData,
                dailyTrend,
                categoryAnalysis,
                natureAnalysis
            }
        }

    } catch (e) {
        return {
            success: false,
            errMsg: e.message
        }
    }
}
