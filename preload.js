const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 调用主进程
  startBrushing: (config) => ipcRenderer.invoke('start-brushing', config),
  stopBrushing: () => ipcRenderer.invoke('stop-brushing'),
  getHomeworkList: (options) => ipcRenderer.invoke('get-homework-list', options),
  getHomeworkInfo: (examno) => ipcRenderer.invoke('get-homework-info', examno),
  submitHomework: (payload) => ipcRenderer.invoke('submit-homework', payload),
  
  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  
  // 监听主进程事件
  onLog: (callback) => ipcRenderer.on('log-message', (event, value) => callback(value)),
  onStatusUpdate: (callback) => ipcRenderer.on('status-update', (event, value) => callback(value)),
  onCoursesUpdate: (callback) => ipcRenderer.on('courses-update', (event, value) => callback(value)),
  onHomeworkUpdate: (callback) => ipcRenderer.on('homework-update', (event, value) => callback(value)),
  onUserInfo: (callback) => ipcRenderer.on('user-info', (event, value) => callback(value)),
  onSavedConfig: (callback) => ipcRenderer.on('saved-config', (event, value) => callback(value)),

  // 自动更新相关接口
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (event, info) => callback(info)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (event, info) => callback(info)),
  installUpdate: () => ipcRenderer.send('install-update')
});
