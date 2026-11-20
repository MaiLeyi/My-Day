"""SQLite 存储层：建表、种子数据与连接管理。"""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, date
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
        count = conn.execute("SELECT COUNT(*) AS c FROM projects").fetchone()["c"]
        if count == 0:
            _seed(conn)
        row = conn.execute("SELECT data FROM settings WHERE id = 1").fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO settings (id, data) VALUES (1, ?)",
                (json.dumps(DEFAULT_SETTINGS, ensure_ascii=False),),
            )
        conn.commit()
    finally:
        conn.close()


def _seed(conn: sqlite3.Connection) -> None:
    today = date.today().isoformat()
    # 相对今天的演示数据：今天 / 明天 / 后天 / 下周
    created = now_iso()
    projects = [
        ("p1", "工作", 0),
        ("p2", "个人", 1),
        ("p3", "学习", 2),
    ]
    folders = [
        ("f1", "p1", "需求评审", 0),
        ("f2", "p1", "项目A 开发", 1),
        ("f3", "p2", "生活琐事", 0),
        ("f4", "p3", "技术精进", 0),
    ]
    from datetime import timedelta

    d0 = date.today()
    tasks = [
        ("t1", "需求评审会", "p1", "f1", "todo", "high", d0.isoformat(), "", "10:00", "11:30",
         "对齐项目A范围，输出评审纪要。", "", [], 0),
        ("t2", "接口联调", "p1", "f2", "doing", "mid", d0.isoformat(), "", "14:00", "16:00",
         "与前端确认鉴权字段。", "", [], 1),
        ("t3", "周末采购", "p2", "f3", "todo", "low", (d0 + timedelta(days=2)).isoformat(), "", "09:30", "11:00",
         "猫粮、猫砂、日用品。", "", [], 2),
        ("t4", "阅读《DDD 设计》第4章", "p3", "f4", "done", "mid", (d0 + timedelta(days=1)).isoformat(), "", "20:00", "21:30",
         "沉淀领域模型笔记。", "", [], 3),
        ("t5", "周会汇报", "p1", "f1", "todo", "mid", "", (d0 + timedelta(days=4)).isoformat(), "", "",
         "准备本周进度PPT。", "", [], 4),
        ("t6", "个人网站需求大纲", "p2", "", "todo", "high", "", "", "", "",
         "未排期，先列想法。", "", [], 5),
    ]
    for pid, name, sort in projects:
        conn.execute(
            "INSERT INTO projects (id, name, shade, archived, sort, created_at) VALUES (?,?,?,?,?,?)",
            (pid, name, sort % 3, 0, sort, created),
        )
    for fid, pid, name, sort in folders:
        conn.execute(
            "INSERT INTO folders (id, project_id, name, sort, created_at) VALUES (?,?,?,?,?)",
            (fid, pid, name, sort, created),
        )
    for (tid, title, pid, fid, status, priority, plan, due, start, end, desc, remark, images, sort) in tasks:
        conn.execute(
            """INSERT INTO tasks (id, title, project_id, folder_id, status, priority, plan_date, due_date,
               start_time, end_time, description, remark, images, attachments, sort, created_at, completed_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'[]',?,?,?)""",
            (tid, title, pid, fid, status, priority, plan, due, start, end, desc, remark,
             json.dumps(images), sort, created, created if status == "done" else ""),
        )
