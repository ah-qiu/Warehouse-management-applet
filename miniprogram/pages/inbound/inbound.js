const db = wx.cloud.database()
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
        // Form Data
        formData: {
            category: '',
            model: '',
            batch: '',
            spec: '',
            quantity: '',
            nature: '',
            date: formatDate(new Date())
        },

        itemType: 'product', // 'product' | 'package'

        // Options
        categories: [],
        specs: [],
        inboundNature: [],

        // Raw options data backup
        rawOptions: {},

        // Pickers UI state
        showCategory: false,
        showSpec: false,
        showNature: false,
        showDate: false,
        currentDate: new Date().getTime(),
        minDate: new Date(2020, 0, 1).getTime(),



        // Model suggestions
        categoryModels: [],
        showModelSuggestions: false,

        loading: false
    },

    onLoad() {
        // fetchOptions moved to onShow for auto-refresh
    },

    onShow() {
        this.fetchOptions()
    },

    async fetchOptions() {
        wx.showNavigationBarLoading()
        try {
            const res = await wx.cloud.callFunction({ name: 'getOptions' })
            if (res.result.success) {
                const data = res.result.data
                this.setData({ rawOptions: data })
                this.updateOptionsDisplay()
            }
        } catch (e) {
            console.error('Fetch options failed', e)
        } finally {
            wx.hideNavigationBarLoading()
        }
    },

    updateOptionsDisplay() {
        const { rawOptions, itemType } = this.data
        if (!rawOptions || !rawOptions.categories) return

        let categories = []
        let specs = []
        let inboundNature = []

        if (itemType === 'package') {
            categories = rawOptions.packageCategories.items
            specs = rawOptions.packageSpecs.items
            inboundNature = rawOptions.packageInboundNature.items
        } else {
            categories = rawOptions.categories.items
            specs = rawOptions.specs.items
            inboundNature = rawOptions.inboundNature.items
        }

        const updates = {
            categories,
            specs,
            inboundNature
        }

        // Smart defaults logic...
        const currentNature = this.data.formData.nature
        if (!currentNature || !inboundNature.includes(currentNature)) {
            updates['formData.nature'] = inboundNature[0] || ''
        }

        this.setData(updates)
    },

    onTypeChange(e) {
        const type = e.currentTarget.dataset.type
        if (type === this.data.itemType) return

        this.setData({
            itemType: type,
            // Reset fields that might be invalid
            'formData.category': '',
            'formData.model': '',
            'formData.spec': '',
            'formData.nature': ''
        })
        this.updateOptionsDisplay()
    },

    async fetchModelsByCategory(category) {
        if (!category) return
        try {
            const res = await wx.cloud.callFunction({
                name: 'inventory',
                data: { action: 'getModels', category }
            })
            if (res.result.success) {
                this.setData({ categoryModels: res.result.data })
            }
        } catch (e) {
            console.error('Failed to fetch models', e)
        }
    },

    // Input Handlers
    onInput(e) {
        const field = e.currentTarget.dataset.field
        this.setData({ [`formData.${field}`]: e.detail })
    },

    onFocusModel() {
        if (this.data.formData.category && this.data.categoryModels.length > 0) {
            this.setData({ showModelSuggestions: true })
        }
    },

    selectModel(e) {
        const model = e.currentTarget.dataset.model
        this.setData({
            'formData.model': model,
            showModelSuggestions: false
        })
    },

    onCloseSuggestions() {
        // Small delay to allow tap to register if needed, 
        // or just use this for the overlay click
        this.setData({ showModelSuggestions: false })
    },

    // Picker Handlers
    togglePicker(e) {
        const type = e.currentTarget.dataset.type
        this.setData({ [`show${type}`]: true })
    },

    onClosePicker(e) {
        const type = e.currentTarget.dataset.type
        this.setData({ [`show${type}`]: false })
    },

    onConfirmCategory(e) {
        const { value } = e.detail
        this.setData({ 'formData.category': value, showCategory: false })
        if (this.data.itemType === 'product') {
            this.fetchModelsByCategory(value)
        }
    },

    onConfirmSpec(e) {
        const { value } = e.detail
        this.setData({ 'formData.spec': value, showSpec: false })
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

    // Submit
    async onSubmit() {
        const { category, model, batch, spec, quantity, nature, date } = this.data.formData
        const { itemType } = this.data

        // For package, model is optional (will be set to spec by backend), batch is optional
        if (itemType === 'package') {
            if (!category || !spec || !quantity) {
                wx.showToast({ title: '请填写完整', icon: 'none' })
                return
            }
        } else {
            if (!category || !model || !batch || !quantity) {
                wx.showToast({ title: '请填写完整', icon: 'none' })
                return
            }
        }

        // Prepare confirmation content
        let content = ''
        if (itemType === 'package') {
            content = `确认入库包装物？\r\n\r\n类别: ${category}\r\n规格: ${spec}\r\n数量: ${quantity}\r\n性质: ${nature}\r\n日期: ${date}`
        } else {
            content = `确认入库产品？\r\n\r\n型号: ${model}\r\n批号: ${batch}\r\n数量: ${quantity} KG\r\n性质: ${nature}\r\n日期: ${date}`
        }

        const modalRes = await wx.showModal({
            title: '确认入库',
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
                    action: 'in',
                    data: {
                        category,
                        model,
                        batch,
                        spec,
                        quantity: Number(quantity),
                        nature,
                        date,
                        item_type: this.data.itemType,
                        operator: 'User' // Replace with real user info if auth integrated
                    }
                }
            })

            if (res.result.success) {
                wx.showToast({ title: '入库成功', icon: 'success' })
                // Clear critical fields
                this.setData({
                    'formData.model': '',
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
