import Dialog from '@vant/weapp/dialog/dialog';

const db = wx.cloud.database()

Page({
    data: {
        product: {},
        batchList: [],

        loading: false,
        isAdmin: false,
        showDetailWithId: false,
        historyList: [],
        loadingHistory: false,
        currentDetailBatch: ''
    },

    onLoad(options) {
        this.setData({
            product: {
                _id: options.id || '',
                model: options.model || 'T-915',
                category: options.category || '默认分类',
                itemType: options.itemType || 'product' // 'product' | 'package'
            }
        })

        // Check Auth
        const app = getApp()
        if (typeof app.globalData.isAdmin === 'boolean') {
            this.setData({ isAdmin: app.globalData.isAdmin })
        } else {
            app.globalData.authReadyCallback = (isAdmin) => {
                this.setData({ isAdmin })
            }
        }

        if (options.model) {
            this.fetchBatchInventory(options.model, options.category)
        }
    },

    async fetchBatchInventory(model, category) {
        this.setData({ loading: true })
        try {
            const res = await wx.cloud.callFunction({
                name: 'getProductBatches',
                data: {
                    model: model,
                    category: category
                }
            })

            if (res.result.success) {
                this.setData({
                    batchList: res.result.data || []
                })
            } else {
                wx.showToast({ title: res.result.errMsg || '获取批次失败', icon: 'none' })
            }

        } catch (e) {
            console.error(e)
            wx.showToast({ title: '加载失败', icon: 'none' })
        } finally {
            this.setData({ loading: false })
        }
    },

    onAddTag(e) {
        const batch = e.currentTarget.dataset.batch
        const { product } = this.data

        wx.showModal({
            title: '添加标签',
            editable: true,
            placeholderText: '请输入标签内容',
            success: async (res) => {
                if (res.confirm && res.content) {
                    const val = res.content.trim()
                    if (!val) return

                    wx.showLoading({ title: '添加中' })
                    try {
                        const res = await wx.cloud.callFunction({
                            name: 'manageBatchTags',
                            data: {
                                action: 'add',
                                category: product.category,
                                model: product.model,
                                batch: batch,
                                tag: val
                            }
                        })

                        if (res.result.success) {
                            // Optimistic update
                            const newList = this.data.batchList.map(item => {
                                if (item.batch === batch) {
                                    const tags = item.tags || []
                                    if (!tags.includes(val)) tags.push(val)
                                    return { ...item, tags }
                                }
                                return item
                            })
                            this.setData({ batchList: newList })
                            wx.showToast({ title: '添加成功' })
                        }
                    } catch (e) {
                        console.error(e)
                        wx.showToast({ title: '添加失败', icon: 'none' })
                    } finally {
                        wx.hideLoading()
                    }
                }
            }
        })
    },

    onDeleteTag(e) {
        const { batch, tag } = e.currentTarget.dataset
        const { product } = this.data

        wx.showModal({
            title: '删除标签',
            content: `确定删除标签 "${tag}" 吗？`,
            success: async (res) => {
                if (res.confirm) {
                    wx.showLoading({ title: '删除中' })
                    try {
                        const res = await wx.cloud.callFunction({
                            name: 'manageBatchTags',
                            data: {
                                action: 'remove',
                                category: product.category,
                                model: product.model,
                                batch: batch,
                                tag: tag
                            }
                        })
                        if (res.result.success) {
                            const newList = this.data.batchList.map(item => {
                                if (item.batch === batch) {
                                    const tags = (item.tags || []).filter(t => t !== tag)
                                    return { ...item, tags }
                                }
                                return item
                            })
                            this.setData({ batchList: newList })
                        }
                    } catch (e) {
                        console.error(e)
                    } finally {
                        wx.hideLoading()
                    }
                }
            }
        })
    },

    onEditModel() {
        const { product } = this.data
        if (product.itemType === 'package') {
            wx.showToast({ title: '包装物暂不支持改名', icon: 'none' })
            return
        }

        wx.showModal({
            title: '修改产品型号',
            editable: true,
            placeholderText: '请输入新的型号名称',
            content: product.model,
            success: async (res) => {
                if (res.confirm && res.content) {
                    const newModel = res.content.trim()
                    if (!newModel || newModel === product.model) return

                    wx.showLoading({ title: '修改中...' })
                    try {
                        const cloudRes = await wx.cloud.callFunction({
                            name: 'updateProductModel',
                            data: {
                                productId: product._id,
                                category: product.category,
                                oldModel: product.model,
                                newModel: newModel
                            }
                        })

                        if (cloudRes.result.success) {
                            wx.showToast({ title: '修改成功', icon: 'success' })
                            this.setData({
                                'product.model': newModel
                            })
                            this.fetchBatchInventory(newModel, product.category)
                        } else {
                            wx.showModal({
                                title: '修改失败',
                                content: cloudRes.result.errMsg || '请重试',
                                showCancel: false
                            })
                        }
                    } catch (e) {
                        console.error(e)
                        wx.showToast({ title: '网络错误', icon: 'none' })
                    } finally {
                        wx.hideLoading()
                    }
                }
            }
        })
    },

    onItemClick(e) {
        const item = e.currentTarget.dataset.item
        const { product } = this.data

        let message = ''
        if (product.itemType === 'package') {
            message = `是否出库\n包装类别：${product.category}\n包装规格：${product.model}`
        } else {
            message = `是否出库\n产品类别：${product.category}\n产品型号：${product.model}\n批号：${item.batch}`
        }

        wx.showModal({
            title: '出库确认',
            content: message,
            confirmText: '确认',
            cancelText: '取消',
            success: (res) => {
                if (res.confirm) {
                    const app = getApp()
                    app.globalData.outboundParams = {
                        category: product.category,
                        model: product.model,
                        batch: item.batch || '',
                        itemType: product.itemType
                    }

                    wx.switchTab({
                        url: '/pages/outbound/outbound'
                    })
                }
            }
        })
    },

    // Detail & Delete Logic
    onShowDetail(e) {
        const item = e.currentTarget.dataset.item
        const { product } = this.data

        this.setData({
            showDetailWithId: true,
            currentDetailBatch: item.batch,
            loadingHistory: true,
            historyList: []
        })

        const _ = db.command
        const query = {
            product_category: product.category,
            product_model: product.model
        }

        // Exact match
        if (product.itemType === 'package') {
            // Packages might not rely on batch number, but let's check
            query.item_type = 'package'
        } else {
            query.batch_number = item.batch
        }

        db.collection('LedgerRecords')
            .where(query)
            .orderBy('createdAt', 'desc')
            .limit(50) // Limit to recent 50
            .get()
            .then(res => {
                this.setData({
                    historyList: res.data,
                    loadingHistory: false
                })
            })
            .catch(err => {
                console.error(err)
                this.setData({ loadingHistory: false })
                wx.showToast({ title: '加载失败', icon: 'none' })
            })
    },

    onCloseDetail() {
        this.setData({ showDetailWithId: false })
    },

    onDeleteRecord(e) {
        const id = e.currentTarget.dataset.id

        wx.showModal({
            title: '危险操作',
            content: '确定删除这条记录吗？删除后库存将自动回滚（入库会减扣，出库会补回），且无法恢复！',
            confirmColor: '#ef4444',
            success: async (res) => {
                if (res.confirm) {
                    wx.showLoading({ title: '正在回滚...' })
                    try {
                        const cloudRes = await wx.cloud.callFunction({
                            name: 'deleteLedgerRecord',
                            data: { recordId: id }
                        })

                        if (cloudRes.result.success) {
                            wx.showToast({ title: '删除成功', icon: 'success' })
                            // Refresh detail list
                            const newHistory = this.data.historyList.filter(i => i._id !== id)
                            this.setData({ historyList: newHistory })

                            // Refresh parent list stock
                            this.fetchBatchInventory(this.data.product.model, this.data.product.category)
                        } else {
                            wx.showModal({
                                title: '删除失败',
                                content: cloudRes.result.errMsg,
                                showCancel: false
                            })
                        }
                    } catch (err) {
                        console.error(err)
                        wx.showToast({ title: '错误', icon: 'none' })
                    } finally {
                        wx.hideLoading()
                    }
                }
            }
        })
    }
})