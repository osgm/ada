"""
ADA 示例统一入口（Python）— 与 scripts/lib/ada-client.mjs 对应（API 并集）。

示例::

    from ada_client import init, open, browser, device, by, wait, step_log, exit
    init(__file__)

顶层导出（snake_case ↔ Node camelCase）::

    init
    exit                    exit（结束执行器 + 进程）
    is_keep_alive           isKeepAlive
    set_keep_alive          setKeepAlive
    ada / ada_recipe / ada_close / must_ok
    wait            wait  （毫秒）
    dir / read_text / write_text / read_json / write_json
    open / browser / device / web / android / harmony / ios / by
    dismiss_web_popups      dismissWebPopups
    dismiss_mobile_popups   dismissMobilePopups
    normalize_dismiss_opts    normalizeDismissOpts
    DEFAULT_DISMISS_TIMEOUT_MS
    SWIPE_DURATION_MS
    read_device             readDevice
    connect_mcp             connectMcp
    parse_mcp_tool_result   parseMcpToolResult
    step_log                stepLog
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
import atexit
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from mobile_kill_result import (
    build_kill_all_apps_result,
    harmony_force_stop_ok,
    parse_harmony_running_bundles,
)
from mobile_phone_api import back_times, goto_target, is_app_bundle_id
from mobile_device_api import attach_device_admin
from fill_search_options import fill_search_payload_from_arg
from popups import (
    DEFAULT_DISMISS_TIMEOUT_MS,
    dismiss_mobile_popups,
    dismiss_web_popups,
    normalize_dismiss_opts,
)
from read_device import read_device
from step_log import step_log
from pinch_coords import parse_pinch_options, resolve_pinch_gesture
from swipe_coords import resolve_swipe_endpoints
from swipe_duration import SWIPE_DURATION_MS, parse_swipe_options

_keep_alive = False

REPO_ROOT = Path(__file__).resolve().parents[2]


def _apply_repo_root(repo: Path) -> None:
    os.chdir(repo)
    tools = repo / "tools"
    if tools.is_dir():
        sep = os.pathsep
        path_key = "Path" if sys.platform == "win32" else "PATH"
        prev = os.environ.get(path_key, "")
        tools_s = str(tools)
        if tools_s not in prev.split(sep):
            os.environ[path_key] = f"{tools_s}{sep}{prev}" if prev else tools_s
        os.environ.setdefault("ADA_TOOLS_DIR", tools_s)


def init(example_or_root: str | Path | None = None) -> Path:
    """初始化示例运行环境（与 Node init 对应）。

    示例脚本传 ``init(__file__)``：切仓库根、注入 ``scripts/lib`` 与 tools PATH、UTF-8 等。
    也可传仓库根目录，或省略（使用本模块推导的 REPO_ROOT）。
    """
    if example_or_root is None:
        repo = REPO_ROOT.resolve()
    else:
        path = Path(example_or_root).resolve()
        if path.suffix == ".py" and path.is_file():
            repo = path.parents[4]
            lib_s = str(repo / "scripts" / "lib")
            if lib_s not in sys.path:
                sys.path.insert(0, lib_s)
        else:
            repo = path
    _apply_repo_root(repo)
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    os.environ.setdefault("PYTHONUTF8", "1")
    os.environ.setdefault("ADA_STEP_LOG", "1")
    if sys.platform == "win32":
        os.system("chcp 65001 >nul")
    step_log(f"init ok repo={repo}")
    return repo


def exit(code: int | None = None) -> None:
    """结束脚本：释放 MCP/本地连接后退出当前进程；不关 Host 侧 MCP Server。"""
    if is_keep_alive() or os.environ.get("ADA_NO_HARD_EXIT", "").strip() == "1":
        return
    try:
        from ada_mcp import release_mcp_transport

        release_mcp_transport()
    except Exception:
        pass
    _shutdown_runtime()
    sys.exit(0 if code is None else code)


def is_keep_alive() -> bool:
    """是否保持 ADA 会话（不自动 quit）。"""
    v = os.environ.get("ADA_KEEP_ALIVE", "").strip().lower()
    return _keep_alive or v in ("1", "true", "yes")


def set_keep_alive(value: bool = True) -> None:
    """显式保持或恢复自动 quit（browser/device 传 keep_alive=True 时会设为 True）。"""
    global _keep_alive
    _keep_alive = bool(value)


def _configure_stdio_utf8() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            if hasattr(stream, "reconfigure"):
                stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


_configure_stdio_utf8()
ROOT = REPO_ROOT  # 兼容旧名
RUNNER = Path(__file__).resolve().parent / "run-command.mjs"
RUNNER_BRIDGE = Path(__file__).resolve().parent / "run-command-bridge.mjs"


def dir(path: str | Path) -> Path:
    """递归创建目录（已存在不报错）；相对路径基于仓库根"""
    p = Path(path)
    if not p.is_absolute():
        p = REPO_ROOT / p
    p.mkdir(parents=True, exist_ok=True)
    return p


def read_text(path: str | Path, encoding: str = "utf-8") -> str:
    p = Path(path)
    if not p.is_absolute():
        p = REPO_ROOT / p
    return p.read_text(encoding=encoding)


def write_text(path: str | Path, text: str, encoding: str = "utf-8") -> None:
    p = Path(path)
    if not p.is_absolute():
        p = REPO_ROOT / p
    dir(p.parent)
    p.write_text(text, encoding=encoding)


def read_json(path: str | Path) -> Any:
    return json.loads(read_text(path))


def write_json(path: str | Path, data: Any, indent: int = 2) -> None:
    write_text(path, json.dumps(data, ensure_ascii=False, indent=indent) + "\n")


def _fill_search_payload(hints_or_opts: str | list[str] | dict[str, Any] | None) -> dict[str, Any]:
    return fill_search_payload_from_arg(hints_or_opts)


# MCP 适配层别名（ada_mcp_adapters.py）
_ui_for_search = _fill_search_payload


def _resolve_session(
    platform: str,
    session_id_or_base: str | dict[str, Any] | None = None,
    base: dict[str, Any] | None = None,
) -> tuple[str, dict[str, Any]]:
    """会话 ID 可省略；空字符串视为未指定。配置对象里也可写 sessionId。"""
    auto = f"{platform}-{int(time.time() * 1000)}"

    if base is not None:
        cfg = dict(base)
        if isinstance(session_id_or_base, str) and session_id_or_base.strip():
            return session_id_or_base.strip(), cfg
        raw = cfg.pop("sessionId", None) or cfg.pop("session_id", None)
        if raw and str(raw).strip():
            return str(raw).strip(), cfg
        return auto, cfg

    if isinstance(session_id_or_base, dict):
        cfg = dict(session_id_or_base)
        raw = cfg.pop("sessionId", None) or cfg.pop("session_id", None)
        sid = str(raw).strip() if raw else auto
        return sid, cfg

    if isinstance(session_id_or_base, str) and session_id_or_base.strip():
        return session_id_or_base.strip(), {}

    return auto, {}


# —— 底层 RPC ——


def _runner_argv() -> list[str]:
    npx = shutil.which("npx") or (shutil.which("npx.cmd") if sys.platform == "win32" else None)
    if not npx:
        raise RuntimeError("未找到 npx，请安装 Node.js 并将 npm 加入 PATH")
    return [npx, "tsx", str(RUNNER)]


def _runner_bridge_argv() -> list[str]:
    npx = shutil.which("npx") or (shutil.which("npx.cmd") if sys.platform == "win32" else None)
    if not npx:
        raise RuntimeError("未找到 npx，请安装 Node.js 并将 npm 加入 PATH")
    return [npx, "tsx", str(RUNNER_BRIDGE)]


class _LocalRunnerConnection:
    def __init__(self, proc: subprocess.Popen[str]):
        self._proc = proc
        self._id = 0

    def request(self, body: dict[str, Any]) -> dict[str, Any]:
        self._id += 1
        req = {**body, "id": self._id}
        assert self._proc.stdin is not None
        assert self._proc.stdout is not None
        self._proc.stdin.write(json.dumps(req, ensure_ascii=False) + "\n")
        self._proc.stdin.flush()
        while True:
            line = self._proc.stdout.readline()
            if not line:
                raise RuntimeError("local run-command bridge closed unexpectedly")
            stripped = line.strip()
            if not stripped.startswith("{"):
                continue
            resp = json.loads(stripped)
            if resp.get("id") != self._id:
                continue
            if resp.get("ok") is False:
                raise RuntimeError(resp.get("error") or "local bridge request failed")
            data = resp.get("data")
            return data if isinstance(data, dict) else {}

    def close(self) -> None:
        try:
            self.request({"op": "shutdown"})
        except Exception:
            pass
        try:
            if self._proc.stdin:
                self._proc.stdin.close()
        except Exception:
            pass
        self._proc.terminate()
        try:
            self._proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self._proc.kill()


_LOCAL_RUNNER: _LocalRunnerConnection | None = None


def _start_stderr_drain(proc: subprocess.Popen[str]) -> None:
    if not proc.stderr:
        return

    def drain() -> None:
        try:
            for _ in proc.stderr:
                pass
        except Exception:
            pass

    threading.Thread(target=drain, daemon=True).start()


def _ensure_local_runner() -> _LocalRunnerConnection:
    global _LOCAL_RUNNER
    if _LOCAL_RUNNER is not None:
        return _LOCAL_RUNNER
    proc = subprocess.Popen(
        _runner_bridge_argv(),
        cwd=str(REPO_ROOT),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
        env=os.environ.copy(),
    )
    _start_stderr_drain(proc)
    _LOCAL_RUNNER = _LocalRunnerConnection(proc)
    return _LOCAL_RUNNER


def _close_local_runner() -> None:
    global _LOCAL_RUNNER
    if _LOCAL_RUNNER is None:
        return
    _LOCAL_RUNNER.close()
    _LOCAL_RUNNER = None


def _shutdown_runtime(*, force: bool = False) -> None:
    """关闭本地 bridge 与子进程（进程退出前由 exit() / atexit 调用）。"""
    if is_keep_alive() and not force:
        return
    _close_local_runner()


def _atexit_cleanup() -> None:
    _shutdown_runtime()


atexit.register(_atexit_cleanup)


def _call(body: dict) -> dict:
    op = body.get("op", "?")
    cmd = body.get("command") or body.get("platform", "")
    step_log(f"local-bridge op={op} command={cmd}")
    t0 = time.monotonic()
    try:
        # 优先走长连接 bridge，显著减少每条命令的进程启动开销
        try:
            conn = _ensure_local_runner()
            out = conn.request(body)
        except Exception:
            proc = subprocess.run(
                _runner_argv(),
                input=json.dumps(body),
                text=True,
                encoding="utf-8",
                errors="replace",
                capture_output=True,
                cwd=str(REPO_ROOT),
                env=os.environ.copy(),
            )
            if proc.returncode != 0:
                raise RuntimeError(proc.stderr or proc.stdout or "run-command failed")
            out = json.loads(proc.stdout.strip() or "{}")
        step_log(
            f"local-bridge op={op} command={cmd} → ok "
            f"({int((time.monotonic() - t0) * 1000)}ms) success={out.get('success')}"
        )
        return out
    except Exception as e:
        step_log(
            f"local-bridge op={op} command={cmd} → fail "
            f"({int((time.monotonic() - t0) * 1000)}ms): {e}"
        )
        raise


def ada(platform: str, session_id: str, command: str, payload: dict | None = None) -> dict:
    return _call(
        {"op": "run", "platform": platform, "sessionId": session_id, "command": command, "payload": payload or {}}
    )


def ada_recipe(platform: str, session_id: str, action: str, base: dict, text: str = "") -> dict:
    return _call(
        {
            "op": "recipe",
            "platform": platform,
            "sessionId": session_id,
            "command": action,
            "base": base,
            "payload": {"text": text},
        }
    )


def ada_close(platform: str, session_id: str, base: dict | None = None) -> None:
    _call({"op": "close", "platform": platform, "sessionId": session_id, "base": base or {}})


def must_ok(result: dict, step: str) -> dict:
    if not result.get("success"):
        data = result.get("data") or {}
        recipe = data.get("recipe") or {}
        code = result.get("errorCode") or recipe.get("errorCode") or "FAIL"
        msg = result.get("errorMessage") or recipe.get("detail") or ""
        raise RuntimeError(f"{step}: {code} {msg}".strip())
    return result


def wait(ms: float) -> None:
    """脚本级强制等待（毫秒）；操作已有 auto-wait，一般不必调用。"""
    time.sleep(max(0.0, float(ms)) / 1000.0)


DEFAULT_ACTION_WAIT_MS = 20_000


def _resolve_action_wait_ms(
    *,
    timeout_ms: int | None = None,
    action_wait_ms: int | None = None,
    extra: dict[str, Any] | None = None,
) -> int:
    """操作级 auto-wait 超时（毫秒），写入 payload waitTimeoutMs。"""
    raw = timeout_ms if timeout_ms is not None else action_wait_ms
    if raw is None and extra:
        raw = extra.get("timeoutMs") or extra.get("timeout_ms") or extra.get("actionWaitMs") or extra.get(
            "action_wait_ms"
        )
    if raw is not None and isinstance(raw, (int, float)):
        return int(raw)
    return DEFAULT_ACTION_WAIT_MS


_WEB_BROWSER_TYPES = frozenset(
    {"chrome", "chromium", "msedge", "microsoft-edge", "edge", "firefox", "webkit"}
)


def _is_web_browser_type(platform: str) -> bool:
    return platform.lower() in _WEB_BROWSER_TYPES


def browser(
    *,
    type: str = "chrome",
    cdp: bool | int | None = None,
    profile: str | Path | None = None,
    timeout_ms: int | None = None,
    action_wait_ms: int | None = None,
    **extra: Any,
) -> dict[str, Any]:
    """Web 浏览器会话选项（传给 open / web）。

    type: chrome | chromium | msedge 等；cdp: True 或端口号；profile: 用户数据目录。
    timeout_ms / action_wait_ms: 操作 auto-wait 超时，默认 20000ms。
    """
    session_id = extra.pop("sessionId", None) or extra.pop("session_id", None)
    keep_alive = extra.pop("keepAlive", None)
    if keep_alive is None:
        keep_alive = extra.pop("keep_alive", None)
    if keep_alive is True:
        set_keep_alive(True)
    wait_ms = _resolve_action_wait_ms(timeout_ms=timeout_ms, action_wait_ms=action_wait_ms, extra=extra)
    opts: dict[str, Any] = {"_openKind": "browser", "channel": type, "waitTimeoutMs": wait_ms, **extra}
    if session_id:
        opts["sessionId"] = session_id
    if profile is not None:
        opts["userDataDir"] = str(Path(profile).resolve())
    if cdp is not None and cdp is not False:
        opts["cdpAutoLaunch"] = True
        opts["cdpPort"] = (
            int(cdp)
            if isinstance(cdp, int)
            else int(os.environ.get("ADA_PLAYWRIGHT_CDP_PORT", "9222"))
        )
    return opts


def device(
    *,
    type: str = "harmony",
    device_id: str | None = None,
    session_id: str | None = None,
    real: bool | None = None,
    app_id: str | None = None,
    ability_id: str | None = None,
    timeout_ms: int | None = None,
    action_wait_ms: int | None = None,
    **extra: Any,
) -> dict[str, Any]:
    """移动或 Web 会话选项（传给 open(device(...))）。

    type: android | harmony | ios；Web 为 chrome | chromium | msedge | firefox | webkit（与 browser() 等价）。
    默认真机执行；open 时自动探测设备。启动/结束 App 用 phone.goto / phone.exit，不必在 device 上传 app_id。
    """
    if _is_web_browser_type(type):
        return browser(
            type=type,
            session_id=session_id,
            timeout_ms=timeout_ms,
            action_wait_ms=action_wait_ms,
            **extra,
        )
    platform = type
    keep_alive = extra.pop("keepAlive", None)
    if keep_alive is None:
        keep_alive = extra.pop("keep_alive", None)
    if keep_alive is True:
        set_keep_alive(True)
    wait_ms = _resolve_action_wait_ms(timeout_ms=timeout_ms, action_wait_ms=action_wait_ms, extra=extra)
    for key in ("duration_ms", "durationMs", "swipe_preset", "swipePreset", "swipe_speed", "swipeSpeed"):
        extra.pop(key, None)
    out: dict[str, Any] = {"_openKind": "device", "platform": platform, "waitTimeoutMs": wait_ms, **extra}
    if session_id:
        out["sessionId"] = session_id
    if real is not None:
        out["real"] = real
    if app_id is not None:
        out["appId"] = app_id
    if ability_id is not None:
        out["abilityId"] = ability_id
    if device_id:
        caps = dict(out.get("capabilities") or {})
        if platform in ("android", "ios"):
            caps["udid"] = device_id
        else:
            caps["deviceSn"] = device_id
        out["capabilities"] = caps
    return out


# —— Web ——


@dataclass
class Locator:
    spec: dict[str, Any]


class _By:
    @staticmethod
    def id(name: str) -> Locator:
        return Locator({"css": f"#{name}"})

    @staticmethod
    def css(selector: str) -> Locator:
        return Locator({"css": selector})

    @staticmethod
    def xpath(expr: str) -> Locator:
        return Locator({"xpath": expr})

    @staticmethod
    def text(label: str) -> Locator:
        return Locator({"text": label})

    @staticmethod
    def role(r: str) -> Locator:
        return Locator({"role": r})

    @staticmethod
    def test_id(id: str) -> Locator:
        return Locator({"testId": id})

    @staticmethod
    def placeholder(text: str) -> Locator:
        return Locator({"css": f'[placeholder*="{text}"]'})


by = _By()


class WebPage:
    def __init__(self, session_id: str, **options: Any):
        self.session_id = session_id
        self.options = {**options, "waitTimeoutMs": options.get("waitTimeoutMs", 20000)}

    def _run(self, command: str, extra: dict | None = None) -> None:
        must_ok(ada("web", self.session_id, command, {**self.options, **(extra or {})}), command)

    def goto(self, url: str) -> None:
        """在当前标签页打开网址。"""
        self._run("navigate", {"url": url})

    def back(self, times: int = 1, gap_ms: float = 400) -> None:
        """浏览器历史后退（语义命令 back，与移动 phone.back 同名）。"""
        back_times(lambda cmd, extra: self._run(cmd, extra), times, gap_ms)

    def find(self, loc: Locator | str | dict[str, Any]) -> ElementHandle:
        """查找元素（Playwright/Selenium find 风格）。"""
        return ElementHandle("web", self.session_id, self.options, _locator_spec(loc, mobile=False))

    def keyboard_press(self, key: str) -> None:
        self._run("press", {"key": key})

    def screenshot(self, path: str | Path) -> None:
        self._run("screenshot", {"screenshotPath": str(Path(path).resolve())})

    def new_tab(self, url: str) -> None:
        self._run("newTab", {"url": url})

    def close_tab(self) -> None:
        self._run("closeTab")

    def switch_tab(self, tab_index: int = 0) -> None:
        self._run("switchTab", {"tabIndex": tab_index})

    def wait(self, timeout_ms: int = 500) -> None:
        """驱动级等待（毫秒）；与模块级 wait(ms) 单位相同。"""
        self._run("wait", {"timeoutMs": timeout_ms})

    def dismiss_popups(
        self, timeout_ms: int | dict[str, Any] | None = None, attempts: int | None = None
    ) -> dict[str, Any]:
        """仅关 dialog/popup；串行执行，不用 Escape。"""
        return dismiss_web_popups(self.session_id, self.options, timeout_ms, attempts)

    def _session_close(self) -> None:
        ada_close("web", self.session_id, self.options)

    def exit(self) -> None:
        """关闭浏览器（Web 会话）。"""
        self._session_close()

    def close(self, opts: dict[str, Any] | None = None) -> None:
        """默认关闭浏览器 + 会话；keep_browser=True 时仅断开 MCP（由 McpWebPage 处理）。"""
        from session_lifecycle import close_with_target

        close_with_target(
            platform="web",
            cfg=self.options,
            run=self._run,
            session_close=self._session_close,
            opts=opts,
        )


def _locator_spec(loc: Locator | str | dict[str, Any], *, mobile: bool) -> dict[str, Any]:
    if isinstance(loc, Locator):
        return loc.spec
    if isinstance(loc, str):
        return {"text": loc} if mobile else {"css": loc}
    return loc


class ElementHandle:
    def __init__(
        self,
        platform: str,
        session_id: str,
        base: dict[str, Any],
        spec: dict[str, Any],
        *,
        call: Callable[[str, dict[str, Any]], dict[str, Any]] | None = None,
    ):
        self.platform = platform
        self.session_id = session_id
        self.base = base
        self.spec = spec
        self._call = call

    def _invoke(self, command: str, extra: dict[str, Any]) -> dict[str, Any]:
        if self._call is not None:
            return self._call(command, extra)
        return ada(self.platform, self.session_id, command, {**self.base, **extra})

    def click(self) -> None:
        must_ok(self._invoke("click", {"locator": self.spec}), "click")

    def fill(self, text: str) -> None:
        must_ok(self._invoke("type", {"locator": self.spec, "text": text}), "type")

    def clear(self) -> None:
        """清空输入框：Web Playwright clear；harmony uiDump+退格；android 点元素+退格；ios 置空。"""
        if self.platform == "web":
            extra = {"locator": self.spec, "inputOp": "clear", "webInputOp": "clear"}
        elif self.platform == "harmony":
            extra = {"locator": self.spec, "inputOp": "clear", "harmonyInputOp": "clear"}
        elif self.platform == "android":
            extra = {"locator": self.spec, "inputOp": "clear", "androidInputOp": "clear"}
        elif self.platform == "ios":
            extra = {"locator": self.spec, "inputOp": "clear", "iosInputOp": "clear"}
        else:
            raise RuntimeError(f'clear() 当前不支持平台 "{self.platform}"')
        must_ok(self._invoke("type", extra), "clear")

    def exists(self) -> bool:
        extra: dict[str, Any] = {
            "locator": self.spec,
            "optional": True,
            "bestEffort": True,
            "locatorTimeoutMs": 600,
        }
        return bool(self._invoke("assertVisible", extra).get("success"))

    def text(self) -> str:
        r = self._invoke("getText", {"locator": self.spec})
        if not r.get("success"):
            raise RuntimeError(r.get("errorMessage") or "getText failed")
        return str((r.get("data") or {}).get("text", ""))


def web(session_id_or_options: str | dict[str, Any] | None = None, /, **options: Any) -> WebPage:
    if isinstance(session_id_or_options, dict):
        sid, opts = _resolve_session("web", session_id_or_options)
    else:
        sid, opts = _resolve_session("web", session_id_or_options, options or None)
    return WebPage(sid, **opts)


def _device_id_from_cfg(platform: str, cfg: dict[str, Any]) -> str | None:
    raw = cfg.get("deviceId") or cfg.get("device_id")
    return str(raw).strip() if raw else None


def _merge_device_probe(cfg: dict[str, Any], probe: dict[str, Any]) -> dict[str, Any]:
    out = {**probe, **cfg}
    out["capabilities"] = {**(probe.get("capabilities") or {}), **(cfg.get("capabilities") or {})}
    if cfg.get("screenWidth") is None:
        out["screenWidth"] = probe.get("screenWidth")
    if cfg.get("screenHeight") is None:
        out["screenHeight"] = probe.get("screenHeight")
    return out


def _enrich_device_config(platform: str, cfg: dict[str, Any]) -> dict[str, Any]:
    if cfg.get("probeDevice") is False or cfg.get("real") is False:
        return cfg
    probe = read_device(type=platform, device_id=_device_id_from_cfg(platform, cfg))
    return _merge_device_probe(cfg, probe)


def open(
    target: str | dict[str, Any],
    session_id_or_options: str | dict[str, Any] | None = None,
    /,
    **options: Any,
) -> WebPage | AndroidDevice | HarmonyDevice:
    """打开会话：Web 为 open(browser(...)) 后 page.goto(url)；移动为 open(device(...))。

    MCP 第二参：open(device(...), {"connect": "mcp"}) 或 "mcp" 自动 connect_mcp；
    phone.close() 时断开。可传入已有 mcp 句柄。
    """
    from open_transport import resolve_open_second

    second_raw: Any = session_id_or_options if session_id_or_options is not None else (options or None)
    if second_raw is None and options:
        second_raw = options
    use_mcp, mcp_second = resolve_open_second(second_raw)

    if isinstance(target, dict) and target.get("_openKind") == "device":
        cfg = dict(target)
        platform = str(cfg.pop("platform", "harmony"))
        cfg.pop("_openKind", None)
        cfg.pop("probeDevice", None)
        if _is_web_browser_type(platform):
            return open(browser(type=platform, **cfg), second_raw)
        enriched = _enrich_device_config(platform, cfg)
        if use_mcp:
            from ada_mcp import ensure_mcp_client
            from ada_mcp_adapters import open_device_via_mcp

            client, owned = ensure_mcp_client(mcp_second)
            return open_device_via_mcp(client, platform, enriched, owned)
        if platform == "android":
            return android(enriched)
        if platform == "harmony":
            return harmony(enriched)
        if platform == "ios":
            return ios(enriched)
        raise RuntimeError(f'open(device): 不支持的 type "{platform}"')

    if isinstance(target, dict) and target.get("_openKind") == "browser":
        cfg = dict(target)
        cfg.pop("_openKind", None)
        if use_mcp:
            from ada_mcp import ensure_mcp_client
            from ada_mcp_adapters import open_web_via_mcp

            client, owned = ensure_mcp_client(mcp_second)
            return open_web_via_mcp(client, cfg, owned)
        return web(cfg)

    if isinstance(target, str):
        if use_mcp:
            from ada_mcp import ensure_mcp_client
            from ada_mcp_adapters import open_web_via_mcp

            client, owned = ensure_mcp_client(mcp_second)
            page = open_web_via_mcp(client, mcp_second, owned)
            page.goto(target)
            return page
        if isinstance(session_id_or_options, dict):
            page = web(session_id_or_options)
        else:
            page = web(session_id_or_options, **options)
        page.goto(target)
        return page

    raise RuntimeError("open: 请传入 browser(...)、device(...) 或网址")


# —— Android ——


def _run_phone_pinch(
    device: Any,
    finger1: Any,
    finger2: Any,
    distance: float,
    *,
    pinch_in: bool,
    duration_or_opts: Any = None,
    times: int = 1,
    gap_ms: float = 400,
    relative: bool = False,
    **extra: Any,
) -> None:
    merged: dict[str, Any] = {
        **getattr(device, "base", {}),
        **extra,
        "distance": distance,
        "pinchIn": pinch_in,
        "relative": relative,
        "times": times,
        "gapMs": gap_ms,
    }
    if isinstance(duration_or_opts, (int, float)):
        merged["durationMs"] = int(duration_or_opts)
    elif isinstance(duration_or_opts, dict):
        merged.update(duration_or_opts)
    opts = parse_pinch_options(merged)
    ends = resolve_pinch_gesture(
        finger1,
        finger2,
        opts["distance"],
        device.w,
        device.h,
        pinch_in=opts["pinch_in"],
        relative=opts["relative"],
    )
    payload: dict[str, Any] = {
        "finger1": ends["finger1Start"],
        "finger2": ends["finger2Start"],
        "finger1End": ends["finger1End"],
        "finger2End": ends["finger2End"],
        "pinchIn": opts["pinch_in"],
        "screenWidth": device.w,
        "screenHeight": device.h,
        "durationMs": opts["duration_ms"],
    }
    for i in range(opts["times"]):
        device._run("pinch", payload)
        if i < opts["times"] - 1:
            wait(opts["gap_ms"])


def _run_phone_swipe(
    device: Any,
    from_pt: Any,
    to_pt: Any,
    duration_or_opts: Any = None,
    *,
    times: int = 1,
    gap_ms: float = 400,
    **extra: Any,
) -> None:
    opts = parse_swipe_options(duration_or_opts, {**getattr(device, "base", {}), **extra})
    from_px, to_px = resolve_swipe_endpoints(
        from_pt,
        to_pt,
        device.w,
        device.h,
        relative=opts["relative"],
    )
    payload: dict[str, Any] = {
        "from": from_px,
        "to": to_px,
        "screenWidth": device.w,
        "screenHeight": device.h,
        "durationMs": opts["durationMs"],
        "speed": opts["durationMs"],
    }
    if opts.get("fling") is not None:
        payload["fling"] = opts["fling"]
    for i in range(opts["times"]):
        device._run("swipe", payload)
        if i < opts["times"] - 1:
            wait(opts["gap_ms"])


class AndroidDevice:
    _admin_platform = "android"

    def __init__(self, session_id: str, base: dict):
        self.session_id = session_id
        self.base = base
        self.w = int(base.get("screenWidth", 1080))
        self.h = int(base.get("screenHeight", 2400))
        self.cx, self.cy = self.w // 2, self.h // 2
        attach_device_admin(self, self._run_data)

    def _run(self, command: str, extra: dict | None = None) -> None:
        must_ok(ada("android", self.session_id, command, {**self.base, **(extra or {})}), command)

    def _run_data(self, command: str, extra: dict | None = None) -> dict[str, Any]:
        r = ada(self._admin_platform, self.session_id, command, {**self.base, **(extra or {})})
        must_ok(r, command)
        data = r.get("data")
        return data if isinstance(data, dict) else {}

    def _adb(self, args: list[str]) -> None:
        udid = self.base.get("capabilities", {}).get("udid", "")
        cmd = ["adb"] + (["-s", udid] if udid else []) + ["shell"] + args
        if subprocess.run(cmd).returncode != 0:
            raise RuntimeError("adb failed: " + " ".join(args))

    def wake(self) -> None:
        self._adb(["input", "keyevent", "KEYCODE_WAKEUP"])

    def press_home(self) -> None:
        self._run("pressHome")

    def kill_all_apps(self, exclude: list[str] | None = None) -> dict[str, Any]:
        udid = self.base.get("capabilities", {}).get("udid", "")
        adb_prefix = ["adb", "-s", udid] if udid else ["adb"]
        skip = set(exclude or [])
        skip_re = re.compile(
            r"system_server|zygote|zygote64|tombstoned|lmkd|logd|servicemanager|surfaceflinger",
            re.I,
        )
        hits: list[str] = []

        def adb_sh(script: str) -> str:
            r = subprocess.run(
                adb_prefix + ["shell", "sh", "-c", script],
                capture_output=True,
                text=True,
            )
            return (r.stdout or "") + (r.stderr or "")

        adb_sh("input keyevent KEYCODE_HOME")
        ps_out = adb_sh("ps -A 2>/dev/null || ps")
        pids: list[str] = []
        for line in ps_out.splitlines():
            if skip_re.search(line):
                continue
            parts = line.split()
            if len(parts) < 2 or not parts[1].isdigit() or int(parts[1]) < 100:
                continue
            if any(pkg in line for pkg in skip):
                continue
            pids.append(parts[1])
        if pids:
            kill_cmd = "; ".join(f"kill {pid} 2>/dev/null" for pid in dict.fromkeys(pids))
            adb_sh(kill_cmd)
            hits.append(f"kill:pids:{len(pids)}")
            adb_sh("input keyevent KEYCODE_HOME")
            return build_kill_all_apps_result(killed=pids, list_source="ps-pid", hits=hits)
        pipeline = (
            "ps -A 2>/dev/null | grep -vE 'system_server|zygote|zygote64' "
            "| awk 'NR>1 && $2 ~ /^[0-9]+$/ {print $2}' "
            "| while read pid; do kill \"$pid\" 2>/dev/null; done"
        )
        adb_sh(pipeline)
        adb_sh("input keyevent KEYCODE_HOME")
        hits.append("kill:pipeline")
        return build_kill_all_apps_result(killed=[], list_source="ps-kill-shell", hits=hits, cleared=True)

    def swipe(
        self,
        from_pt: Any,
        to_pt: Any,
        duration_or_opts: Any = None,
        *,
        times: int = 1,
        gap_ms: float = 400,
        relative: bool = False,
        **extra: Any,
    ) -> None:
        _run_phone_swipe(
            self,
            from_pt,
            to_pt,
            duration_or_opts,
            times=times,
            gap_ms=gap_ms,
            relative=relative,
            **extra,
        )

    def pinch(
        self,
        finger1: Any,
        finger2: Any,
        distance: float,
        *,
        pinch_in: bool,
        duration_or_opts: Any = None,
        times: int = 1,
        gap_ms: float = 400,
        relative: bool = False,
        **extra: Any,
    ) -> None:
        _run_phone_pinch(
            self,
            finger1,
            finger2,
            distance,
            pinch_in=pinch_in,
            duration_or_opts=duration_or_opts,
            times=times,
            gap_ms=gap_ms,
            relative=relative,
            **extra,
        )

    def back(self, times: int = 1, gap_ms: float = 400) -> None:
        back_times(lambda cmd, extra: self._run(cmd, extra), times, gap_ms)

    def goto(
        self,
        target: str | list[str] | dict[str, Any],
        second: str | int | None = None,
        third: int | None = None,
    ) -> None:
        goto_target("android", self.find, lambda cmd, extra: self._run(cmd, extra), target, second, third)

    def find(self, loc: Locator | str | dict[str, Any]) -> ElementHandle:
        return ElementHandle("android", self.session_id, self.base, _locator_spec(loc, mobile=True))

    def dismiss_popups(
        self, timeout_ms: int | dict[str, Any] | None = None, attempts: int | None = None
    ) -> dict[str, Any]:
        return dismiss_mobile_popups(
            "android", self.session_id, self.base, self.w, self.h, timeout_ms, attempts
        )

    def fill_search(self, text: str, hints_or_opts: str | list[str] | dict[str, Any] | None = None) -> None:
        payload = {**self.base, **_fill_search_payload(hints_or_opts)}
        must_ok(ada_recipe("android", self.session_id, "fill_search", payload, text), "fill_search")

    def screenshot(self, path: str | Path) -> None:
        self._run("screenshot", {"screenshotPath": str(Path(path).resolve())})

    def _session_close(self) -> None:
        ada_close("android", self.session_id, self.base)

    def exit(self, app_id: str | None = None) -> None:
        """结束设备上的 App（force-stop）。"""
        from session_lifecycle import exit_target

        exit_target(
            platform="android",
            cfg=self.base,
            run=self._run,
            session_close=self._session_close,
            app_id=app_id,
        )

    def close(self, opts: dict[str, Any] | None = None) -> None:
        """默认 exit App + 关闭会话；keep_app=True 时仅关会话。"""
        from session_lifecycle import close_with_target

        close_with_target(
            platform="android",
            cfg=self.base,
            run=self._run,
            session_close=self._session_close,
            opts=opts,
        )


def android(
    session_id_or_base: str | dict[str, Any] | None = None,
    base: dict[str, Any] | None = None,
) -> AndroidDevice:
    sid, cfg = _resolve_session("android", session_id_or_base, base)
    return AndroidDevice(sid, cfg)


# —— Harmony ——


class HarmonyDevice:
    _admin_platform = "harmony"

    def __init__(self, session_id: str, base: dict):
        self.session_id = session_id
        self.base = base
        self.speed = int(os.environ.get("ADA_HARMONY_SWIPE_SPEED_MS", "800"))
        self.w = int(base.get("screenWidth", 1080))
        self.h = int(base.get("screenHeight", 2400))
        attach_device_admin(self, self._run_data)

    def _run(self, command: str, extra: dict | None = None) -> None:
        must_ok(ada("harmony", self.session_id, command, {**self.base, **(extra or {})}), command)

    def _run_data(self, command: str, extra: dict | None = None) -> dict[str, Any]:
        r = ada(self._admin_platform, self.session_id, command, {**self.base, **(extra or {})})
        must_ok(r, command)
        data = r.get("data")
        return data if isinstance(data, dict) else {}

    def suspend(self) -> None:
        """鸿蒙设备休眠（power-shell suspend）。"""
        self._run("custom", {"custom": {"action": "shell", "command": "power-shell suspend"}})

    def wake(self) -> None:
        self._run("custom", {"custom": {"action": "shell", "command": "power-shell wakeup"}})

    def press_home(self) -> None:
        self._run("pressHome")

    def kill_all_apps(self, exclude: list[str] | None = None) -> dict[str, Any]:
        skip = set(exclude or [])
        hits: list[str] = []
        ps = ada(
            "harmony",
            self.session_id,
            "custom",
            {**self.base, "custom": {"action": "shell", "command": "ps"}},
        )
        text = str((ps.get("data") or {}).get("value") or "")
        bundles = parse_harmony_running_bundles(text, list(skip))
        killed: list[str] = []
        failed: list[str] = []
        for bundle in bundles:
            stopped = False
            try:
                er = ada(
                    "harmony",
                    self.session_id,
                    "exitApp",
                    {**self.base, "appId": bundle},
                )
                stopped = bool(er.get("success"))
            except Exception:
                pass
            if not stopped:
                sr = ada(
                    "harmony",
                    self.session_id,
                    "custom",
                    {**self.base, "custom": {"action": "shell", "command": f"aa force-stop {bundle}"}},
                )
                out = str((sr.get("data") or {}).get("value") or "")
                stopped = harmony_force_stop_ok(out)
            if stopped:
                killed.append(bundle)
            else:
                failed.append(bundle)
        if killed:
            hits.append(f"stop:bundles:{len(killed)}")
            return build_kill_all_apps_result(
                killed=killed, failed=failed, list_source="aa-force-stop", hits=hits
            )
        hits.append("kill:none")
        return build_kill_all_apps_result(
            killed=[], failed=failed, list_source="none", hits=hits
        )

    def swipe(
        self,
        from_pt: Any,
        to_pt: Any,
        duration_or_opts: Any = None,
        *,
        times: int = 1,
        gap_ms: float = 400,
        relative: bool = False,
        **extra: Any,
    ) -> None:
        _run_phone_swipe(
            self,
            from_pt,
            to_pt,
            duration_or_opts,
            times=times,
            gap_ms=gap_ms,
            relative=relative,
            **extra,
        )

    def pinch(
        self,
        finger1: Any,
        finger2: Any,
        distance: float,
        *,
        pinch_in: bool,
        duration_or_opts: Any = None,
        times: int = 1,
        gap_ms: float = 400,
        relative: bool = False,
        **extra: Any,
    ) -> None:
        _run_phone_pinch(
            self,
            finger1,
            finger2,
            distance,
            pinch_in=pinch_in,
            duration_or_opts=duration_or_opts,
            times=times,
            gap_ms=gap_ms,
            relative=relative,
            **extra,
        )

    def back(self, times: int = 1, gap_ms: float = 400) -> None:
        back_times(lambda cmd, extra: self._run(cmd, extra), times, gap_ms)

    def goto(
        self,
        target: str | list[str] | dict[str, Any],
        second: str | int | None = None,
        third: int | None = None,
    ) -> None:
        goto_target("harmony", self.find, lambda cmd, extra: self._run(cmd, extra), target, second, third)

    def find(self, loc: Locator | str | dict[str, Any]) -> ElementHandle:
        return ElementHandle("harmony", self.session_id, self.base, _locator_spec(loc, mobile=True))

    def dismiss_popups(
        self, timeout_ms: int | dict[str, Any] | None = None, attempts: int | None = None
    ) -> dict[str, Any]:
        step_log(f"harmony dismiss_popups start timeoutMs={timeout_ms} attempts={attempts}")

        def on_round(round_n: int, ok: bool) -> None:
            step_log(f"harmony dismiss_popups round {round_n} start")
            step_log(f"harmony dismiss_popups round {round_n} ok={ok}")

        result = dismiss_mobile_popups(
            "harmony",
            self.session_id,
            self.base,
            self.w,
            self.h,
            timeout_ms,
            attempts,
            on_round=on_round,
        )
        step_log(
            f"harmony dismiss_popups done dismissed={result.get('dismissed')} "
            f"rounds={result.get('rounds')} elapsedMs={result.get('elapsedMs')}"
        )
        return result

    def type(self, text: str) -> None:
        """向当前焦点输入（点击输入框后使用，无需 locator）。"""
        self._run("type", {"text": text})

    def fill_search(self, text: str, hints_or_opts: str | list[str] | dict[str, Any] | None = None) -> None:
        payload = {**self.base, **_fill_search_payload(hints_or_opts)}
        must_ok(ada_recipe("harmony", self.session_id, "fill_search", payload, text), "fill_search")

    @property
    def screen(self) -> dict[str, int]:
        return {"width": self.w, "height": self.h}

    def screenshot(self, path: str | Path) -> None:
        self._run("screenshot", {"screenshotPath": str(Path(path).resolve())})

    def _session_close(self) -> None:
        ada_close("harmony", self.session_id, self.base)

    def exit(self, app_id: str | None = None) -> None:
        from session_lifecycle import exit_target

        exit_target(
            platform="harmony",
            cfg=self.base,
            run=self._run,
            session_close=self._session_close,
            app_id=app_id,
        )

    def close(self, opts: dict[str, Any] | None = None) -> None:
        from session_lifecycle import close_with_target

        close_with_target(
            platform="harmony",
            cfg=self.base,
            run=self._run,
            session_close=self._session_close,
            opts=opts,
        )


def harmony(
    session_id_or_base: str | dict[str, Any] | None = None,
    base: dict[str, Any] | None = None,
) -> HarmonyDevice:
    sid, cfg = _resolve_session("harmony", session_id_or_base, base)
    return HarmonyDevice(sid, cfg)


class IosDevice(AndroidDevice):
    """iOS 设备（API 与 Android 对齐）。"""

    _admin_platform = "ios"

    def __init__(self, session_id: str, base: dict):
        super().__init__(session_id, base)
        self.w = int(base.get("screenWidth", 390))
        self.h = int(base.get("screenHeight", 844))

    def _run(self, command: str, extra: dict | None = None) -> None:
        must_ok(ada("ios", self.session_id, command, {**self.base, **(extra or {})}), command)

    def wake(self) -> None:
        self._run("deviceAdmin", {"action": "wake"})

    def kill_all_apps(self, exclude: list[str] | None = None) -> dict[str, Any]:
        r = ada(
            "ios",
            self.session_id,
            "deviceAdmin",
            {**self.base, "action": "killAllApps", "excludePackages": exclude or []},
        )
        d = r.data if r.success else {}
        return {
            "success": r.success,
            "cleared": bool(d.get("cleared")),
            "businessCode": d.get("businessCode") or "APPS_NONE",
            "killedCount": int(d.get("killedCount") or 0),
            "failedCount": int(d.get("failedCount") or 0),
            "packages": list(d.get("packages") or []),
            "listSource": d.get("listSource") or "wda-terminate",
            "hits": list(d.get("hits") or []),
        }

    def goto(
        self,
        target: str | list[str] | dict[str, Any],
        second: str | int | None = None,
        third: int | None = None,
    ) -> None:
        goto_target("ios", self.find, lambda cmd, extra: self._run(cmd, extra), target, second, third)

    def find(self, loc: Locator | str | dict[str, Any]) -> ElementHandle:
        return ElementHandle("ios", self.session_id, self.base, _locator_spec(loc, mobile=True))

    def fill_search(self, text: str, hints_or_opts: str | list[str] | dict[str, Any] | None = None) -> None:
        payload = {**self.base, **_fill_search_payload(hints_or_opts)}
        must_ok(ada_recipe("ios", self.session_id, "fill_search", payload, text), "fill_search")

    def _session_close(self) -> None:
        ada_close("ios", self.session_id, self.base)

    def exit(self, app_id: str | None = None) -> None:
        from session_lifecycle import exit_target

        exit_target(
            platform="ios",
            cfg=self.base,
            run=self._run,
            session_close=self._session_close,
            app_id=app_id,
        )

    def close(self, opts: dict[str, Any] | None = None) -> None:
        from session_lifecycle import close_with_target

        close_with_target(
            platform="ios",
            cfg=self.base,
            run=self._run,
            session_close=self._session_close,
            opts=opts,
        )


def ios(
    session_id_or_base: str | dict[str, Any] | None = None,
    base: dict[str, Any] | None = None,
) -> IosDevice:
    sid, cfg = _resolve_session("ios", session_id_or_base, base)
    return IosDevice(sid, cfg)


# MCP 传输（实现见 ada_mcp.py，与 Node ada-client.mjs re-export connectMcp 一致）
from ada_mcp import McpConnection, connect_mcp, parse_mcp_tool_result
