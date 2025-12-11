// app.js
import config from './config';

App({
  onLaunch: function () {
    this.globalData = {
      env: config.envId,
      isAdmin: false,
      userInfo: null,
      authReadyCallback: null,
      config: config
    };

    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });

      // [Persistent Login] Check for stored token on launch
      this.tryAutoLogin();
    }
  },

  // [New] Try auto login with stored token
  tryAutoLogin: function () {
    const token = wx.getStorageSync('loginToken');
    if (!token) {
      console.log('No stored token, user needs to login manually');
      return;
    }

    // Verify token with cloud function
    wx.cloud.callFunction({
      name: 'verifyToken',
      data: { token },
      success: res => {
        if (res.result.success) {
          console.log('Auto login success:', res.result);
          this.globalData.userInfo = {
            name: res.result.name,
            role: res.result.role
          };
          this.globalData.isAdmin = res.result.role === 'admin';

          // Notify waiting pages
          if (this.globalData.authReadyCallback) {
            this.globalData.authReadyCallback(this.globalData.isAdmin);
          }
        } else {
          console.log('Token invalid or expired, clearing...');
          wx.removeStorageSync('loginToken');
        }
      },
      fail: err => {
        console.error('Token verification failed:', err);
        wx.removeStorageSync('loginToken');
      }
    });
  },

  // Manual login (called from Mine page)
  checkUserRole: function (cb) {
    wx.cloud.callFunction({
      name: 'login',
      success: res => {
        console.log('Login result:', res.result);

        if (res.result.success) {
          const { token, role, name } = res.result;
          const isUserAdmin = role === 'admin';

          // [Persistent Login] Store token locally
          wx.setStorageSync('loginToken', token);

          this.globalData.isAdmin = isUserAdmin;
          this.globalData.userInfo = {
            name: name,
            role: role
          };

          if (this.globalData.authReadyCallback) {
            this.globalData.authReadyCallback(isUserAdmin);
          }
          if (cb) cb(isUserAdmin);
        } else {
          console.error('Login failed:', res.result.errMsg);
          this.globalData.isAdmin = false;
          this.globalData.userInfo = null;
          if (cb) cb(false);
        }
      },
      fail: err => {
        console.error('Login failed:', err);
        this.globalData.isAdmin = false;
        this.globalData.userInfo = null;
        if (this.globalData.authReadyCallback) {
          this.globalData.authReadyCallback(false);
        }
        if (cb) cb(false);
      }
    });
  },

  // [New] Logout - clear token
  logout: function () {
    wx.removeStorageSync('loginToken');
    this.globalData.userInfo = null;
    this.globalData.isAdmin = false;
  }
});
