# -*- mode: python ; coding: utf-8 -*-
# PyInstaller 打包配置：把 FastAPI 后端打成独立的 taskflow-backend 目录（含 exe）。
import os

from PyInstaller.utils.hooks import collect_all

HERE = os.path.abspath(SPECPATH)

datas, binaries, hiddenimports = [], [], []
for pkg in ("uvicorn", "fastapi", "starlette", "pydantic", "anyio"):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

a = Analysis(
    [os.path.join(HERE, "launcher.py")],
    pathex=[HERE],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports
    + [
        "app",
        "app.main",
        "app.store",
        "app.db",
        "app.models",
        "app.ai",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",
        "pytest",
        "unittest",
        "pydoc",
        # 本项目不使用 WebSocket，排除 websockets 以规避 PyInstaller 在
        # Python 3.10.0 下扫描其字节码时的 IndexError
        "websockets",
        "wsproto",
        "watchfiles",
    ],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="taskflow-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="taskflow-backend",
)
