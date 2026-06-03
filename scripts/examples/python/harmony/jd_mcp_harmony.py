#!/usr/bin/env python3
"""京东鸿蒙 — MCP 传输（与 jd-mcp-harmony.mjs 同 10 步）

运行（仓库根目录）：python scripts/examples/python/harmony/jd_mcp_harmony.py
或：npm run test:jd-harmony:mcp:py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "scripts" / "lib"))

from ada_client import by, device, dir, exit, step_log, open, init, wait

MCP = {"connect": "mcp"}

init(__file__)

SEARCH_TEXT = "ABC"
OUT = "artifacts/examples/python/harmony"
SHOT = f"{OUT}/08-search-mcp.png"
APP_ID = "com.jd.hm.mall"
ABILITY_ID = "EntryAbility"
SWIPE_X = 0.5
SWIPE_Y = 0.5
SWIPE_H_EDGE = 0.06
SWIPE_V_EDGE = 0.08
SWIPE_SLOW_MS = 1200
SWIPE_RIGHT_FROM = (SWIPE_H_EDGE, SWIPE_Y)
SWIPE_RIGHT_TO = (1 - SWIPE_H_EDGE, SWIPE_Y)
SWIPE_LEFT_FROM = (1 - SWIPE_H_EDGE, SWIPE_Y)
SWIPE_LEFT_TO = (SWIPE_H_EDGE, SWIPE_Y)
SWIPE_UP_FROM = (SWIPE_X, 1 - SWIPE_V_EDGE)
SWIPE_UP_TO = (SWIPE_X, SWIPE_V_EDGE)
SWIPE_DOWN_FROM = (SWIPE_X, SWIPE_V_EDGE)
SWIPE_DOWN_TO = (SWIPE_X, 1 - SWIPE_V_EDGE)
PINCH_FINGER1 = (0.22, 0.38)
PINCH_FINGER2 = (0.78, 0.62)
PINCH_DISTANCE = 0.07
PINCH_OPTS = {"relative": True, "durationMs": 500}


def main() -> None:
    step_log("main start")
    dir(OUT)
    step_log("open device start")
    phone = open(
        device(type="harmony", session_id="jd-harmony-mcp", real=True, mock=False),
        MCP,
    )
    step_log("open device done")
    try:
            print("[1] 唤醒屏幕")
            step_log("[1] wake start")
            phone.wake()
            step_log("[1] wake done")
            wait(500)

            print("[2] 结束所有应用")
            step_log("[2] kill_all_apps start")
            killed = phone.kill_all_apps()
            step_log(f"[2] kill_all_apps done code={killed.get('businessCode')}")
            print(
                "  killAllApps →",
                killed.get("businessCode", ""),
                f"killed={killed.get('killedCount', 0)}",
                killed.get("listSource", ""),
            )

            print("[3] 右滑 3 次，左滑 2 次")
            step_log("[3] swipe right x3 start")
            phone.swipe(SWIPE_RIGHT_FROM, SWIPE_RIGHT_TO, SWIPE_SLOW_MS, relative=True, times=3)
            step_log("[3] swipe left x2 start")
            phone.swipe(SWIPE_LEFT_FROM, SWIPE_LEFT_TO, SWIPE_SLOW_MS, relative=True, times=2)
            step_log("[3] swipe done")
            wait(500)

            print("[4] 上滑 2 次，下滑 2 次")
            step_log("[4] swipe vertical start")
            phone.swipe(SWIPE_UP_FROM, SWIPE_UP_TO, SWIPE_SLOW_MS, relative=True, times=2)
            phone.swipe(SWIPE_DOWN_FROM, SWIPE_DOWN_TO, SWIPE_SLOW_MS, relative=True, times=2)
            wait(500)

            print("[4b] 双指缩小")
            phone.pinch(
                PINCH_FINGER1,
                PINCH_FINGER2,
                PINCH_DISTANCE,
                pinch_in=True,
                duration_or_opts=PINCH_OPTS,
            )
            wait(400)
            print("[4c] 双指放大")
            phone.pinch(
                PINCH_FINGER1,
                PINCH_FINGER2,
                PINCH_DISTANCE,
                pinch_in=False,
                duration_or_opts=PINCH_OPTS,
            )
            wait(500)

            step_log("[4] press_home start")
            phone.press_home()
            step_log("[4] done")
            wait(500)

            print("[5] 启动京东 App")
            step_log(f"[5] goto start app={APP_ID}")
            phone.goto(APP_ID, ABILITY_ID, 2500)
            step_log("[5] goto done")
            wait(500)

            print("[6] 如有弹窗则关闭")
            step_log("[6] dismiss_popups start timeoutMs=3000 attempts=2")
            dismiss = phone.dismiss_popups(3000, 2)
            step_log(
                f"[6] dismiss_popups done dismissed={dismiss.get('dismissed')} "
                f"code={dismiss.get('businessCode')} elapsedMs={dismiss.get('elapsedMs')}"
            )
            hits = dismiss.get("hits") or []
            hits_s = f" hits={len(hits)}" if hits else ""
            print(
                "  dismissPopups →",
                "已关闭弹窗" if dismiss.get("dismissed") else "未发现弹窗",
                dismiss.get("businessCode", ""),
                hits_s,
            )

            wait(500)

            print(f"[7] 点击搜索框并输入「{SEARCH_TEXT}」")
            step_log("[7] find search entry start")
            entry = phone.find(by.text("搜索"))
            if not entry.exists():
                entry = phone.find(by.text("请输入"))
            if not entry.exists():
                entry = phone.find(by.text("输入"))
            if not entry.exists():
                entry = phone.find("搜索")
            if not entry.exists():
                raise RuntimeError("搜索入口未找到")
            step_log("[7] click start")
            entry.click()
            wait(1500)
            step_log("[7] fill start")
            field = phone.find(by.text("请输入"))
            if not field.exists():
                field = phone.find(by.text("输入"))
            if not field.exists():
                field = phone.find({"type": "TextInput"})
            if field.exists():
                field.clear()
                wait(1000)
                field.fill(SEARCH_TEXT)
            else:
                phone.type(SEARCH_TEXT)
            step_log("[7] fill done")

            wait(1000)

            print("[8] 截图 →", SHOT)
            step_log(f"[8] screenshot start path={SHOT}")
            phone.screenshot(SHOT)
            step_log("[8] screenshot done")
            wait(500)
            print("[9] 返回")
            step_log("[9] back start")
            phone.back()
            step_log("[9] back done")

            print("[10] 退出 App")
            step_log("[10] exit start")
            phone.exit(APP_ID)
            step_log("[10] exit done")
            print("\n完成 →", SHOT)
    finally:
        step_log("phone.close start")
        phone.close()
        step_log("phone.close done")
    step_log("main done")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        step_log(f"main exception: {e}")
        print(e, file=sys.stderr)
        exit(1)
    exit()
