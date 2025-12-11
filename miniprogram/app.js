// app.js
const config = require('./config');

App({
  onLaunch: function () {
    this.globalData = {
      // env 参数说明：
      //   env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会默认请求到哪个云环境的资源
      //   此处请填入环境 ID, 环境 ID 可打开云控制台查看
      //   如不填则使用默认环境（第一个创建的环境）
      env: config.envId,
      isAdmin: false, // 默认为非管理员
      authReadyCallback: null, // 用于页面等待权限加载完成
      config: config // Expose config globally if needed
    };

    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });

      // 启动时校验权限
      this.checkUserRole();

      // 设置标题
      // 注意：tabBar页面的标题通常在 json 中配置，这里仅作为动态设置的备选或非tabBar页生效
      // 若要完全动态化 tabBar 标题，需要自定义 tabBar 或在每个页面 onShow 设置。
      // 这里先仅保留 globalData 供页面使用。
    }
  },

  checkUserRole: function () {
    wx.cloud.callFunction({
      name: 'checkAuth',
      success: res => {
        console.log('Auth check result:', res.result);
        this.globalData.isAdmin = res.result.isAdmin;
        // 如果有页面在等待结果，执行回调
        if (this.globalData.authReadyCallback) {
          this.globalData.authReadyCallback(res.result.isAdmin);
        }
      },
      fail: err => {
        console.error('Auth check failed:', err);
        // 失败默认视为无权限，但也需通知
        this.globalData.isAdmin = false;
        if (this.globalData.authReadyCallback) {
          this.globalData.authReadyCallback(false);
        }
      }
    })
  },
});
