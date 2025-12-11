// miniprogram/pages/statistics/statistics.js
Page({
    data: {
        summary: { totalInbound: 0, totalOutbound: 0, count: 0 },
        dailyTrend: [],

        categoryAnalysis: [],
        natureAnalysis: [],
        dateRange: '',
        nature: '全部',
        activeIndex: -1, // For trend tooltip
        loading: true,
        unit: 'kg'
    },

    onLoad(options) {
        const { startDate, endDate, nature, itemType } = options
        this.setData({
            dateRange: startDate && endDate ? `${startDate} ~ ${endDate}` : '全部日期',
            nature: nature || '全部',
            unit: itemType === 'package' ? '个' : 'kg'
        })
        // Pass itemType directly in payload
        this.fetchStatistics(options)
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
                const { summary, dailyTrend, categoryAnalysis, natureAnalysis } = res.result.data

                // Process Trend Data for UI
                const maxTrend = Math.max(...dailyTrend.map(d => d.totalQuantity), 1)
                const processedTrend = dailyTrend.map(d => ({
                    ...d,
                    shortDate: d.operate_date.substring(5), // 2023-12-01 -> 12-01
                    percentage: (d.totalQuantity / maxTrend) * 100
                }))

                // Process Category Data for UI
                const totalCatQty = categoryAnalysis.reduce((acc, curr) => acc + curr.totalQuantity, 0) || 1
                const processedCategory = categoryAnalysis.map(d => ({
                    ...d,
                    percentage: (d.totalQuantity / totalCatQty) * 100
                }))

                this.setData({
                    summary,
                    dailyTrend: processedTrend,
                    categoryAnalysis: processedCategory,
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
