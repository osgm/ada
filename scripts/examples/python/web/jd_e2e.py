#!/usr/bin/env python3
"""京东 Web 示例（本地，四场景）— 与 jd-e2e.mjs 一致

运行（仓库根目录）：python scripts/examples/python/web/jd_e2e.py
或：npm run test:jd-web:py
MCP：npm run test:jd-web:mcp:py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "scripts" / "lib"))

from ada_client import by, browser, dir, open, init, wait, exit

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

dir(OUT)

print("[1] 打开谷歌浏览器，截图后退出")
page = open(browser(session_id="jd-web-1", type="chrome", timeout_ms=8000, **WEB_WINDOW))
page.goto(HOME_URL)
page.screenshot(f"{OUT}/01-chrome.png")
page.close()

print("[2] 使用本地浏览器缓存打开 Chrome，截图后退出")
page = open(
    browser(
        session_id="jd-web-2",
        type="chrome",
        profile=f"{OUT}/chrome-profile",
        timeout_ms=8000,
        **WEB_WINDOW,
    )
)
page.goto(HOME_URL)
page.screenshot(f"{OUT}/02-profile.png")
page.close()

print("[3] 新 Tab 打开首页，关弹窗，搜索，截图，关 Tab，退出")
page = open(browser(session_id="jd-web-3", type="chrome", timeout_ms=8000, **WEB_WINDOW))
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
    page.screenshot(f"{OUT}/03-tab-search.png")
    page.close_tab()
finally:
    page.close()

print("[4] CDP 模式打开首页，关弹窗，搜索，截图后退出")
page = open(browser(session_id="jd-web-4", type="chrome", cdp=True, timeout_ms=8000, **WEB_WINDOW))
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
    page.screenshot(f"{OUT}/04-cdp-search.png")
finally:
    page.close()

print("完成 →", OUT)
exit()
