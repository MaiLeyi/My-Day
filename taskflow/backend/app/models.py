"""请求 / 响应模型。"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Status = Literal["todo", "doing", "done"]
Priority = Literal["", "high", "mid", "low"]


class Attachment(BaseModel):
    name: str
    size: int = 0
    fileId: str = ""
    url: str = ""
    mime: str = ""


class TaskBase(BaseModel):
    title: str = "未命名事项"
    projectId: str = ""
    folderId: str = ""
    status: Status = "todo"
    priority: Priority = ""
    planDate: str = ""
    dueDate: str = ""
    start: str = ""
    end: str = ""
    desc: str = ""
    remark: str = ""
    images: list[str] = Field(default_factory=list)
    attachments: list[Attachment] = Field(default_factory=list)


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    projectId: Optional[str] = None
    folderId: Optional[str] = None
    status: Optional[Status] = None
    priority: Optional[Priority] = None
    planDate: Optional[str] = None
    dueDate: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None
    desc: Optional[str] = None
    remark: Optional[str] = None
    images: Optional[list[str]] = None
    attachments: Optional[list[Attachment]] = None


class ProjectCreate(BaseModel):
    name: str


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    archived: Optional[bool] = None


class FolderCreate(BaseModel):
    projectId: str
    name: str


class FolderUpdate(BaseModel):
    name: Optional[str] = None
    projectId: Optional[str] = None


class MovePayload(BaseModel):
    projectId: str
    folderId: str = ""


class SchedulePayload(BaseModel):
    planDate: str


class ReorderPayload(BaseModel):
    kind: Literal["project", "folder", "task"]
    id: str
    targetId: str


class BatchDeletePayload(BaseModel):
    projectIds: list[str] = Field(default_factory=list)
    folderIds: list[str] = Field(default_factory=list)
    taskIds: list[str] = Field(default_factory=list)


class ExportPayload(BaseModel):
    ids: list[str] = Field(default_factory=list)
    format: Literal["csv", "json"] = "json"


class AiConfig(BaseModel):
    apiKey: str = ""
    baseUrl: str = ""
    model: str = "gpt-4o"


class SettingsPayload(BaseModel):
    ai: AiConfig = Field(default_factory=AiConfig)
    defaultView: Literal["list", "month", "week", "day"] = "list"
    theme: Literal["soft", "warm", "blue", "dark"] = "soft"


class AiTestPayload(BaseModel):
    apiKey: str = ""
    baseUrl: str = ""
    model: str = "gpt-4o"


class AiSplitPayload(BaseModel):
    desc: str = ""
    projectId: str = ""
    folderId: str = ""
    projectSplit: bool = False


class AiCandidate(BaseModel):
    title: str
    priority: Priority = ""
    planDate: str = ""
    folderName: str = ""
