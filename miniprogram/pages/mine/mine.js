// pages/mine/mine.js
import config from '../../config';

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
        isLoggedIn: false, // [New] Login State
        itemTypeList: ['全部', '产品与材料', '包装物'],
        selectedItemType: '全部'
    },

    onLoad() {
        this.fetchOptions()
    },

    onShow() {
        const app = getApp();
        // Check if already logged in
        if (app.globalData.userInfo) {
            this.setData({ isLoggedIn: true });
            this.updateUserInfo(app.globalData.userInfo);
        } else {
            this.setData({ isLoggedIn: false, isAdmin: false });
        }
    },

    // [New] Manual Login Trigger
    onLogin() {
        const that = this;
        wx.showModal({
            title: '确认登录',
            content: '登录后可进行入库、出库及查看详情操作',
            confirmText: '确认登录',
            confirmColor: '#16a34a',
            success: (res) => {
                if (res.confirm) {
                    // Check Privacy (for compliance)
                    if (wx.requirePrivacyAuthorize) {
                        wx.requirePrivacyAuthorize({
                            success: () => {
                                that.doLogin();
                            },
                            fail: () => {
                                wx.showToast({ title: '需要授权隐私协议', icon: 'none' });
                            }
                        })
                    } else {
                        that.doLogin();
                    }
                }
            }
        });
    },

    doLogin() {
        wx.showLoading({ title: '登录中...' });
        const app = getApp();
        app.checkUserRole((isAdmin) => {
            wx.hideLoading();
            if (app.globalData.userInfo) {
                this.setData({ isLoggedIn: true });
                this.updateUserInfo(app.globalData.userInfo);
                wx.showToast({ title: '登录成功' });
            } else {
                wx.showToast({ title: '登录失败', icon: 'none' });
            }
        });
    },

    updateUserInfo(userInfo) {
        if (!userInfo) return;
        this.setData({
            username: userInfo.name,
            roleName: userInfo.role === 'admin' ? '管理员' : '普通用户',
            isAdmin: userInfo.role === 'admin',
            userInfo // Store full obj
        });
    },

    // [New] Modify Name
    async onEditName() {
        const _this = this;
        wx.showModal({
            title: '修改姓名',
            editable: true,
            placeholderText: '请输入真实姓名',
            content: this.data.username,
            success: async (res) => {
                if (res.confirm && res.content) {
                    const newName = res.content.trim();
                    if (!newName) return;

                    wx.showLoading({ title: '保存中' });
                    try {
                        // Use cloud function to update name (secure)
                        const result = await wx.cloud.callFunction({
                            name: 'updateUserName',
                            data: { name: newName }
                        });

                        if (result.result.success) {
                            // Update Local & Global
                            _this.setData({ username: newName });
                            getApp().globalData.userInfo.name = newName;
                            wx.showToast({ title: '修改成功' });
                        } else {
                            wx.showToast({ title: result.result.errMsg || '修改失败', icon: 'none' });
                        }

                    } catch (e) {
                        console.error(e);
                        wx.showToast({ title: '修改失败', icon: 'none' });
                    } finally {
                        wx.hideLoading();
                    }
                }
            }
        })
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
    },

    // [New] Logout
    onLogout() {
        wx.showModal({
            title: '确认退出',
            content: '退出登录后需要重新登录才能进行出入库操作',
            confirmText: '确认退出',
            confirmColor: '#ef4444',
            success: (res) => {
                if (res.confirm) {
                    const app = getApp();
                    // Use app.logout() to clear token and global state
                    app.logout();

                    // Update local state
                    this.setData({
                        isLoggedIn: false,
                        isAdmin: false,
                        username: '',
                        roleName: ''
                    });

                    wx.showToast({ title: '已退出登录', icon: 'success' });
                }
            }
        });
    }
})
