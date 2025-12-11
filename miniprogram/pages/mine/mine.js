// pages/mine/mine.js
const config = require('../../config');

Page({
    data: {
        companyName: config.companyName,
        loading: false,
        startDate: '',
        endDate: '',
        enableDateFilter: false,
        natureList: [], // All natures (in + out) because statistics can be for either
        selectedNature: '全部',
        statsResult: null,
        showStats: false,
        isAdmin: false, // 权限状态
        itemTypeList: ['全部', '产品与材料', '包装物'],
        selectedItemType: '全部'
    },

    onLoad() {
        this.fetchOptions()
    },

    onShow() {
        // 鉴权逻辑：每次显示页面都检查一下（防止后台切前台状态变化）
        const app = getApp();
        if (typeof app.globalData.isAdmin === 'boolean') {
            this.setData({ isAdmin: app.globalData.isAdmin });
        } else {
            // 如果还未获取到结果，设置回调
            app.globalData.authReadyCallback = (isAdmin) => {
                this.setData({ isAdmin });
            }
        }
    },

    async fetchOptions() {
        try {
            const res = await wx.cloud.callFunction({ name: 'getOptions' })
            if (res.result.success) {
                const inList = res.result.data.inboundNature.items
                const outList = res.result.data.outboundNature.items
                // Combine and unique
                const combined = [...new Set([...inList, ...outList])]
                this.setData({
                    natureList: ['全部', ...combined]
                })
            }
        } catch (e) {
            console.error(e)
        }
    },

    onFilterSwitchChange(e) {
        this.setData({ enableDateFilter: e.detail.value })
    },

    onStartDateChange(e) {
        this.setData({ startDate: e.detail.value })
    },

    onEndDateChange(e) {
        this.setData({ endDate: e.detail.value })
    },

    onNatureChange(e) {
        this.setData({ selectedNature: this.data.natureList[e.detail.value] })
    },

    onItemTypeChange(e) {
        this.setData({ selectedItemType: this.data.itemTypeList[e.detail.value] })
    },

    async onGetStatistics() {
        // Validate Date if filter enabled
        if (this.data.enableDateFilter) {
            if (!this.data.startDate || !this.data.endDate) {
                wx.showToast({ title: '请选择开始和结束日期', icon: 'none' })
                return
            }
        }

        const queryToPass = {
            nature: this.data.selectedNature,
            itemType: this.getItemTypeValue()
        }
        if (this.data.enableDateFilter) {
            queryToPass.startDate = this.data.startDate
            queryToPass.endDate = this.data.endDate
        }

        // Convert object to query string
        const queryString = Object.keys(queryToPass).map(key => key + '=' + queryToPass[key]).join('&')

        wx.navigateTo({
            url: `/pages/statistics/statistics?${queryString}`
        })
    },

    onCloseStats() {
        this.setData({ showStats: false })
    },

    getItemTypeValue() {
        const map = {
            '全部': 'all',
            '产品与材料': 'product',
            '包装物': 'package'
        }
        return map[this.data.selectedItemType] || 'all'
    },

    async onExport() {
        if (this.data.enableDateFilter) {
            if (!this.data.startDate || !this.data.endDate) {
                wx.showToast({ title: '请选择开始和结束日期', icon: 'none' })
                return
            }
        }

        this.setData({ loading: true })
        wx.showLoading({ title: '生成Excel中...', mask: true })
        try {
            const dataPayload = {
                itemType: this.getItemTypeValue()
            }
            if (this.data.enableDateFilter) {
                dataPayload.startDate = this.data.startDate
                dataPayload.endDate = this.data.endDate
            }

            const res = await wx.cloud.callFunction({
                name: 'exportExcel',
                data: dataPayload
            })
            if (res.result.success) {
                wx.hideLoading()
                wx.showLoading({ title: '下载中...' })

                const { tempFilePath } = await new Promise((resolve, reject) => {
                    wx.downloadFile({
                        url: res.result.fileUrl,
                        success: (res) => resolve(res),
                        fail: (err) => reject(err)
                    })
                })

                wx.openDocument({
                    filePath: tempFilePath,
                    showMenu: true,
                    success: () => wx.hideLoading(),
                    fail: (e) => {
                        console.error(e)
                        wx.showToast({ title: '打开文件失败', icon: 'none' })
                    }
                })
            } else {
                wx.hideLoading()
                wx.showToast({ title: '导出失败: ' + res.result.errMsg, icon: 'none' })
            }
        } catch (e) {
            console.error(e)
            wx.hideLoading()
            wx.showToast({ title: '网络错误', icon: 'none' })
        } finally {
            this.setData({ loading: false })
        }
    },

    toOptions() {
        wx.navigateTo({ url: '/pages/options/options' })
    },
    toThreshold() {
        wx.navigateTo({ url: '/pages/threshold/threshold' })
    }
})
