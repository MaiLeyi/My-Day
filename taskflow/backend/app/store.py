"""业务数据访问。"""
from __future__ import annotations

import json
import csv
import io
import re
import secrets
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from .db import connect, now_iso, DEFAULT_SETTINGS, DB_PATH
from .models import (
    TaskCreate,
    TaskUpdate,
    ProjectCreate,
    ProjectUpdate,
    FolderCreate,
    FolderUpdate,
    SettingsPayload,
)

PRIORITY_LABEL = {"high": "高", "mid": "中", "low": "低", "": "无"}
STATUS_LABEL = {"todo": "待办", "doing": "进行中", "done": "已完成"}

# 附件文件统一放在数据库同级的 files 目录，便于整体备份/迁移
FILES_DIR = DB_PATH.parent / "files"
FILE_URL_RE = re.compile(r"/api/files/([A-Za-z0-9_-]+)")


def _uid(prefix: str) -> str:
    return prefix + secrets.token_hex(4)


def _task(row: Any) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "projectId": row["project_id"],
        "folderId": row["folder_id"],
        "status": row["status"],
        "priority": row["priority"],
        "planDate": row["plan_date"],
        "dueDate": row["due_date"],
        "start": row["start_time"],
        "end": row["end_time"],
        "desc": row["description"],
        "remark": row["remark"],
        "images": json.loads(row["images"] or "[]"),
        "attachments": json.loads(row["attachments"] or "[]"),
        "sort": row["sort"],
        "createdAt": row["created_at"],
        "completedAt": row["completed_at"],
    }


def _project(row: Any) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "shade": row["shade"],
        "archived": bool(row["archived"]),
        "sort": row["sort"],
        "createdAt": row["created_at"],
    }


def _folder(row: Any) -> dict:
    return {
        "id": row["id"],
        "projectId": row["project_id"],
        "name": row["name"],
        "sort": row["sort"],
        "createdAt": row["created_at"],
    }


# ---------- 附件文件 ----------
def _file_ids_of(images: Any, attachments: Any) -> set[str]:
    """从图片 URL / 附件元数据中解析出文件 id。"""
    ids: set[str] = set()
    for item in images or []:
        match = FILE_URL_RE.search(str(item))
        if match:
            ids.add(match.group(1))
    for item in attachments or []:
        if isinstance(item, dict):
            if item.get("fileId"):
                ids.add(str(item["fileId"]))
            match = FILE_URL_RE.search(str(item.get("url") or ""))
            if match:
                ids.add(match.group(1))
    return ids


def _file_ids_from_row(row: Any) -> set[str]:
    try:
        images = json.loads(row["images"] or "[]")
    except (json.JSONDecodeError, TypeError):
        images = []
    try:
        attachments = json.loads(row["attachments"] or "[]")
    except (json.JSONDecodeError, TypeError):
        attachments = []
    return _file_ids_of(images, attachments)


def _remove_files(ids: set[str]) -> None:
    if not ids:
        return
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        for fid in ids:
            row = conn.execute("SELECT stored_name FROM files WHERE id = ?", (fid,)).fetchone()
            if row is not None:
                try:
                    (FILES_DIR / row["stored_name"]).unlink(missing_ok=True)
                except OSError:
                    pass
                conn.execute("DELETE FROM files WHERE id = ?", (fid,))
        conn.commit()
    finally:
        conn.close()


def delete_file(fid: str) -> None:
    _remove_files({fid})


def save_upload(filename: str, content: bytes, mime: str) -> dict:
    safe_name = Path(filename or "").name or "未命名文件"
    suffix = Path(safe_name).suffix.lower()
    if not re.fullmatch(r"\.[a-z0-9]{1,10}", suffix):
        suffix = ""
    fid = "u" + secrets.token_hex(8)
    stored_name = fid + suffix
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    (FILES_DIR / stored_name).write_bytes(content)
    conn = connect()
    try:
        conn.execute(
            "INSERT INTO files (id, name, size, mime, stored_name, created_at) VALUES (?,?,?,?,?,?)",
            (fid, safe_name, len(content), mime or "", stored_name, now_iso()),
        )
        conn.commit()
    finally:
        conn.close()
    return {"id": fid, "name": safe_name, "size": len(content), "mime": mime or "", "url": f"/api/files/{fid}"}


def get_file(fid: str) -> dict | None:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM files WHERE id = ?", (fid,)).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    path = FILES_DIR / row["stored_name"]
    if not path.exists():
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "size": row["size"],
        "mime": row["mime"],
        "path": path,
    }


def gc_orphan_files(max_age_seconds: int = 3600) -> int:
    """清理未被任何事项引用、且上传超过 1 小时的孤儿文件。"""
    conn = connect()
    removed = 0
    try:
        referenced: set[str] = set()
        for row in conn.execute("SELECT images, attachments FROM tasks"):
            referenced |= _file_ids_from_row(row)
        now = datetime.now()
        for row in conn.execute("SELECT id, stored_name, created_at FROM files"):
            if row["id"] in referenced:
                continue
            try:
                created = datetime.fromisoformat(str(row["created_at"]).replace(" ", "T"))
            except ValueError:
                created = now
            if (now - created).total_seconds() < max_age_seconds:
                continue
            try:
                (FILES_DIR / row["stored_name"]).unlink(missing_ok=True)
            except OSError:
                pass
            conn.execute("DELETE FROM files WHERE id = ?", (row["id"],))
            removed += 1
        conn.commit()
    finally:
        conn.close()
    return removed


def storage_info() -> dict:
    """当前运行方式与数据落盘位置，供设置页展示。"""
    return {
        "dataDir": str(DB_PATH.parent.resolve()),
        "dbPath": str(DB_PATH.resolve()),
        "filesDir": str(FILES_DIR.resolve()),
        "executable": sys.executable,
        "mode": "packaged" if getattr(sys, "frozen", False) else "source",
    }


def load_settings() -> dict:
    conn = connect()
    try:
        row = conn.execute("SELECT data FROM settings WHERE id = 1").fetchone()
        data = json.loads(row["data"]) if row else {}
    finally:
        conn.close()
    merged = json.loads(json.dumps(DEFAULT_SETTINGS))
    if data:
        merged["ai"].update(data.get("ai") or {})
        merged["defaultView"] = data.get("defaultView", merged["defaultView"])
        merged["theme"] = data.get("theme", merged["theme"])
    return merged


def save_settings(payload: SettingsPayload) -> dict:
    data = payload.model_dump()
    conn = connect()
    try:
        conn.execute(
            "INSERT INTO settings (id, data) VALUES (1, ?) "
            "ON CONFLICT(id) DO UPDATE SET data = excluded.data",
            (json.dumps(data, ensure_ascii=False),),
        )
        conn.commit()
    finally:
        conn.close()
    return data


def bootstrap() -> dict:
    conn = connect()
    try:
        projects = [_project(r) for r in conn.execute("SELECT * FROM projects ORDER BY sort, created_at")]
        folders = [_folder(r) for r in conn.execute("SELECT * FROM folders ORDER BY sort, created_at")]
        tasks = [_task(r) for r in conn.execute("SELECT * FROM tasks ORDER BY sort, created_at")]
    finally:
        conn.close()
    return {"projects": projects, "folders": folders, "tasks": tasks, "settings": load_settings()}


# ---------- 项目 ----------
def create_project(payload: ProjectCreate) -> dict:
    conn = connect()
    try:
        sort = conn.execute("SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM projects").fetchone()["s"]
        pid = _uid("p")
        conn.execute(
            "INSERT INTO projects (id, name, shade, archived, sort, created_at) VALUES (?,?,?,?,?,?)",
            (pid, payload.name.strip() or "未命名项目", sort % 3, 0, sort, now_iso()),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (pid,)).fetchone()
        return _project(row)
    finally:
        conn.close()


def update_project(pid: str, payload: ProjectUpdate) -> dict | None:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (pid,)).fetchone()
        if row is None:
            return None
        name = payload.name.strip() if payload.name is not None else row["name"]
        archived = int(payload.archived) if payload.archived is not None else row["archived"]
        conn.execute("UPDATE projects SET name = ?, archived = ? WHERE id = ?", (name, archived, pid))
        conn.commit()
        return _project(conn.execute("SELECT * FROM projects WHERE id = ?", (pid,)).fetchone())
    finally:
        conn.close()


def delete_project(pid: str) -> None:
    conn = connect()
    try:
        files: set[str] = set()
        for row in conn.execute("SELECT images, attachments FROM tasks WHERE project_id = ?", (pid,)):
            files |= _file_ids_from_row(row)
        conn.execute("DELETE FROM folders WHERE project_id = ?", (pid,))
        conn.execute("DELETE FROM tasks WHERE project_id = ?", (pid,))
        conn.execute("DELETE FROM projects WHERE id = ?", (pid,))
        conn.commit()
    finally:
        conn.close()
    _remove_files(files)


# ---------- 分组 ----------
def create_folder(payload: FolderCreate) -> dict:
    conn = connect()
    try:
        sort = conn.execute("SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM folders").fetchone()["s"]
        fid = _uid("f")
        conn.execute(
            "INSERT INTO folders (id, project_id, name, sort, created_at) VALUES (?,?,?,?,?)",
            (fid, payload.projectId, payload.name.strip() or "未命名分组", sort, now_iso()),
        )
        conn.commit()
        return _folder(conn.execute("SELECT * FROM folders WHERE id = ?", (fid,)).fetchone())
    finally:
        conn.close()


def update_folder(fid: str, payload: FolderUpdate) -> dict | None:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM folders WHERE id = ?", (fid,)).fetchone()
        if row is None:
            return None
        name = payload.name.strip() if payload.name is not None else row["name"]
        project_id = payload.projectId if payload.projectId is not None else row["project_id"]
        conn.execute("UPDATE folders SET name = ?, project_id = ? WHERE id = ?", (name, project_id, fid))
        conn.commit()
        return _folder(conn.execute("SELECT * FROM folders WHERE id = ?", (fid,)).fetchone())
    finally:
        conn.close()


def delete_folder(fid: str) -> None:
    conn = connect()
    try:
        conn.execute("UPDATE tasks SET folder_id = '' WHERE folder_id = ?", (fid,))
        conn.execute("DELETE FROM folders WHERE id = ?", (fid,))
        conn.commit()
    finally:
        conn.close()


# ---------- 事项 ----------
def create_task(payload: TaskCreate) -> dict:
    conn = connect()
    try:
        sort = conn.execute("SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM tasks").fetchone()["s"]
        tid = _uid("t")
        created = now_iso()
        completed = created if payload.status == "done" else ""
        conn.execute(
            """INSERT INTO tasks (id, title, project_id, folder_id, status, priority, plan_date, due_date,
               start_time, end_time, description, remark, images, attachments, sort, created_at, completed_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                tid, payload.title.strip() or "未命名事项", payload.projectId, payload.folderId,
                payload.status, payload.priority, payload.planDate, payload.dueDate,
                payload.start, payload.end, payload.desc, payload.remark,
                json.dumps(payload.images, ensure_ascii=False),
                json.dumps([a.model_dump() for a in payload.attachments], ensure_ascii=False),
                sort, created, completed,
            ),
        )
        conn.commit()
        return _task(conn.execute("SELECT * FROM tasks WHERE id = ?", (tid,)).fetchone())
    finally:
        conn.close()


def update_task(tid: str, payload: TaskUpdate) -> dict | None:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (tid,)).fetchone()
        if row is None:
            return None
        patch = payload.model_dump(exclude_unset=True)
        mapping = {
            "projectId": "project_id",
            "folderId": "folder_id",
            "planDate": "plan_date",
            "dueDate": "due_date",
            "start": "start_time",
            "end": "end_time",
            "desc": "description",
        }
        sets: list[str] = []
        values: list[Any] = []
        for key, value in patch.items():
            if key in ("images", "attachments"):
                value = json.dumps(value, ensure_ascii=False)
            elif key == "title":
                value = (value or "").strip() or "未命名事项"
            sets.append(f"{mapping.get(key, key)} = ?")
            values.append(value)
        old_status = row["status"]
        new_status = patch.get("status", old_status)
        if new_status == "done" and old_status != "done":
            sets.append("completed_at = ?")
            values.append(now_iso())
        elif new_status != "done" and old_status == "done":
            sets.append("completed_at = ''")
        if sets:
            values.append(tid)
            conn.execute(f"UPDATE tasks SET {', '.join(sets)} WHERE id = ?", values)
            conn.commit()
        new_row = conn.execute("SELECT * FROM tasks WHERE id = ?", (tid,)).fetchone()
        result = _task(new_row)
        removed = _file_ids_from_row(row) - _file_ids_from_row(new_row)
    finally:
        conn.close()
    _remove_files(removed)
    return result


def delete_task(tid: str) -> None:
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (tid,)).fetchone()
        files = _file_ids_from_row(row) if row is not None else set()
        conn.execute("DELETE FROM tasks WHERE id = ?", (tid,))
        conn.commit()
    finally:
        conn.close()
    _remove_files(files)


def move_task(tid: str, project_id: str, folder_id: str) -> dict | None:
    return update_task(tid, TaskUpdate(projectId=project_id, folderId=folder_id))


def reorder(payload) -> bool:
    table = {"project": "projects", "folder": "folders", "task": "tasks"}[payload.kind]
    conn = connect()
    try:
        rows = conn.execute(f"SELECT id FROM {table} ORDER BY sort, created_at").fetchall()
        ids = [r["id"] for r in rows]
        if payload.id not in ids or payload.targetId not in ids or payload.id == payload.targetId:
            return False
        if payload.kind == "task":
            src = conn.execute("SELECT * FROM tasks WHERE id = ?", (payload.id,)).fetchone()
            tgt = conn.execute("SELECT * FROM tasks WHERE id = ?", (payload.targetId,)).fetchone()
            if src and tgt:
                conn.execute(
                    "UPDATE tasks SET project_id = ?, folder_id = ? WHERE id = ?",
                    (tgt["project_id"], tgt["folder_id"], payload.id),
                )
        if payload.kind == "folder":
            src = conn.execute("SELECT * FROM folders WHERE id = ?", (payload.id,)).fetchone()
            tgt = conn.execute("SELECT * FROM folders WHERE id = ?", (payload.targetId,)).fetchone()
            if src and tgt and src["project_id"] != tgt["project_id"]:
                conn.execute(
                    "UPDATE folders SET project_id = ? WHERE id = ?", (tgt["project_id"], payload.id)
                )
        ids.remove(payload.id)
        idx = ids.index(payload.targetId)
        ids.insert(idx, payload.id)
        for i, _id in enumerate(ids):
            conn.execute(f"UPDATE {table} SET sort = ? WHERE id = ?", (i, _id))
        conn.commit()
        return True
    finally:
        conn.close()


def batch_delete(payload) -> None:
    conn = connect()
    files: set[str] = set()
    try:
        for pid in payload.projectIds:
            for row in conn.execute("SELECT images, attachments FROM tasks WHERE project_id = ?", (pid,)):
                files |= _file_ids_from_row(row)
            conn.execute("DELETE FROM folders WHERE project_id = ?", (pid,))
            conn.execute("DELETE FROM tasks WHERE project_id = ?", (pid,))
            conn.execute("DELETE FROM projects WHERE id = ?", (pid,))
        for fid in payload.folderIds:
            conn.execute("UPDATE tasks SET folder_id = '' WHERE folder_id = ?", (fid,))
            conn.execute("DELETE FROM folders WHERE id = ?", (fid,))
        for tid in payload.taskIds:
            row = conn.execute("SELECT * FROM tasks WHERE id = ?", (tid,)).fetchone()
            if row is not None:
                files |= _file_ids_from_row(row)
            conn.execute("DELETE FROM tasks WHERE id = ?", (tid,))
        conn.commit()
    finally:
        conn.close()
    _remove_files(files)


def export_rows(ids: list[str], fmt: str) -> tuple[bytes, str, str]:
    conn = connect()
    try:
        if ids:
            marks = ",".join("?" for _ in ids)
            rows = conn.execute(f"SELECT * FROM tasks WHERE id IN ({marks}) ORDER BY sort", ids).fetchall()
        else:
            rows = conn.execute("SELECT * FROM tasks ORDER BY sort").fetchall()
        projects = {r["id"]: r["name"] for r in conn.execute("SELECT id, name FROM projects")}
        folders = {r["id"]: r["name"] for r in conn.execute("SELECT id, name FROM folders")}
    finally:
        conn.close()
    items = []
    for r in rows:
        items.append(
            {
                "标题": r["title"],
                "状态": STATUS_LABEL.get(r["status"], r["status"]),
                "优先级": PRIORITY_LABEL.get(r["priority"], "无"),
                "项目": projects.get(r["project_id"], ""),
                "分类": folders.get(r["folder_id"], ""),
                "计划日": r["plan_date"],
                "截止日": r["due_date"],
                "开始": r["start_time"],
                "结束": r["end_time"],
                "描述": r["description"],
                "备注": r["remark"],
                "附件": ", ".join(a.get("name", "") for a in json.loads(r["attachments"] or "[]")),
            }
        )
    if fmt == "csv":
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=list(items[0].keys()) if items else [
            "标题", "状态", "优先级", "项目", "分类", "计划日", "截止日", "开始", "结束", "描述", "备注", "附件"
        ])
        writer.writeheader()
        writer.writerows(items)
        return ("\ufeff" + buf.getvalue()).encode("utf-8"), "text/csv; charset=utf-8", "csv"
    return json.dumps(items, ensure_ascii=False, indent=2).encode("utf-8"), "application/json; charset=utf-8", "json"
