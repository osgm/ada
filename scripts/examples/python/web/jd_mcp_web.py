#!/usr/bin/env python3
"""京东 Web — MCP 传输（四场景，与 jd_e2e.py / jd-mcp-web.mjs 一致）

运行（仓库根目录）：python scripts/examples/python/web/jd_mcp_web.py
或：npm run test:jd-web:mcp:py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "scripts" / "lib"))

from ada_client import by, browser, dir, exit, open, init, wait

MCP = {
    "connect": "mcp",
    "mcpOptions": {"env": {"ADA_PLAYWRIGHT_HEADLESS": "false"}},
}

init(__file__)

OUT = "artifacts/examples/python/web"
HOME_URL = "https://www.jd.com"
SEARCH_TEXT = "ABC"
JD_SEARCH_CSS = (
    "input#key, input[name='keyword']:not([type='file']), .form input[type='text'], input[placeholder*='搜索']"
)
WEB_WINDOW = {
    "maximize": True,
    "launchOptions": {"args": ["--start-maximized", "--window-position=0,0", "--window-size=1920,1080"]},
    "contextOptions": {"viewport": None},
}
WEB_MCP_SESSION = {
    "headless": False,
    "waitTimeoutMs": 8_000,
    "commandTimeoutMs": 90_000,
}

dir(OUT)

print("[1] 打开谷歌浏览器，截图后退出")
page = open(
    browser(session_id="jd-web-mcp-1", type="chrome", **WEB_WINDOW, **WEB_MCP_SESSION),
    MCP,
)
page.goto(HOME_URL)
page.screenshot(f"{OUT}/01-chrome-mcp.png")
page.close()

print("[2] 使用本地浏览器缓存打开 Chrome，截图后退出")
page = open(
    browser(
        session_id="jd-web-mcp-2",
        type="chrome",
        profile=f"{OUT}/chrome-profile",
        **WEB_WINDOW,
        **WEB_MCP_SESSION,
    ),
    MCP,
)
page.goto(HOME_URL)
page.screenshot(f"{OUT}/02-profile-mcp.png")
page.close()

print("[3] 新 Tab 打开首页，关弹窗，搜索，截图，关 Tab，退出")
page = open(
    browser(session_id="jd-web-mcp-3", type="chrome", **WEB_WINDOW, **WEB_MCP_SESSION),
    MCP,
)
try:
    page.goto(HOME_URL)
    page.new_tab(HOME_URL)
    page.dismiss_popups({"timeoutMs": 5000, "attempts": 4})
    search_box = page.find(by.css(JD_SEARCH_CSS))
    if not search_box.exists():
        search_box = page.find(by.placeholder("搜索"))
    try:
        search_box.click()
    except Exception:
        page.dismiss_popups({"timeoutMs": 5000, "attempts": 4})
        wait(600)
        search_box = page.find(by.css(JD_SEARCH_CSS))
        if not search_box.exists():
            search_box = page.find(by.placeholder("搜索"))
        search_box.click()
    search_box.fill(SEARCH_TEXT)
    page.keyboard_press("Enter")
    wait(1000)
    page.screenshot(f"{OUT}/03-tab-search-mcp.png")
    page.close_tab()
finally:
    page.close()

print("[4] CDP 模式打开首页，关弹窗，搜索，截图后退出")
page = open(
    browser(session_id="jd-web-mcp-4", type="chrome", cdp=True, **WEB_WINDOW, **WEB_MCP_SESSION),
    MCP,
)
try:
    page.goto(HOME_URL)
    page.new_tab(HOME_URL)
    page.dismiss_popups({"timeoutMs": 5000, "attempts": 4})
    search_box = page.find(by.css(JD_SEARCH_CSS))
    if not search_box.exists():
        search_box = page.find(by.placeholder("搜索"))
    try:
        search_box.click()
    except Exception:
        page.dismiss_popups({"timeoutMs": 5000, "attempts": 4})
        wait(600)
        search_box = page.find(by.css(JD_SEARCH_CSS))
        if not search_box.exists():
            search_box = page.find(by.placeholder("搜索"))
        search_box.click()
    search_box.fill(SEARCH_TEXT)
    page.keyboard_press("Enter")
    wait(1000)
    page.screenshot(f"{OUT}/04-cdp-search-mcp.png")
finally:
    page.close()

print("\n完成 →", OUT)
exit()
