const db = wx.cloud.database()
const _ = db.command

Page({
    data: {
        activeTab: 0,
        itemType: 'product', // 'product' | 'package'
        tabs: [], // Dynamic tabs
        lists: {
            category_list: [],
            spec_list: [],
            inbound_nature_list: [],
            outbound_nature_list: [],
            package_category_list: [],
            package_spec_list: [],
            package_inbound_nature_list: [],
            package_outbound_nature_list: []
        },
        // Store mapping from config_id to real _id
        idMap: {},
        showAddDialog: false,
        newItemValue: ''
    },

    onLoad() {
        this.updateTabs() // Init tabs
        this.fetchData()
    },

    updateTabs() {
        if (this.data.itemType === 'package') {
            this.setData({
                tabs: [
                    { title: '包装类别', id: 'package_category_list' },
                    { title: '包装规格', id: 'package_spec_list' },
                    { title: '入库性质', id: 'package_inbound_nature_list' },
                    { title: '出库性质', id: 'package_outbound_nature_list' }
                ],
                activeTab: 0
            })
        } else {
            this.setData({
                tabs: [
                    { title: '产品类别', id: 'category_list' },
                    { title: '产品型号', id: 'spec_list' }, // Mapping 'spec_list' to model conceptually if needed, or just specific spec list
                    { title: '入库性质', id: 'inbound_nature_list' },
                    { title: '出库性质', id: 'outbound_nature_list' }
                ],
                activeTab: 0
            })
        }
    },

    onTypeChange(e) {
        const type = e.currentTarget.dataset.type
        if (type === this.data.itemType) return
        this.setData({ itemType: type })
        this.updateTabs()
    },

    async fetchData() {
        wx.showLoading({ title: '加载中' })
        try {
            const res = await wx.cloud.callFunction({ name: 'getOptions' })
            if (res.result.success) {
                const {
                    categories, specs, inboundNature, outboundNature,
                    packageCategories, packageSpecs, packageInboundNature, packageOutboundNature
                } = res.result.data

                this.setData({
                    'lists.category_list': categories.items,
                    'lists.spec_list': specs.items,
                    'lists.inbound_nature_list': inboundNature.items,
                    'lists.outbound_nature_list': outboundNature.items,
                    'lists.package_category_list': packageCategories.items,
                    'lists.package_spec_list': packageSpecs.items,
                    'lists.package_inbound_nature_list': packageInboundNature.items,
                    'lists.package_outbound_nature_list': packageOutboundNature.items,

                    idMap: {
                        category_list: categories._id,
                        spec_list: specs._id,
                        inbound_nature_list: inboundNature._id,
                        outbound_nature_list: outboundNature._id,
                        package_category_list: packageCategories._id,
                        package_spec_list: packageSpecs._id,
                        package_inbound_nature_list: packageInboundNature._id,
                        package_outbound_nature_list: packageOutboundNature._id
                    }
                })
            }
        } catch (e) {
            wx.showToast({ title: '加载失败', icon: 'none' })
            console.error(e)
        } finally {
            wx.hideLoading()
        }
    },

    onTabChange(e) {
        this.setData({ activeTab: e.detail.index || e.detail.name })
    },

    showAdd() {
        this.setData({ showAddDialog: true, newItemValue: '' })
    },

    onCloseDialog() {
        this.setData({ showAddDialog: false })
    },

    onInput(e) {
        this.setData({ newItemValue: e.detail.value || e.detail })
    },

    async confirmAdd() {
        const val = this.data.newItemValue.trim()
        if (!val) {
            wx.showToast({ title: '请输入内容', icon: 'none' })
            return
        }

        const currentTab = this.data.tabs[this.data.activeTab]
        const configId = currentTab.id
        const currentList = this.data.lists[configId] || []
        const realId = this.data.idMap[configId]

        if (currentList.includes(val)) {
            wx.showToast({ title: '已存在该选项', icon: 'none' })
            return
        }

        wx.showLoading({ title: '保存中' })
        try {
            const newList = [...currentList, val]

            // Call Cloud Function to Add
            await wx.cloud.callFunction({
                name: 'getOptions',
                data: {
                    action: 'add',
                    configId: configId,
                    value: val
                }
            })

            this.setData({
                [`lists.${configId}`]: newList,
                showAddDialog: false,
                newItemValue: ''
            })
            wx.showToast({ title: '添加成功' })
        } catch (e) {
            console.error(e)
            wx.showToast({ title: '添加失败', icon: 'none' })
        } finally {
            wx.hideLoading()
        }
    },

    async deleteItem(e) {
        const index = e.currentTarget.dataset.index
        const val = e.currentTarget.dataset.item
        const currentTab = this.data.tabs[this.data.activeTab]
        const configId = currentTab.id
        const realId = this.data.idMap[configId]

        if (!realId) return

        wx.showModal({
            title: '确认删除',
            content: `确定要删除 "${val}" 吗？`,
            success: async (res) => {
                if (res.confirm) {
                    wx.showLoading({ title: '删除中' })
                    try {
                        await wx.cloud.callFunction({
                            name: 'getOptions',
                            data: {
                                action: 'remove',
                                configId: configId,
                                value: val
                            }
                        })

                        const newList = this.data.lists[configId].filter(i => i !== val)
                        this.setData({ [`lists.${configId}`]: newList })
                        wx.showToast({ title: '已删除' })
                    } catch (e) {
                        console.error(e)
                        wx.showToast({ title: '删除失败', icon: 'none' })
                    } finally {
                        wx.hideLoading()
                    }
                }
            }
        })
    }
})

