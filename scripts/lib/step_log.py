"""示例脚本分步日志（ADA_STEP_LOG=1 时输出，带毫秒时间戳与 flush）。"""
from __future__ import annotations

import os
import sys
import time

_T0 = time.monotonic()


def enabled() -> bool:
    v = os.environ.get("ADA_STEP_LOG", "").strip().lower()
    return v in ("1", "true", "yes")


def step_log(msg: str) -> None:
    if not enabled():
        return
    ms = int((time.monotonic() - _T0) * 1000)
    print(f"[{ms:6d}ms] {msg}", flush=True)


def log_call(label: str):
    """装饰器：记录函数/调用块起止与耗时。"""
    def decorator(fn):
        def wrapper(*args, **kwargs):
            step_log(f"{label} → start")
            t0 = time.monotonic()
            try:
                out = fn(*args, **kwargs)
                step_log(f"{label} → ok ({int((time.monotonic() - t0) * 1000)}ms)")
                return out
            except Exception as e:
                step_log(f"{label} → fail ({int((time.monotonic() - t0) * 1000)}ms): {e}")
                raise
        return wrapper
    return decorator
