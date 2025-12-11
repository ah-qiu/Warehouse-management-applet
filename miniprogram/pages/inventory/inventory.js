const app = getApp()
const config = require('../../config');

Page({
    data: {
        appName: config.appName,
        activeTab: 0, // 0: All, 1: Low Stock
        keyword: '',
        inventoryList: [],
        categories: [],
        activeCategory: '全部',
        activeCategory: '全部',
        loading: false,

        itemType: 'product', // 'product' | 'package'
        rawOptions: {},
        isAdmin: false
    },

    onLoad() {
        this.fetchCategories()
        this.getData()
    },

    onShow() {
        this.getData()
        const app = getApp()
        if (typeof app.globalData.isAdmin === 'boolean') {
            this.setData({ isAdmin: app.globalData.isAdmin })
        } else {
            app.globalData.authReadyCallback = (isAdmin) => {
                this.setData({ isAdmin })
            }
        }
    },

    onPullDownRefresh() {
        this.getData()
    },

    async fetchCategories() {
        try {
            const res = await wx.cloud.callFunction({ name: 'getOptions' })
            if (res.result.success) {
                this.setData({ rawOptions: res.result.data })
                this.updateCategoriesDisplay()
            }
        } catch (e) {
            console.error(e)
        }
    },

    updateCategoriesDisplay() {
        const { rawOptions, itemType } = this.data
        if (!rawOptions) return

        let itemList = []
        if (itemType === 'package') {
            itemList = rawOptions.packageCategories ? rawOptions.packageCategories.items : []
        } else {
            itemList = rawOptions.categories ? rawOptions.categories.items : []
        }

        this.setData({ categories: itemList })
    },

    onTypeChange(e) {
        const type = e.currentTarget.dataset.type
        if (type === this.data.itemType) return

        this.setData({
            itemType: type,
            activeCategory: '全部',
            keyword: '',
            inventoryList: []
        })
        this.updateCategoriesDisplay()
        this.getData()
    },

    setFilter(e) {
        const val = e.currentTarget.dataset.val
        this.setData({ activeCategory: val }, () => {
            this.getData()
        })
    },

    onTabChange(e) {
        this.setData({ activeTab: e.detail.index })
        this.getData()
    },

    onSearch(e) {
        this.setData({ keyword: e.detail })
    },

    onSearchConfirm() {
        this.getData()
    },

    async getData() {
        this.setData({ loading: true })
        try {
            const res = await wx.cloud.callFunction({
                name: 'inventory',
                data: {
                    keyword: this.data.keyword,
                    lowStock: this.data.activeTab === 1,
                    item_type: this.data.itemType
                }
            })

            if (res.result.success) {
                let list = res.result.data
                // Client-side category filter
                if (this.data.activeCategory !== '全部') {
                    list = list.filter(item => item.category === this.data.activeCategory)
                }

                // Format time
                list = list.map(item => {
                    let dateStr = '-'
                    // Try all possible date fields
                    const dateVal = item.updatedAt || item.update_time || item.createdAt || item.create_time

                    if (dateVal) {
                        const dateObj = new Date(dateVal)
                        if (!isNaN(dateObj.getTime())) {
                            const y = dateObj.getFullYear()
                            const m = dateObj.getMonth() + 1
                            const d = dateObj.getDate()
                            const h = dateObj.getHours()
                            const min = dateObj.getMinutes()
                            dateStr = `${y}-${m < 10 ? '0' + m : m}-${d < 10 ? '0' + d : d} ${h < 10 ? '0' + h : h}:${min < 10 ? '0' + min : min}`
                        }
                    }

                    return {
                        ...item,
                        update_time_str: dateStr
                    }
                })

                this.setData({ inventoryList: list })
            }
        } catch (e) {
            console.error(e)
            wx.showToast({ title: '加载失败', icon: 'none' })
        } finally {
            this.setData({ loading: false })
            wx.stopPullDownRefresh()
        }
    },

    onDeleteProduct(e) {
        const item = e.currentTarget.dataset.item
        const that = this

        wx.showActionSheet({
            itemList: ['仅删除产品 (保留历史记录)', '彻底删除 (包含所有历史记录)'],
            itemColor: '#000000',
            success(res) {
                const tapIndex = res.tapIndex
                if (tapIndex === 0 || tapIndex === 1) {
                    const isAll = tapIndex === 1

                    if (isAll) {
                        wx.showModal({
                            title: '彻底删除警告',
                            content: '此操作将删除该产品以及所有关联的出入库流水和标签，且不可恢复！确认执行？',
                            confirmColor: '#ef4444',
                            success(action) {
                                if (action.confirm) {
                                    that.executeDelete(item._id, 'all')
                                }
                            }
                        })
                    } else {
                        wx.showModal({
                            title: '确认删除',
                            content: '仅从列表中移除产品，保留历史数据。',
                            success(action) {
                                if (action.confirm) {
                                    that.executeDelete(item._id, 'product_only')
                                }
                            }
                        })
                    }
                }
            }
        })
    },

    async executeDelete(productId, mode) {
        wx.showLoading({ title: '删除中...', mask: true })
        try {
            const res = await wx.cloud.callFunction({
                name: 'deleteProduct',
                data: {
                    productId: productId,
                    deleteMode: mode
                }
            })

            if (res.result.success) {
                wx.showToast({ title: '删除成功', icon: 'success' })
                this.getData() // Refresh list
            } else {
                wx.showModal({
                    title: '删除失败',
                    content: res.result.errMsg,
                    showCancel: false
                })
            }
        } catch (e) {
            console.error(e)
            wx.showToast({ title: '网络错误', icon: 'none' })
        } finally {
            wx.hideLoading()
        }
    },

    goToLedger(e) {
        const item = e.currentTarget.dataset.item
        // Pass essential info
        wx.navigateTo({
            url: `/pages/ledger/ledger?id=${item._id}&model=${item.model}&category=${item.category}&itemType=${this.data.itemType}`
        })
    }
})
