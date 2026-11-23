#!/usr/bin/env node
/**
 * 一键打包桌面端：自动识别当前系统，构建前端 + 内置后端 + 桌面安装包。
 *
 *   Windows → NSIS 安装版、便携版、zip
 *   macOS   → dmg、zip
 *
 * 用法：npm run dist
 *
 * 注意：PyInstaller 不能跨平台编译，Windows 包必须在 Windows 上执行本脚本，
 * macOS 包必须在 macOS 上执行（两端各跑一次即得到双平台产物）。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'
const isMac = process.platform === 'darwin'

if (!isWin && !isMac) {
  console.error('当前系统不支持一键打包：仅支持 Windows 与 macOS。')
  process.exit(1)
}

function run(label, cmd, args, cwd = root) {
  console.log(`\n▶ ${label}`)
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: isWin })
  if (res.error) {
    console.error(`✗ ${label} 失败：${res.error.message}`)
    process.exit(1)
  }
  if (res.status !== 0) {
    console.error(`✗ ${label} 失败（退出码 ${res.status}）`)
    process.exit(res.status ?? 1)
  }
}

// 选择 Python：优先环境变量，其次项目内 venv，最后系统默认
function findPython() {
  if (process.env.TASKFLOW_PYTHON) return process.env.TASKFLOW_PYTHON
  const venv = isWin ? 'backend/.venv/Scripts/python.exe' : 'backend/.venv/bin/python'
  const venvPath = path.join(root, venv)
  if (existsSync(venvPath)) return venvPath
  return isWin ? 'python' : 'python3'
}

const python = findPython()
const probe = spawnSync(python, ['-c', 'import PyInstaller'], { cwd: root })
if (probe.error || probe.status !== 0) {
  console.error(
    `✗ 未找到 PyInstaller（${python}）。\n` +
      `  请先安装后端打包依赖：\n` +
      `    ${python} -m pip install -r backend/requirements.txt pyinstaller`,
  )
  process.exit(1)
}

console.log(`平台：${isWin ? 'Windows' : 'macOS'}｜Python：${python}`)

if (!existsSync(path.join(root, 'node_modules', 'electron-builder'))) {
  run('安装 Electron 打包依赖', 'npm', ['install'])
}
if (!existsSync(path.join(root, 'frontend', 'node_modules'))) {
  run('安装前端依赖', 'npm', ['install'], path.join(root, 'frontend'))
}

run('构建前端', 'npm', ['run', 'frontend:build'])
run('打包内置后端', python, [
  '-m',
  'PyInstaller',
  '--noconfirm',
  '--distpath',
  'backend/dist',
  '--workpath',
  'backend/build',
  'backend/taskflow-backend.spec',
])
run('生成桌面安装包', 'npx', ['--no-install', 'electron-builder', isWin ? '--win' : '--mac'])

const release = path.join(root, 'release')
const artifacts = existsSync(release)
  ? readdirSync(release).filter((f) => /\.(exe|dmg|zip|pkg|msi)$/i.test(f))
  : []

console.log('\n✓ 打包完成')
if (artifacts.length) {
  console.log(`产物目录：${release}`)
  for (const name of artifacts) {
    const size = (statSync(path.join(release, name)).size / 1024 / 1024).toFixed(1)
    console.log(`  • ${name}（${size} MB）`)
  }
} else {
  console.log('未在 release/ 下找到安装包，请检查 electron-builder 输出。')
}
console.log(
  isWin
    ? '\n提示：macOS 产物需在 macOS 上执行 npm run dist 生成。'
    : '\n提示：Windows 产物需在 Windows 上执行 npm run dist 生成。',
)
