"""PyInstaller 入口：以编程方式启动 uvicorn，供桌面端内置后端使用。

桌面端打包后不再依赖本机 Python，本文件是打包进 taskflow-backend.exe 的入口。
运行时通过环境变量接收配置：
  TASKFLOW_HOST           监听地址，默认 127.0.0.1
  TASKFLOW_PORT           监听端口，默认 8000
  TASKFLOW_DB             SQLite 数据库路径，默认 <exe目录>/data/taskflow.db
  TASKFLOW_FRONTEND_DIST  前端 dist 目录，用于静态托管
"""
from __future__ import annotations

import os

import uvicorn

from app.main import app

if __name__ == "__main__":
    host = os.environ.get("TASKFLOW_HOST", "127.0.0.1")
    port = int(os.environ.get("TASKFLOW_PORT", "8000"))
    uvicorn.run(app, host=host, port=port, log_level="info", access_log=False)
