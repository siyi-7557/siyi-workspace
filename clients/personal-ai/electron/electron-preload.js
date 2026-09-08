const { contextBridge, ipcRenderer } = require('electron');

// 暴露给前端的 API
contextBridge.exposeInMainWorld('electronAPI', {
  // 显示原生通知
  showNotification: (title, body) => {
    ipcRenderer.send('show-notification', { title, body });
  },

  // 最小化到托盘
  minimizeToTray: () => {
    ipcRenderer.send('minimize-to-tray');
  },

  // 监听全局搜索触发
  onGlobalSearch: (callback) => {
    ipcRenderer.on('global-search', () => callback());
  },

  // 判断是否在 Electron 环境中
  isElectron: true,
});
