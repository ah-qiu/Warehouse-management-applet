// cloudfunctions/getStatistics/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

exports.main = async (event, context) => {
    try {
        const { startDate, endDate, nature, itemType, trendPeriod = 'weekly' } = event

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

        // 3. Aggregate Trend (按周或月分组)
        // 先获取所有匹配记录的日期和数量，然后在 JS 中按周/月分组
        let allTrendRecords = []
        let trendPage = 0
        const MAX_TREND = 100

        while (true) {
            const trendRes = await db.collection('LedgerRecords')
                .aggregate()
                .match(matchStage)
                .group({
                    _id: '$operate_date',
                    totalQuantity: $.sum('$quantity_kg')
                })
                .sort({ _id: 1 })
                .skip(trendPage * MAX_TREND)
                .limit(MAX_TREND)
                .end()

            allTrendRecords = allTrendRecords.concat(trendRes.list)
            if (trendRes.list.length < MAX_TREND) break
            trendPage++
        }

        // 按周或月聚合
        const trendMap = {}

        for (const record of allTrendRecords) {
            const dateStr = record._id // 格式: "2024-12-01" 或 "2024-12-01 10:30:00"
            const datePart = dateStr.substring(0, 10) // 取 YYYY-MM-DD

            let periodKey
            if (trendPeriod === 'monthly') {
                // 按月分组: "2024-12"
                periodKey = datePart.substring(0, 7)
            } else {
                // 按周分组: 计算该日期所在周的周日
                const date = new Date(datePart)
                const day = date.getDay()
                const diff = date.getDate() + (7 - day) % 7 // 计算到周日的天数
                const sunday = new Date(date)
                sunday.setDate(day === 0 ? date.getDate() : date.getDate() + (7 - day))
                const mm = String(sunday.getMonth() + 1).padStart(2, '0')
                const dd = String(sunday.getDate()).padStart(2, '0')
                periodKey = `${sunday.getFullYear()}-${mm}-${dd}`
            }

            if (!trendMap[periodKey]) {
                trendMap[periodKey] = 0
            }
            trendMap[periodKey] += record.totalQuantity
        }

        // 转换为数组并排序
        const trendData = Object.entries(trendMap)
            .map(([period, totalQuantity]) => ({
                period,
                totalQuantity: Math.round(totalQuantity * 100) / 100
            }))
            .sort((a, b) => a.period.localeCompare(b.period))
            .slice(-12) // 最多显示最近12个周期



        // 5. Category Analysis - 分别统计入库和出库
        // 5.1 入库类别分析
        let allInboundCats = []
        let inCatPage = 0
        const MAX_CAT = 100

        while (true) {
            const catRes = await db.collection('LedgerRecords')
                .aggregate()
                .match({ ...matchStage, action_type: 'in' })
                .group({
                    _id: '$product_category',
                    totalQuantity: $.sum('$quantity_kg')
                })
                .sort({ totalQuantity: -1, _id: 1 })
                .skip(inCatPage * MAX_CAT)
                .limit(MAX_CAT)
                .end()

            allInboundCats = allInboundCats.concat(catRes.list)
            if (catRes.list.length < MAX_CAT) break
            inCatPage++
        }

        const inboundCategoryAnalysis = allInboundCats.map(item => ({
            category: item._id,
            totalQuantity: Math.round(item.totalQuantity * 100) / 100
        }))

        // 5.2 出库类别分析
        let allOutboundCats = []
        let outCatPage = 0

        while (true) {
            const catRes = await db.collection('LedgerRecords')
                .aggregate()
                .match({ ...matchStage, action_type: 'out' })
                .group({
                    _id: '$product_category',
                    totalQuantity: $.sum('$quantity_kg')
                })
                .sort({ totalQuantity: -1, _id: 1 })
                .skip(outCatPage * MAX_CAT)
                .limit(MAX_CAT)
                .end()

            allOutboundCats = allOutboundCats.concat(catRes.list)
            if (catRes.list.length < MAX_CAT) break
            outCatPage++
        }

        const outboundCategoryAnalysis = allOutboundCats.map(item => ({
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
                trendData,
                inboundCategoryAnalysis,
                outboundCategoryAnalysis,
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
