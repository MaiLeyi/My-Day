# 任务流 TaskFlow

一个事项管理应用，支持**网页端**与**Windows 桌面端**，两端共用同一套前端与后端，交互完全一致。

## 功能

- 清单 / 月视图 / 周视图 / 日程视图
- 项目与分组管理、拖拽移动、批量操作
- 优先级、计划日期、截止日期、时间区间
- 详情编辑、导出（CSV / Markdown 等）
- AI 拆分任务（可配置 OpenAI 兼容接口）
- 桌面端：托盘常驻、关闭窗口最小化、单实例运行、内置后端

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite 5 |
| 后端 | Python 3.10 + FastAPI + SQLite |
| 桌面壳 | Electron 33（加载本地后端托管的前端，与网页端同源） |
| 打包 | PyInstaller（后端 exe）+ electron-builder（NSIS 安装包 / 便携版） |

## 目录结构

```
.
├── 任务管理原型.html                      # 早期交互原型
├── 任务管理原型 · 需求清单（Backlog）.docx  # 需求清单
└── taskflow/
    ├── backend/
    │   ├── app/
    │   │   ├── main.py        # FastAPI 入口，同时托管前端 dist
    │   │   ├── db.py          # SQLite 连接、建表、种子数据
    │   │   ├── store.py       # 数据访问层
    │   │   ├── models.py      # Pydantic 模型
    │   │   └── ai.py          # AI 连通性测试与任务拆分
    │   ├── launcher.py        # PyInstaller 入口
    │   ├── taskflow-backend.spec
    │   └── requirements.txt
    ├── frontend/
    │   ├── src/               # React 源码（App/api/components）
    │   └── vite.config.ts     # base:'./' + /api 代理到 8000
    ├── electron/
    │   ├── main.cjs           # 主进程：窗口、托盘、IPC、启动编排
    │   ├── backend.cjs        # 后端子进程：端口探测、拉起、就绪检测、退出清理
    │   └── preload.cjs        # contextBridge 白名单 API
    └── package.json           # Electron 与打包配置
```

## 快速开始

### 1. 后端

```powershell
cd taskflow/backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

启动后 <http://127.0.0.1:8000> 即可访问（若已构建前端，会自动托管 `frontend/dist`）。

### 2. 网页端开发

```powershell
cd taskflow/frontend
npm install
npm run dev        # http://localhost:5173，/api 代理到 8000
```

### 3. 桌面端

```powershell
cd taskflow
npm install

npm run electron           # 生产模式：加载已构建的前端 dist
npm run electron:dev       # 开发模式：加载 Vite dev server（需先启动 npm run dev）
npm run electron:prod      # 先构建前端再启动
```

## 打包 Windows 可执行文件

```powershell
cd taskflow
npm run dist:win
```

流程：构建前端 → PyInstaller 打包后端 → electron-builder 生成安装包与便携版。

产物位于 `taskflow/release/`：

- `TaskFlow Setup 1.0.0.exe`：NSIS 安装版
- `TaskFlow 1.0.0.exe`：单文件便携版
- `win-unpacked/TaskFlow.exe`：免安装目录版

目标机器无需安装 Python / Node。

## 配置项

| 环境变量 | 作用 | 默认值 |
|---|---|---|
| `TASKFLOW_PYTHON` | 指定 Python 可执行文件 | `python` |
| `TASKFLOW_DB` | SQLite 数据库路径 | 开发期 `backend/data/taskflow.db`；桌面端安装版 `%APPDATA%\taskflow\taskflow.db` |
| `TASKFLOW_PORT` | 后端监听端口 | `8000`（桌面端会自动寻找可用端口） |
| `TASKFLOW_FRONTEND_DIST` | 前端 dist 目录 | 仓库内 `frontend/dist` |

## 数据存储

SQLite 单文件存储，包含 `projects` / `folders` / `tasks` / `settings` 四张表，首次启动自动建表并写入演示数据。

## 说明

- 桌面端后端进程由主进程拉起，退出时按进程树清理；窗口关闭仅最小化到托盘。
- 打包产物未做代码签名，首次运行可能出现 SmartScreen 提示，选择「仍要运行」即可。
