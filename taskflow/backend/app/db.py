"""SQLite 存储层：建表、种子数据与连接管理。"""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("TASKFLOW_DB", BASE_DIR / "data" / "taskflow.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  shade INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  project_id TEXT NOT NULL DEFAULT '',
  folder_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT '',
  plan_date TEXT NOT NULL DEFAULT '',
  due_date TEXT NOT NULL DEFAULT '',
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  remark TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]',
  attachments TEXT NOT NULL DEFAULT '[]',
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  mime TEXT NOT NULL DEFAULT '',
  stored_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL
);
"""

DEFAULT_SETTINGS = {
    "ai": {"apiKey": "", "baseUrl": "", "model": "gpt-4o"},
    "defaultView": "list",
    "theme": "soft",
}


def now_iso() -> str:
    return datetime.now().replace(microsecond=0).isoformat(sep=" ")


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        # 状态由三态（todo/doing/done）收敛为两态（todo/done），历史“进行中”归为未处理
        conn.execute("UPDATE tasks SET status = 'todo' WHERE status NOT IN ('todo', 'done')")
        _purge_legacy_seed(conn)
        row = conn.execute("SELECT data FROM settings WHERE id = 1").fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO settings (id, data) VALUES (1, ?)",
                (json.dumps(DEFAULT_SETTINGS, ensure_ascii=False),),
            )
        conn.commit()
    finally:
        conn.close()


# 旧版本内置的演示数据 id（不再写入；升级时清理掉，避免用户看到自带数据）
LEGACY_SEED_IDS = {
    "projects": ("p1", "p2", "p3"),
    "folders": ("f1", "f2", "f3", "f4"),
    "tasks": ("t1", "t2", "t3", "t4", "t5", "t6"),
}


def _purge_legacy_seed(conn: sqlite3.Connection) -> None:
    """删除旧版本写入的演示数据；若用户曾在演示项目下新建过内容则保留容器。"""
    marks = ",".join("?" for _ in LEGACY_SEED_IDS["tasks"])
    conn.execute(f"DELETE FROM tasks WHERE id IN ({marks})", LEGACY_SEED_IDS["tasks"])
    for fid in LEGACY_SEED_IDS["folders"]:
        left = conn.execute("SELECT COUNT(*) AS c FROM tasks WHERE folder_id = ?", (fid,)).fetchone()["c"]
        if left == 0:
            conn.execute("DELETE FROM folders WHERE id = ?", (fid,))
    for pid in LEGACY_SEED_IDS["projects"]:
        tasks_left = conn.execute(
            "SELECT COUNT(*) AS c FROM tasks WHERE project_id = ?", (pid,)
        ).fetchone()["c"]
        folders_left = conn.execute(
            "SELECT COUNT(*) AS c FROM folders WHERE project_id = ?", (pid,)
        ).fetchone()["c"]
        if tasks_left == 0 and folders_left == 0:
            conn.execute("DELETE FROM projects WHERE id = ?", (pid,))
