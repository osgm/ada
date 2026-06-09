#!/usr/bin/env python3
"""京东 Android — MCP 传输（与 jd-mcp-android.mjs 同 10 步）

运行（仓库根目录）：python scripts/examples/python/android/jd_mcp_android.py
或：npm run test:jd-android:mcp:py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "scripts" / "lib"))

from ada_client import by, device, dir, exit, step_log, open, init

MCP = {"connect": "mcp"}

init(__file__)

SEARCH_TEXT = "ABC"
OUT = "artifacts/examples/python/android"
SHOT = f"{OUT}/08-search-mcp.png"
APP_ID = "com.jingdong.app.mall"
SWIPE_X = 0.5
SWIPE_Y = 0.5
SWIPE_H_EDGE = 0.06
SWIPE_V_EDGE = 0.08
SWIPE_PRESET = "fast"
SWIPE_GAP_MS = 120
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
PINCH_OPTS = {"relative": True, "durationMs": 300}


def main() -> None:
    step_log("main start")
    dir(OUT)
    step_log("open device start")
    phone = open(
        device(type="android", session_id="jd-android-mcp", real=True, mock=False),
        MCP,
    )
    step_log("open device done")
    try:
            print("[1] 唤醒屏幕")
            step_log("[1] wake start")
            phone.wake()
            step_log("[1] wake done")

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
            phone.swipe(
                SWIPE_RIGHT_FROM, SWIPE_RIGHT_TO, SWIPE_PRESET, relative=True, times=3, gap_ms=SWIPE_GAP_MS
            )
            step_log("[3] swipe left x2 start")
            phone.swipe(
                SWIPE_LEFT_FROM, SWIPE_LEFT_TO, SWIPE_PRESET, relative=True, times=2, gap_ms=SWIPE_GAP_MS
            )
            step_log("[3] swipe done")

            print("[4] 上滑 2 次，下滑 2 次")
            step_log("[4] swipe vertical start")
            phone.swipe(
                SWIPE_UP_FROM, SWIPE_UP_TO, SWIPE_PRESET, relative=True, times=2, gap_ms=SWIPE_GAP_MS
            )
            phone.swipe(
                SWIPE_DOWN_FROM, SWIPE_DOWN_TO, SWIPE_PRESET, relative=True, times=2, gap_ms=SWIPE_GAP_MS
            )

            print("[4b] 双指缩小")
            phone.pinch(
                PINCH_FINGER1,
                PINCH_FINGER2,
                PINCH_DISTANCE,
                pinch_in=True,
                duration_or_opts=PINCH_OPTS,
            )
            print("[4c] 双指放大")
            phone.pinch(
                PINCH_FINGER1,
                PINCH_FINGER2,
                PINCH_DISTANCE,
                pinch_in=False,
                duration_or_opts=PINCH_OPTS,
            )

            step_log("[4] press_home start")
            phone.press_home()
            step_log("[4] done")

            print("[5] 启动京东 App")
            step_log(f"[5] goto start app={APP_ID}")
            phone.goto(APP_ID, 2500)
            step_log("[5] goto done")

            print("[6] 如有弹窗则关闭")
            step_log("[6] dismiss_popups start timeoutMs=1000 attempts=1")
            dismiss = phone.dismiss_popups(1000, 1)
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

            print(f"[7] 点击搜索框并输入「{SEARCH_TEXT}」")
            step_log("[7] fill_search start")
            phone.fill_search(
                SEARCH_TEXT,
                {
                    "entryHints": ["搜索"],
                    "inputHints": ["请输入", "输入", "搜索"],
                    "settleMs": 1500,
                },
            )
            step_log("[7] fill_search done")

            print("[8] 截图 →", SHOT)
            step_log(f"[8] screenshot start path={SHOT}")
            phone.screenshot(SHOT)
            step_log("[8] screenshot done")

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
