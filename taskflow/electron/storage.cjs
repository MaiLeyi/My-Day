// 数据目录的校验与迁移（不依赖 Electron，便于单独测试）。
const fs = require('node:fs')
const path = require('node:path')

// 需要随数据目录一起迁移的文件：SQLite 主库、日志/锁文件、附件目录
const DATA_NAMES = ['taskflow.db', 'taskflow.db-wal', 'taskflow.db-shm', 'taskflow.db-journal', 'files']

function defaultPathsFor(dir) {
  return {
    dataDir: dir,
    dbPath: path.join(dir, 'taskflow.db'),
    filesDir: path.join(dir, 'files'),
  }
}

/**
 * 校验目标数据目录。
 * @param {string} target 用户选择的新目录
 * @param {string} current 当前数据目录
 * @param {{ packaged: boolean, appDir: string }} opts
 */
function validateDataDir(target, current, opts) {
  const to = path.resolve(target)
  const from = path.resolve(current)

  if (to === from) return { ok: false, message: '与当前数据目录相同' }
  if (to.startsWith(from + path.sep)) {
    return { ok: false, message: '不能选择当前数据目录的子目录，请换一个目录' }
  }
  if (opts.packaged && (to + path.sep).startsWith(path.resolve(opts.appDir) + path.sep)) {
    return { ok: false, message: '不能选择应用安装目录，应用升级时会被覆盖' }
  }
  if (fs.existsSync(path.join(to, 'taskflow.db'))) {
    return { ok: false, message: '该目录已有任务流数据（taskflow.db），请选择空目录' }
  }
  return { ok: true }
}

/** 检查目录是否可写；不存在时尝试创建。 */
function ensureWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, `.taskflow-write-test-${Date.now()}`)
    fs.writeFileSync(probe, 'ok')
    fs.unlinkSync(probe)
    return { ok: true }
  } catch (err) {
    return { ok: false, message: `目录不可写：${err.message}` }
  }
}

/** 把数据库与附件复制到新目录（保留原目录数据）。 */
async function copyDataDir(from, to) {
  await fs.promises.mkdir(to, { recursive: true })
  for (const name of DATA_NAMES) {
    const src = path.join(from, name)
    if (!fs.existsSync(src)) continue
    await fs.promises.cp(src, path.join(to, name), { recursive: true, force: true })
  }
}

module.exports = { defaultPathsFor, validateDataDir, ensureWritable, copyDataDir }
