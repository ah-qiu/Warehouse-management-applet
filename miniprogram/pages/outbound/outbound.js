const app = getApp()

// Utility to format date
const formatDate = (date) => {
    const y = date.getFullYear()
    const m = date.getMonth() + 1
    const d = date.getDate()
    return `${y}-${m < 10 ? '0' + m : m}-${d < 10 ? '0' + d : d}`
}

Page({
    data: {
        // Search
        searchKeyword: '',
        searchResult: [],
        showSearchResult: false,
        selectedProduct: null,

        // Form Data
        formData: {
            batch: '',
            quantity: '',
            nature: '',
            date: formatDate(new Date())
        },

        // Options
        outboundNature: [],
        batchList: [], // Raw batch data
        batchColumns: [], // For picker

        // Pickers UI
        showNature: false,
        showDate: false,
        showBatch: false,
        currentDate: new Date().getTime(),
        minDate: new Date(2020, 0, 1).getTime(),

        categories: [],
        activeCategory: '全部',
        loading: false,

        itemType: 'product', // 'product' | 'package'
        itemType: 'product', // 'product' | 'package'
        rawOptions: {},
        isLoggedIn: false // [New]
    },

    onLoad() {
        // Options fetching moved to onShow to ensure freshness
    },

    onShow() {
        // [Guest Mode] Check Login
        const app = getApp()
        if (!app.globalData.userInfo) {
            this.setData({ isLoggedIn: false })
            return
        }

        this.setData({ isLoggedIn: true })
        this.fetchOptions() // Always refresh options

        const params = app.globalData.outboundParams

        if (params) {
            // Consume params
            delete app.globalData.outboundParams

            this.setData({
                itemType: params.itemType || 'product',
                searchKeyword: params.model,
                showSearchResult: true,
                selectedProduct: null // clear previous
            })

            // Trigger search and try to auto-select
            this.autoSearchAndSelect(params)
        } else {
            // Normal load - always refresh list
            this.searchProducts()
        }
    },

    async onPullDownRefresh() {
        await Promise.all([
            this.fetchOptions(),
            this.searchProducts(true) // Pass true to indicate pull-down (optional depending on implementation)
        ])
        wx.stopPullDownRefresh()
    },

    async fetchOptions() {
        try {
            const res = await wx.cloud.callFunction({ name: 'getOptions' })
            if (res.result.success) {
                this.setData({ rawOptions: res.result.data })
                this.updateOptionsDisplay()
            }
        } catch (e) {
            console.error(e)
        }
    },

    updateOptionsDisplay() {
        const { rawOptions, itemType } = this.data
        if (!rawOptions || !rawOptions.outboundNature) return

        let natureList = []
        let catList = []

        if (itemType === 'package') {
            natureList = rawOptions.packageOutboundNature ? rawOptions.packageOutboundNature.items : []
            catList = rawOptions.packageCategories ? rawOptions.packageCategories.items : []
        } else {
            natureList = rawOptions.outboundNature ? rawOptions.outboundNature.items : []
            catList = rawOptions.categories ? rawOptions.categories.items : []
        }

        this.setData({
            outboundNature: natureList,
            categories: catList,
            'formData.nature': natureList[0] || ''
        })
    },

    onTypeChange(e) {
        const type = e.currentTarget.dataset.type
        if (type === this.data.itemType) return

        this.setData({
            itemType: type,
            selectedProduct: null,
            searchKeyword: '',
            showSearchResult: false,
            activeCategory: '全部',
            'formData.batch': '',
            'formData.quantity': ''
        })
        this.updateOptionsDisplay()
        this.searchProducts()
    },

    async autoSearchAndSelect(params) {
        this.setData({ loading: true })
        try {
            // Use same search logic but we need to wait for it
            const res = await wx.cloud.callFunction({
                name: 'inventory',
                data: {
                    keyword: params.model,
                    item_type: params.itemType
                }
            })

            if (res.result.success) {
                let list = res.result.data
                // Try to find exact match
                const exactMatch = list.find(p => p.model === params.model && p.category === params.category)

                this.setData({
                    searchResult: list,
                    showSearchResult: true
                })

                if (exactMatch) {
                    // Auto select the product
                    this.setData({
                        selectedProduct: exactMatch,
                        showSearchResult: false,
                        searchKeyword: '', // clear keyword after selection for cleaner UI? Or keep it? keep is safer
                        'formData.batch': params.batch || ''
                    })

                    // Allow batch field to be populated without re-fetching if possible, 
                    // or just fetch batches to be sure we have the limit checks
                    this.fetchBatches(exactMatch).then(() => {
                        // Ensure batch is set validly
                        if (params.batch) {
                            // Check if batch exists in fetched list?
                            // For user convenience, we just set it. 
                            // If it's not in the dropdown, it might be an issue, but usually it is valid.
                            this.setData({
                                'formData.batch': params.batch
                            })
                        }
                    })
                }
            }
        } catch (e) {
            console.error(e)
            wx.showToast({ title: '自动加载失败', icon: 'none' })
        } finally {
            this.setData({ loading: false })
        }
    },

    setFilter(e) {
        const val = e.currentTarget.dataset.val
        this.setData({ activeCategory: val }, () => {
            this.searchProducts()
        })
    },

    async searchProducts() {
        this.setData({ loading: true })
        try {
            const res = await wx.cloud.callFunction({
                name: 'inventory',
                data: {
                    keyword: this.data.searchKeyword || '',
                    item_type: this.data.itemType
                }
            })
            if (res.result.success) {
                let list = res.result.data
                // Client side filter for category if selected
                if (this.data.activeCategory !== '全部') {
                    list = list.filter(item => item.category === this.data.activeCategory)
                }
                this.setData({
                    searchResult: list,
                    showSearchResult: true
                })
            }
        } catch (e) {
            console.error(e)
            wx.showToast({ title: '加载产品失败', icon: 'none' })
        } finally {
            this.setData({ loading: false })
        }
    },

    onSearch(e) {
        this.setData({ searchKeyword: e.detail.value })
    },

    onSearchConfirm() {
        this.searchProducts()
    },

    onSelectProduct(e) {
        const product = e.currentTarget.dataset.product
        this.setData({
            selectedProduct: product,
            showSearchResult: false,
            searchKeyword: '',
            'formData.batch': '' // Reset batch
        })
        this.fetchBatches(product)
    },

    async fetchBatches(product) {
        wx.showLoading({ title: '加载批号...' })
        try {
            const res = await wx.cloud.callFunction({
                name: 'getProductBatches',
                data: {
                    category: product.category,
                    model: product.model
                }
            })

            if (res.result.success) {
                const list = res.result.data
                const columns = list.map(item => `${item.batch} (余${item.stock}KG)`)
                this.setData({
                    batchList: list,
                    batchColumns: columns
                })
            }
        } catch (e) {
            console.error(e)
            wx.showToast({ title: '批号加载失败', icon: 'none' })
        } finally {
            wx.hideLoading()
        }
    },

    onConfirmBatch(e) {
        const { index } = e.detail
        const selected = this.data.batchList[index]
        if (selected) {
            this.setData({
                'formData.batch': selected.batch,
                showBatch: false
            })
        }
    },

    onClearSelection() {
        this.setData({ selectedProduct: null, batchList: [], batchColumns: [] })
    },

    onInput(e) {
        const field = e.currentTarget.dataset.field
        this.setData({ [`formData.${field}`]: e.detail })
    },

    togglePicker(e) {
        const type = e.currentTarget.dataset.type
        this.setData({ [`show${type}`]: true })
    },

    onClosePicker(e) {
        const type = e.currentTarget.dataset.type
        this.setData({ [`show${type}`]: false })
    },

    onConfirmNature(e) {
        const { value } = e.detail
        this.setData({ 'formData.nature': value, showNature: false })
    },

    onConfirmDate(e) {
        this.setData({
            'formData.date': formatDate(new Date(e.detail)),
            showDate: false
        })
    },

    async onSubmit() {
        const { batch, quantity, nature, date } = this.data.formData
        const product = this.data.selectedProduct

        if (!product) {
            wx.showToast({ title: '请先选择产品', icon: 'none' })
            return
        }
        if (this.data.itemType !== 'package' && !batch) {
            wx.showToast({ title: '请选择批号', icon: 'none' })
            return
        }
        if (!quantity) {
            wx.showToast({ title: '请输入数量', icon: 'none' })
            return
        }
        if (Number(quantity) > product.total_stock_kg) {
            wx.showToast({ title: '库存不足', icon: 'none' })
            return
        }

        // [New] Validate against specific batch stock
        if (this.data.itemType !== 'package' && batch) {
            const selectedBatch = this.data.batchList.find(item => item.batch === batch)
            if (selectedBatch) {
                if (Number(quantity) > selectedBatch.stock) {
                    wx.showToast({ title: '批次库存不足', icon: 'none' })
                    return
                }
            }
        }

        // Prepare confirmation content
        let content = ''
        if (this.data.itemType === 'package') {
            content = `确认出库包装物？\r\n\r\n规格: ${product.model}\r\n数量: ${quantity} 个\r\n性质: ${nature}\r\n日期: ${date}`
        } else {
            content = `确认出库产品？\r\n\r\n型号: ${product.model}\r\n批号: ${batch}\r\n数量: ${quantity} KG\r\n性质: ${nature}\r\n日期: ${date}`
        }

        const modalRes = await wx.showModal({
            title: '确认出库',
            content: content,
            confirmText: '确认提交',
            cancelText: '取消'
        })

        if (!modalRes.confirm) return

        this.setData({ loading: true })
        wx.showLoading({ title: '提交中' })

        try {
            const res = await wx.cloud.callFunction({
                name: 'operation',
                data: {
                    action: 'out',
                    data: {
                        category: product.category,
                        model: product.model,
                        batch,
                        spec: '', // Outbound might not care about spec, or we can add it if needed
                        quantity: Number(quantity),
                        nature,
                        date,
                        item_type: this.data.itemType,
                        operator: 'User'
                    }
                }
            })

            if (res.result.success) {
                wx.showToast({ title: '出库成功', icon: 'success' })
                this.setData({
                    selectedProduct: null,
                    'formData.batch': '',
                    'formData.quantity': ''
                })
            } else {
                wx.showModal({
                    title: '失败',
                    content: res.result.errMsg || '未知错误',
                    showCancel: false
                })
            }
        } catch (e) {
            console.error(e)
            wx.showToast({ title: '网络错误', icon: 'none' })
        } finally {
            wx.hideLoading()
            this.setData({ loading: false })
        }
    }
})
