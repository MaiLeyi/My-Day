// Electron 主进程：窗口、托盘、子进程守护。
// ESM 与 CJS 隔离：前端工程保持 type:module，主进程用 .cjs。
const path = require('node:path')
const fs = require('node:fs')
const { app, BrowserWindow, Tray, Menu, Notification, shell, dialog, ipcMain, nativeImage } = require('electron')

const { spawnBackend, waitForReady, killBackend, findFreePort, getPort, getBackend, HOST } = require('./backend.cjs')
const { defaultPathsFor, validateDataDir, ensureWritable, copyDataDir } = require('./storage.cjs')

const DEV = !app.isPackaged && (process.argv.includes('--dev') || process.env.ELECTRON_DEV === '1')
const PACKAGED = app.isPackaged
const IS_MAC = process.platform === 'darwin'
const ROOT = path.resolve(__dirname, '..')
const RESOURCES = PACKAGED ? process.resourcesPath : ROOT
const BACKEND_DIR = PACKAGED ? path.join(RESOURCES, 'backend') : path.join(ROOT, 'backend')
const FRONTEND_DIST = PACKAGED
  ? path.join(RESOURCES, 'frontend')
  : path.join(ROOT, 'frontend', 'dist')
const PRELOAD = path.join(__dirname, 'preload.cjs')
// 数据目录：默认放用户数据目录，可在设置中修改。
// 配置文件固定放在 userData（不随数据目录变化），作为定位数据目录的唯一锚点。
const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json')
const DEFAULT_DATA_DIR = PACKAGED ? app.getPath('userData') : path.join(BACKEND_DIR, 'data')
const LOG_FILE = PACKAGED ? path.join(app.getPath('userData'), 'runtime.log') : path.join(__dirname, 'runtime.log')

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) || {} } catch { return {} }
}

function writeConfig(next) {
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2))
}

let DATA_DIR = DEFAULT_DATA_DIR
const savedConfig = readConfig()
if (typeof savedConfig.dataDir === 'string' && savedConfig.dataDir.trim()) {
  DATA_DIR = path.resolve(savedConfig.dataDir)
}

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
let booted = false

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

// 应用安装位置：打包后为安装目录（macOS 为 .app 路径），开发期为项目根目录
function appLocation() {
  if (!PACKAGED) return ROOT
  const exe = app.getPath('exe')
  if (IS_MAC) {
    const idx = exe.indexOf('.app/')
    if (idx !== -1) return exe.slice(0, idx + 4)
  }
  return path.dirname(exe)
}

function openAppDir() {
  try {
    const target = appLocation()
    // macOS 打开 .app 会启动应用，这里改为在 Finder 中定位
    if (IS_MAC && target.endsWith('.app')) shell.showItemInFolder(target)
    else shell.openPath(target)
  } catch (err) { log('[openAppDir] fail', err.message) }
}

// macOS 菜单栏使用模板图（黑色 + 透明），浅色/深色模式下自动反色；
// Windows / Linux 用彩色图标。
function trayImage() {
  const file = IS_MAC ? 'trayTemplate.png' : 'tray.png'
  const target = path.join(__dirname, file)
  if (fs.existsSync(target)) {
    const img = nativeImage.createFromPath(target)
    if (!img.isEmpty()) {
      if (IS_MAC) img.setTemplateImage(true)
      return img
    }
  }
  // 兜底：1x1 透明图，保证 Tray 不因缺图而报错
  return nativeImage.createFromBuffer(
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'),
  )
}

function createTray() {
  tray = new Tray(trayImage())
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

// macOS 没有应用菜单时会缺失 Cmd+C/V/Q 等标准快捷键，这里补一份最小菜单。
function setupMacMenu() {
  if (!IS_MAC) return
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about', label: '关于任务流' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏任务流' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出任务流' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { role: 'close', label: '关闭窗口' },
        { type: 'separator' },
        { role: 'front', label: '前置全部窗口' },
      ],
    },
  ]))
}

function failStart(msg) { log('[boot] FAIL:', msg); try { dialog.showErrorBox('任务流启动失败', msg) } catch {} }

app.on('before-quit', () => { forceQuit = true; killBackend() })
app.on('window-all-closed', () => { /* 交给托盘维持 */ })
// macOS 点击 Dock 图标：窗口被收起（隐藏）时应重新显示
app.on('activate', () => {
  if (!booted) return
  if (!mainWindow) createWindow()
  else { mainWindow.show(); mainWindow.focus() }
})

ipcMain.handle('app:isDev', () => DEV)
ipcMain.handle('app:isPackaged', () => PACKAGED)
ipcMain.handle('app:openDataDir', () => { openDataDir(); return true })
ipcMain.handle('app:openAppDir', () => { openAppDir(); return true })
ipcMain.handle('app:paths', () => ({
  appDir: appLocation(),
  dataDir: DATA_DIR,
  logFile: LOG_FILE,
  packaged: PACKAGED,
  version: app.getVersion(),
}))
ipcMain.handle('win:hide', () => { mainWindow?.hide(); return true })

// 用指定数据目录重新拉起后端（迁移数据后调用）
async function restartBackend(dataDir) {
  spawnBackend({
    backendDir: BACKEND_DIR,
    dev: DEV,
    packaged: PACKAGED,
    port: getPort(),
    dataDir,
    frontendDist: FRONTEND_DIST,
  })
  await waitForReady({ timeoutMs: 30000 })
  if (!getBackend()) throw new Error('后端进程已退出，端口可能被占用')
}

ipcMain.handle('app:chooseDataDir', async () => {
  if (!mainWindow) return { ok: false, message: '窗口尚未就绪' }
  const picked = await dialog.showOpenDialog(mainWindow, {
    title: '选择数据存储目录',
    buttonLabel: '选择此目录',
    properties: ['openDirectory', 'createDirectory'],
  })
  const target = picked.filePaths?.[0]
  if (picked.canceled || !target) return { ok: false, canceled: true }

  const check = validateDataDir(target, DATA_DIR, { packaged: PACKAGED, appDir: appLocation() })
  if (!check.ok) return check
  const writable = ensureWritable(path.resolve(target))
  if (!writable.ok) return writable

  const confirm = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: '更改数据存储位置',
    message: '迁移现有数据到新目录？',
    detail: `新目录：${target}\n\n数据库与附件会复制到新目录，完成后应用改用新位置；原目录数据保留，可自行删除。`,
    buttons: ['开始迁移', '取消'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  })
  if (confirm.response !== 0) return { ok: false, canceled: true }

  const previous = path.resolve(DATA_DIR)
  const next = path.resolve(target)
  try {
    await killBackend()
    await copyDataDir(previous, next)
    writeConfig({ ...readConfig(), dataDir: next })
    DATA_DIR = next
    await restartBackend(next)
    log('[data] migrated', previous, '->', next)
    return { ok: true, paths: defaultPathsFor(next) }
  } catch (err) {
    log('[data] migrate fail', err.message)
    // 回滚：恢复原数据目录并重新拉起后端
    try { writeConfig({ ...readConfig(), dataDir: previous }) } catch { /* ignore */ }
    DATA_DIR = previous
    try { await restartBackend(previous) } catch (e) { log('[data] rollback restart fail', e.message) }
    return { ok: false, message: `迁移失败：${err.message}` }
  }
})

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
  booted = true
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
    setupMacMenu()
    // 开发期 Dock 图标默认是 Electron，换成应用图标
    if (IS_MAC && !PACKAGED && app.dock) {
      const iconPath = path.join(__dirname, 'icon.png')
      if (fs.existsSync(iconPath)) app.dock.setIcon(iconPath)
    }
    try { await boot() } catch (err) {
      log('[boot] exception:', err?.message || String(err))
      failStart(err?.message || String(err))
    }
  })
}
