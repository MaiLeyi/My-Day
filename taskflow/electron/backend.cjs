// 后端服务：探测可执行路径、spawn、守护、就绪探测。
// 开发期跑本机 Python + uvicorn；打包期跑 PyInstaller 产物
// （Windows: taskflow-backend.exe，macOS/Linux: taskflow-backend）。
const { spawn } = require('node:child_process')
const net = require('node:net')
const path = require('node:path')

const HOST = '127.0.0.1'
let PORT = 8000
let child = null

function detectPython() {
  const env = process.env.TASKFLOW_PYTHON
  if (env) return env
  if (process.platform === 'win32') return 'python'
  return 'python3'
}

// 从 start 开始找一个未被占用的端口，避免与网页端 / 其他实例冲突
function findFreePort(start = 8000, attempts = 30) {
  return new Promise((resolve, reject) => {
    let port = start
    const tryPort = () => {
      const srv = net.createServer()
      srv.unref()
      srv.once('error', () => {
        port += 1
        if (port > start + attempts) reject(new Error(`端口 ${start}-${start + attempts} 均被占用`))
        else tryPort()
      })
      srv.once('listening', () => srv.close(() => resolve(port)))
      srv.listen(port, HOST)
    }
    tryPort()
  })
}

function spawnBackend({ backendDir, dev, packaged, port = 8000, dataDir, frontendDist }) {
  if (child) return child

  PORT = port
  const exeName = process.platform === 'win32' ? 'taskflow-backend.exe' : 'taskflow-backend'
  const command = packaged ? path.join(backendDir, exeName) : detectPython()
  const args = packaged
    ? []
    : ['-m', 'uvicorn', 'app.main:app', '--host', HOST, '--port', String(port)]

  const env = {
    ...process.env,
    TASKFLOW_HOST: HOST,
    TASKFLOW_PORT: String(port),
    // 打包后数据库落在用户数据目录（可写）；开发期沿用后端 data/ 目录
    ...(dataDir ? { TASKFLOW_DB: path.join(dataDir, 'taskflow.db') } : {}),
    ...(frontendDist ? { TASKFLOW_FRONTEND_DIST: frontendDist } : {}),
    ...(packaged ? {} : { PYTHONPATH: backendDir }),
    // 用户显式设置的 TASKFLOW_DB 优先
    ...(process.env.TASKFLOW_DB ? { TASKFLOW_DB: process.env.TASKFLOW_DB } : {}),
  }

  try {
    child = spawn(command, args, {
      cwd: backendDir,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    throw new Error(`无法启动后端：${err.message}`)
  }

  let errBuf = ''
  child.stdout.on('data', (chunk) => {
    if (dev) console.log('[backend]', String(chunk).trim())
  })
  child.stderr.on('data', (chunk) => {
    errBuf += String(chunk)
    if (dev) console.error('[backend]', String(chunk).trim())
  })
  child.on('exit', (code, signal) => {
    if (dev) console.log(`[backend] exited code=${code} signal=${signal}`)
    child = null
  })
  child.on('error', (err) => {
    errBuf += `\n[spawn error] ${err.message}`
    console.error('[backend] spawn error', err.message)
  })

  child._errBuf = () => errBuf
  return child
}

function waitForReady({ timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const http = require('node:http')
    const start = Date.now()
    const probe = () => {
      const req = http.request(
        { host: HOST, port: PORT, path: '/api/health', method: 'GET', timeout: 800 },
        (res) => {
          res.resume()
          res.on('end', () => {
            if (res.statusCode === 200) resolve({ host: HOST, port: PORT })
            else retry()
          })
        },
      )
      req.on('error', retry)
      req.on('timeout', () => {
        req.destroy()
        retry()
      })
      req.end()
    }
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error('后端启动超时（' + timeoutMs + 'ms）'))
        return
      }
      setTimeout(probe, 250)
    }
    probe()
  })
}

function killBackend() {
  if (!child) return
  const pid = child.pid
  child = null
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGTERM')
    }
  } catch {
    /* ignore */
  }
}

module.exports = {
  HOST,
  getPort: () => PORT,
  getBackend: () => child,
  findFreePort,
  spawnBackend,
  waitForReady,
  killBackend,
}
