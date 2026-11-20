// Electron 主进程：窗口、托盘、子进程守护。
// ESM 与 CJS 隔离：前端工程保持 type:module，主进程用 .cjs。
const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow, Tray, Menu, Notification, shell, dialog, ipcMain, nativeImage } = require('electron')

const { spawnBackend, waitForReady, killBackend, findFreePort, getPort, getBackend, HOST } = require('./backend.cjs')

const DEV = !app.isPackaged && (process.argv.includes('--dev') || process.env.ELECTRON_DEV === '1')
const PACKAGED = app.isPackaged
const ROOT = path.resolve(__dirname, '..')
const RESOURCES = PACKAGED ? process.resourcesPath : ROOT
const BACKEND_DIR = PACKAGED ? path.join(RESOURCES, 'backend') : path.join(ROOT, 'backend')
const FRONTEND_DIST = PACKAGED
  ? path.join(RESOURCES, 'frontend')
  : path.join(ROOT, 'frontend', 'dist')
const PRELOAD = path.join(__dirname, 'preload.cjs')
// 打包后数据库与日志放在用户数据目录（安装目录只读）
const DATA_DIR = PACKAGED ? app.getPath('userData') : path.join(BACKEND_DIR, 'data')
const LOG_FILE = PACKAGED ? path.join(app.getPath('userData'), 'runtime.log') : path.join(__dirname, 'runtime.log')

function log(...args) {
  const line = new Date().toISOString() + ' ' + args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
    fs.appendFileSync(LOG_FILE, line + '\n')
  } catch { /* ignore */ }
  console.log(...args)
}

let mainWindow = null
let tray = null
let forceQuit = false

function indexUrl() {
  if (DEV) return 'http://localhost:5173'
  return `http://${HOST}:${getPort()}`
}

function createWindow() {
  log('[win] create url=', indexUrl())
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 960, minHeight: 620,
    backgroundColor: '#f5f5f6', show: false,
    title: '任务流',
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: false, webSecurity: true },
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) { shell.openExternal(url); return { action: 'deny' } }
    return { action: 'allow' }
  })
  mainWindow.loadURL(indexUrl())
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', (e) => {
    if (!forceQuit) { e.preventDefault(); mainWindow.hide() }
  })
  mainWindow.on('closed', () => { mainWindow = null })
}

function openDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    shell.openPath(DATA_DIR)
  } catch (err) { log('[openDataDir] fail', err.message) }
}

function createTray() {
  let iconBuf
  try { iconBuf = fs.readFileSync(path.join(__dirname, 'tray-placeholder.png')) } catch {
    iconBuf = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
  }
  tray = new Tray(nativeImage.createFromBuffer(iconBuf))
  tray.setToolTip('任务流')
  tray.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } })
  tray.on('right-click', () => {
    tray.popUpContextMenu(Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => { mainWindow?.show(); mainWindow?.focus() } },
      { label: '打开数据目录', click: openDataDir },
      { type: 'separator' },
      { label: '退出', click: () => { forceQuit = true; app.quit() } },
    ]))
  })
}

function failStart(msg) { log('[boot] FAIL:', msg); try { dialog.showErrorBox('任务流启动失败', msg) } catch {} }

app.on('before-quit', () => { forceQuit = true; killBackend() })
app.on('window-all-closed', () => { /* 交给托盘维持 */ })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

ipcMain.handle('app:isDev', () => DEV)
ipcMain.handle('app:isPackaged', () => PACKAGED)
ipcMain.handle('app:openDataDir', () => { openDataDir(); return true })
ipcMain.handle('win:hide', () => { mainWindow?.hide(); return true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 便携版首次启动时文件正在解压/被杀软扫描，existsSync 可能瞬时为 false，需重试
async function waitForFile(target, timeoutMs = 8000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try { if (fs.existsSync(target)) return true } catch { /* ignore */ }
    await sleep(200)
  }
  return fs.existsSync(target)
}

async function boot() {
  log('[boot] DEV=', DEV, 'PACKAGED=', PACKAGED, 'BACKEND=', BACKEND_DIR, 'DATA=', DATA_DIR, 'DIST_EXISTS=', fs.existsSync(FRONTEND_DIST))
  if (!DEV && !(await waitForFile(FRONTEND_DIST))) { failStart('前端构建产物不存在：' + FRONTEND_DIST); return }
  if (PACKAGED) {
    const exe = path.join(BACKEND_DIR, process.platform === 'win32' ? 'taskflow-backend.exe' : 'taskflow-backend')
    if (!(await waitForFile(exe))) {
      failStart('内置后端缺失：' + exe + '\n\n若使用单文件便携版，请改用解压即用的 zip 版本。')
      return
    }
  }

  let port = 8000
  try {
    port = await findFreePort(8000)
    log('[boot] use port', port)
  } catch (err) { log('[boot] findFreePort fail', err.message) }

  let errBuf = ''
  try {
    const proc = spawnBackend({
      backendDir: BACKEND_DIR,
      dev: DEV,
      packaged: PACKAGED,
      port,
      dataDir: DATA_DIR,
      frontendDist: FRONTEND_DIST,
    })
    errBuf = proc._errBuf
    log('[boot] backend pid=', proc.pid)
  } catch (err) { failStart('无法启动后端：' + err.message); return }

  try {
    await waitForReady({ timeoutMs: 30000 })
    // 防止端口被其他进程占用时误判为“已就绪”
    if (!getBackend()) { failStart('后端进程已退出，端口可能被其他程序占用。'); return }
    log('[boot] backend ready')
  } catch (err) {
    failStart('后端未就绪：' + err.message + '\n\n后端输出：\n' + (errBuf() || '(空)').slice(-800))
    killBackend()
    return
  }

  createWindow()
  createTray()
  log('[boot] window opened')
  if (Notification.isSupported()) { try { new Notification({ title: '任务流', body: '已就绪' }).show() } catch {} }
}

// 单实例：再次启动时聚焦已有窗口
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus() }
  })
  app.whenReady().then(async () => {
    try { await boot() } catch (err) {
      log('[boot] exception:', err?.message || String(err))
      failStart(err?.message || String(err))
    }
  })
}
