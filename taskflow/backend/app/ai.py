"""AI 能力：OpenAI 兼容接口的连通性测试与任务拆分。"""
from __future__ import annotations

import json
import re
from datetime import date

import httpx


def _endpoint(base_url: str) -> str:
    base = (base_url or "https://api.openai.com/v1").strip().rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    return base + "/chat/completions"


def _headers(api_key: str) -> dict:
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


def test_connection(api_key: str, base_url: str, model: str) -> dict:
    if not api_key:
        return {"ok": False, "message": "请先填写 API Key"}
    body = {
        "model": model or "gpt-4o",
        "messages": [{"role": "user", "content": "ping"}],
        "max_tokens": 8,
    }
    try:
        resp = httpx.post(
            _endpoint(base_url), headers=_headers(api_key), json=body, timeout=20.0
        )
    except httpx.HTTPError as exc:
        return {"ok": False, "message": f"无法连接服务：{exc}"}
    if resp.status_code == 200:
        return {"ok": True, "message": "连接成功，模型可用"}
    detail = resp.text[:200]
    return {"ok": False, "message": f"接口返回 {resp.status_code}：{detail}"}


SPLIT_SYSTEM = (
    "你是任务拆解助手。把用户给出的目标拆成 3-8 条可执行事项，"
    "只输出 JSON 数组，不要代码块、不要解释。每项格式："
    '{"title":"事项标题（20字内）","priority":"high|mid|low","planDate":"YYYY-MM-DD 或空字符串"}。'
    "priority 依据重要紧急程度判断；planDate 参考今天的日期合理安排。"
)


def split_tasks(api_key: str, base_url: str, model: str, desc: str, today: str | None = None) -> list[dict]:
    if not api_key:
        raise ValueError("未配置 API Key")
    today = today or date.today().isoformat()
    body = {
        "model": model or "gpt-4o",
        "messages": [
            {"role": "system", "content": SPLIT_SYSTEM},
            {"role": "user", "content": f"今天是 {today}。目标：{desc}"},
        ],
        "temperature": 0.3,
    }
    resp = httpx.post(_endpoint(base_url), headers=_headers(api_key), json=body, timeout=60.0)
    if resp.status_code != 200:
        raise ValueError(f"AI 接口返回 {resp.status_code}：{resp.text[:200]}")
    content = resp.json()["choices"][0]["message"]["content"] or ""
    return _parse_candidates(content)


def _parse_candidates(content: str) -> list[dict]:
    text = content.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("AI 返回格式无法解析，请重试")
    try:
        raw = json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ValueError(f"AI 返回格式无法解析：{exc}") from exc
    result = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        priority = item.get("priority")
        if priority not in ("high", "mid", "low"):
            priority = ""
        plan = str(item.get("planDate") or "").strip()
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", plan):
            plan = ""
        result.append({"title": title[:40], "priority": priority, "planDate": plan})
    if not result:
        raise ValueError("AI 未返回有效事项")
    return result[:10]
