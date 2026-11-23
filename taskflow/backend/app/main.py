"""任务流 · FastAPI 入口。"""
from __future__ import annotations

import os
from datetime import date
from pathlib import Path

from urllib.parse import quote

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from . import ai, store
from .db import init_db
from .models import (
    AiSplitPayload,
    AiTestPayload,
    BatchDeletePayload,
    ExportPayload,
    FolderCreate,
    FolderUpdate,
    MovePayload,
    ProjectCreate,
    ProjectUpdate,
    ReorderPayload,
    SchedulePayload,
    SettingsPayload,
    TaskCreate,
    TaskUpdate,
)

app = FastAPI(title="任务流 API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()
store.gc_orphan_files()

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
MAX_BACKUP_BYTES = 1024 * 1024 * 1024


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.post("/api/files", status_code=201)
async def upload_file(file: UploadFile = File(...)) -> dict:
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "文件过大，单个附件上限 50MB")
    if not content:
        raise HTTPException(400, "文件为空")
    return store.save_upload(file.filename or "未命名文件", content, file.content_type or "")


@app.get("/api/files/{fid}")
def get_file(fid: str, download: int = 0) -> FileResponse:
    row = store.get_file(fid)
    if row is None:
        raise HTTPException(404, "文件不存在或已被清理")
    if download:
        # 中文文件名用 RFC 5987 编码，保证浏览器/桌面端都能正确保存
        return FileResponse(
            row["path"],
            media_type=row["mime"] or "application/octet-stream",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{quote(row['name'])}",
                "Cache-Control": "private, max-age=86400",
            },
        )
    return FileResponse(
        row["path"],
        media_type=row["mime"] or "application/octet-stream",
        headers={"Cache-Control": "private, max-age=86400"},
    )


@app.delete("/api/files/{fid}", status_code=204)
def delete_file(fid: str) -> Response:
    store.delete_file(fid)
    return Response(status_code=204)


@app.get("/api/bootstrap")
def bootstrap() -> dict:
    return store.bootstrap()


@app.get("/api/storage")
def storage() -> dict:
    return store.storage_info()


@app.post("/api/projects", status_code=201)
def create_project(payload: ProjectCreate) -> dict:
    return store.create_project(payload)


@app.patch("/api/projects/{pid}")
def update_project(pid: str, payload: ProjectUpdate) -> dict:
    result = store.update_project(pid, payload)
    if result is None:
        raise HTTPException(404, "项目不存在")
    return result


@app.delete("/api/projects/{pid}", status_code=204)
def delete_project(pid: str) -> Response:
    store.delete_project(pid)
    return Response(status_code=204)


@app.post("/api/folders", status_code=201)
def create_folder(payload: FolderCreate) -> dict:
    return store.create_folder(payload)


@app.patch("/api/folders/{fid}")
def update_folder(fid: str, payload: FolderUpdate) -> dict:
    result = store.update_folder(fid, payload)
    if result is None:
        raise HTTPException(404, "分组不存在")
    return result


@app.delete("/api/folders/{fid}", status_code=204)
def delete_folder(fid: str) -> Response:
    store.delete_folder(fid)
    return Response(status_code=204)


@app.post("/api/tasks", status_code=201)
def create_task(payload: TaskCreate) -> dict:
    try:
        return store.create_task(payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.patch("/api/tasks/{tid}")
def update_task(tid: str, payload: TaskUpdate) -> dict:
    try:
        result = store.update_task(tid, payload)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if result is None:
        raise HTTPException(404, "事项不存在")
    return result


@app.delete("/api/tasks/{tid}", status_code=204)
def delete_task(tid: str) -> Response:
    store.delete_task(tid)
    return Response(status_code=204)


@app.post("/api/tasks/{tid}/move")
def move_task(tid: str, payload: MovePayload) -> dict:
    result = store.move_task(tid, payload.projectId, payload.folderId)
    if result is None:
        raise HTTPException(404, "事项不存在")
    return result


@app.post("/api/tasks/{tid}/schedule")
def schedule_task(tid: str, payload: SchedulePayload) -> dict:
    result = store.update_task(tid, TaskUpdate(planDate=payload.planDate))
    if result is None:
        raise HTTPException(404, "事项不存在")
    return result


@app.post("/api/reorder")
def reorder(payload: ReorderPayload) -> dict:
    return {"ok": store.reorder(payload)}


@app.post("/api/batch/delete")
def batch_delete(payload: BatchDeletePayload) -> dict:
    store.batch_delete(payload)
    return {"ok": True}


@app.post("/api/export")
def export(payload: ExportPayload) -> Response:
    content, media_type, ext = store.export_rows(payload.ids, payload.format)
    filename = f"tasks_{date.today().isoformat()}.{ext}"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/settings")
def get_settings() -> dict:
    return store.load_settings()


@app.put("/api/settings")
def put_settings(payload: SettingsPayload) -> dict:
    return store.save_settings(payload)


@app.get("/api/backup")
def download_backup() -> Response:
    content = store.export_backup()
    filename = f"taskflow_backup_{date.today().isoformat()}.zip"
    return Response(
        content=content,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/import")
async def import_backup(file: UploadFile = File(...)) -> dict:
    content = await file.read()
    if len(content) > MAX_BACKUP_BYTES:
        raise HTTPException(413, "备份文件过大")
    try:
        return store.import_backup(content)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.post("/api/ai/test")
def ai_test(payload: AiTestPayload) -> dict:
    return ai.test_connection(payload.apiKey, payload.baseUrl, payload.model)


@app.post("/api/ai/split")
def ai_split(payload: AiSplitPayload) -> JSONResponse:
    if not payload.desc.strip():
        return JSONResponse({"message": "先输入目标或任务描述"}, status_code=400)
    cfg = store.load_settings()["ai"]
    try:
        candidates = ai.split_tasks(
            cfg.get("apiKey", ""), cfg.get("baseUrl", ""), cfg.get("model", "gpt-4o"),
            payload.desc.strip(),
        )
    except ValueError as exc:
        return JSONResponse({"message": str(exc)}, status_code=400)
    if payload.projectSplit:
        for item in candidates:
            item["folderName"] = item["title"][:12]
    return JSONResponse({"candidates": candidates})


# 桌面端打包后由 Electron 通过 TASKFLOW_FRONTEND_DIST 指定 dist 目录；
# 网页端/开发期沿用仓库内的 frontend/dist。
DIST = Path(
    os.environ.get("TASKFLOW_FRONTEND_DIST")
    or Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
)
if DIST.exists():
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
else:
    @app.get("/")
    def root() -> dict:
        return {"message": "任务流 API 已启动。前端请运行 npm run dev，或先 npm run build 后重启本服务。"}
