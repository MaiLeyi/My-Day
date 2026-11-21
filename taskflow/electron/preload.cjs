// Preload：通过 contextBridge 向渲染进程暴露白名单 API。
// 安全基线：contextIsolation=true, nodeIntegration=false, sandbox=true。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('taskflow', {
  // 开发模式（Electron dev 模式下渲染进程可用于调试）
  isDev: () => ipcRenderer.invoke('app:isDev'),
  // 后端地址（渲染进程 fetch 时用相对 /api 即可；此方法主要给原生对话框等扩展预留）
  backendUrl: () => `http://127.0.0.1:${8000}`,
  // 最小化到托盘
  hide: () => ipcRenderer.invoke('win:hide'),
  // 打开数据目录
  openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
  // 安装位置与数据位置
  paths: () => ipcRenderer.invoke('app:paths'),
  openPath: (kind) => ipcRenderer.invoke(kind === 'app' ? 'app:openAppDir' : 'app:openDataDir'),
  // 平台
  platform: process.platform,
})
