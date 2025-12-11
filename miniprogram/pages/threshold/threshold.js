const app = getApp()

Page({
    data: {
        list: [],
        loading: false,
        keyword: '',
        itemType: 'product', // 'product' | 'package'

        // Edit
        showEdit: false,
        editingItem: null,
        editValue: '',
        saving: false
    },

    onLoad() {
        this.fetchData()
    },

    onTypeChange(e) {
        const type = e.currentTarget.dataset.type
        if (type === this.data.itemType) return

        this.setData({
            itemType: type,
            list: [],
            keyword: ''
        })
        this.fetchData()
    },

    onSearch(e) {
        this.setData({ keyword: e.detail.value })
    },

    onSearchConfirm() {
        this.fetchData()
    },

    async fetchData() {
        this.setData({ loading: true })
        try {
            const res = await wx.cloud.callFunction({
                name: 'inventory',
                data: {
                    keyword: this.data.keyword,
                    item_type: this.data.itemType
                }
            })
            if (res.result.success) {
                this.setData({ list: res.result.data })
            }
        } catch (e) {
            console.error(e)
            wx.showToast({ title: '加载失败', icon: 'none' })
        } finally {
            this.setData({ loading: false })
        }
    },

    onEdit(e) {
        const item = e.currentTarget.dataset.item
        this.setData({
            showEdit: true,
            editingItem: item,
            editValue: item.warning_threshold || ''
        })
    },

    onCloseEdit() {
        this.setData({ showEdit: false })
    },

    onInputEdit(e) {
        this.setData({ editValue: e.detail.value })
    },

    async saveThreshold() {
        const val = parseFloat(this.data.editValue)
        if (isNaN(val) || val < 0) {
            wx.showToast({ title: '请输入有效的数值', icon: 'none' })
            return
        }

        this.setData({ saving: true })
        try {
            const res = await wx.cloud.callFunction({
                name: 'updateProduct',
                data: {
                    productId: this.data.editingItem._id,
                    data: {
                        warning_threshold: val
                    }
                }
            })

            if (res.result.success) {
                wx.showToast({ title: '设置成功' })
                this.setData({ showEdit: false })
                // Update local list
                const newList = this.data.list.map(item => {
                    if (item._id === this.data.editingItem._id) {
                        return { ...item, warning_threshold: val }
                    }
                    return item
                })
                this.setData({ list: newList })
            } else {
                wx.showToast({ title: '保存失败: ' + res.result.errMsg, icon: 'none' })
            }
        } catch (e) {
            console.error(e)
            wx.showToast({ title: '网络错误', icon: 'none' })
        } finally {
            this.setData({ saving: false })
        }
    }
})
