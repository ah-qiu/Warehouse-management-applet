// miniprogram/pages/statistics/statistics.js
Page({
    data: {
        summary: { totalInbound: 0, totalOutbound: 0, count: 0 },
        trendData: [],

        inboundCategoryAnalysis: [],
        outboundCategoryAnalysis: [],
        natureAnalysis: [],
        dateRange: '',
        nature: '全部',
        activeIndex: -1, // For trend tooltip
        loading: true,
        unit: 'kg',
        trendPeriod: 'weekly', // 默认每周
        queryParams: {} // 保存查询参数用于周期切换
    },

    onLoad(options) {
        const { startDate, endDate, nature, itemType } = options
        this.setData({
            dateRange: startDate && endDate ? `${startDate} ~ ${endDate}` : '全部日期',
            nature: nature || '全部',
            unit: itemType === 'package' ? '个' : 'kg',
            queryParams: options // 保存查询参数
        })
        // Pass itemType directly in payload
        this.fetchStatistics({ ...options, trendPeriod: 'weekly' })
    },

    // 切换趋势周期
    onTrendPeriodChange(e) {
        const period = e.currentTarget.dataset.period
        if (period === this.data.trendPeriod) return // 避免重复点击

        this.setData({ trendPeriod: period, loading: true })
        this.fetchStatistics({
            ...this.data.queryParams,
            trendPeriod: period
        })
    },

    async fetchStatistics(payload) {
        wx.showLoading({ title: '加载分析中...' })
        try {
            const res = await wx.cloud.callFunction({
                name: 'getStatistics',
                data: {
                    ...payload,
                    detailed: true // Flag to request granular data
                }
            })

            if (res.result.success) {
                const { summary, trendData, inboundCategoryAnalysis, outboundCategoryAnalysis, natureAnalysis } = res.result.data

                // Process Trend Data for UI
                const maxTrend = Math.max(...trendData.map(d => d.totalQuantity), 1)
                const trendPeriod = payload.trendPeriod || 'weekly'
                const processedTrend = trendData.map(d => {
                    let shortDate
                    if (trendPeriod === 'monthly') {
                        // 2024-12 -> 2024-12
                        shortDate = d.period
                    } else {
                        // 2024-12-09 -> 12/09
                        shortDate = d.period.substring(5).replace('-', '/')
                    }
                    return {
                        ...d,
                        shortDate,
                        percentage: (d.totalQuantity / maxTrend) * 100
                    }
                })

                // Process Inbound Category Data for UI
                const totalInCatQty = inboundCategoryAnalysis.reduce((acc, curr) => acc + curr.totalQuantity, 0) || 1
                const processedInboundCat = inboundCategoryAnalysis.map(d => ({
                    ...d,
                    percentage: (d.totalQuantity / totalInCatQty) * 100
                }))

                // Process Outbound Category Data for UI
                const totalOutCatQty = outboundCategoryAnalysis.reduce((acc, curr) => acc + curr.totalQuantity, 0) || 1
                const processedOutboundCat = outboundCategoryAnalysis.map(d => ({
                    ...d,
                    percentage: (d.totalQuantity / totalOutCatQty) * 100
                }))

                this.setData({
                    summary,
                    trendData: processedTrend,
                    inboundCategoryAnalysis: processedInboundCat,
                    outboundCategoryAnalysis: processedOutboundCat,
                    natureAnalysis,
                    // Default select last item in trend
                    activeIndex: processedTrend.length - 1
                })
            }
        } catch (e) {
            console.error(e)
            wx.showToast({ title: '加载失败', icon: 'none' })
        } finally {
            wx.hideLoading()
            this.setData({ loading: false })
        }
    },

    showTooltip(e) {
        const index = e.currentTarget.dataset.index
        this.setData({ activeIndex: index })
    }
})
