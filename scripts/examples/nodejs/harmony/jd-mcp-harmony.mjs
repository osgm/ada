/**
 * 京东鸿蒙 App — LLM + ada-mcp 操控（10 步验收脚本，与 jd-e2e.mjs 逐步一致）
 * 运行：npm run test:jd-harmony:mcp
 */
import path from "node:path";
import { device, dir, open, exit, wait } from "../../../lib/ada-client.mjs";

const MCP = { connect: "mcp", mcpOptions: { name: "jd-mcp-harmony" } };

const SEARCH_TEXT = "ABC";
const OUT = "artifacts/examples/nodejs/harmony";
const SHOT = path.join(OUT, "08-search-mcp.png");
const APP_ID = "com.jd.hm.mall";
const ABILITY_ID = "EntryAbility";
const SWIPE_X = 0.5;
const SWIPE_Y = 0.5;
const SWIPE_H_EDGE = 0.06;
const SWIPE_V_EDGE = 0.08;
const SWIPE_OPTS = { durationMs: 1200, relative: true };
const PINCH_FINGER1 = [0.22, 0.38];
const PINCH_FINGER2 = [0.78, 0.62];
const PINCH_DISTANCE = 0.07;
const PINCH_OPTS = { relative: true, durationMs: 300 };
const SWIPE_RIGHT = { from: [SWIPE_H_EDGE, SWIPE_Y], to: [1 - SWIPE_H_EDGE, SWIPE_Y] };
const SWIPE_LEFT = { from: [1 - SWIPE_H_EDGE, SWIPE_Y], to: [SWIPE_H_EDGE, SWIPE_Y] };
const SWIPE_UP = { from: [SWIPE_X, 1 - SWIPE_V_EDGE], to: [SWIPE_X, SWIPE_V_EDGE] };
const SWIPE_DOWN = { from: [SWIPE_X, SWIPE_V_EDGE], to: [SWIPE_X, 1 - SWIPE_V_EDGE] };

async function main() {
  await dir(OUT);

  const phone = await open(
    device({
      type: "harmony",
      sessionId: "jd-harmony-mcp",
      real: true,
      mock: false
    }),
    MCP
  );

  try {
    console.log("[1] 唤醒屏幕");
    await phone.wake();
    await wait(500);

    console.log("[2] 结束所有应用");
    const killed = await phone.killAllApps();
    console.log(
      "  killAllApps →",
      killed.businessCode ?? "",
      `killed=${killed.killedCount ?? 0}`,
      killed.listSource ?? ""
    );

    console.log("[3] 右滑 3 次，左滑 2 次");
    await phone.swipe(SWIPE_RIGHT.from, SWIPE_RIGHT.to, { ...SWIPE_OPTS, times: 3 });
    await phone.swipe(SWIPE_LEFT.from, SWIPE_LEFT.to, { ...SWIPE_OPTS, times: 2 });

    console.log("[4] 上滑 2 次，下滑 2 次");
    await phone.swipe(SWIPE_UP.from, SWIPE_UP.to, { ...SWIPE_OPTS, times: 2 });
    await phone.swipe(SWIPE_DOWN.from, SWIPE_DOWN.to, { ...SWIPE_OPTS, times: 2 });

    console.log("[4b] 双指缩小");
    await phone.pinch(PINCH_FINGER1, PINCH_FINGER2, PINCH_DISTANCE, { pinchIn: true, ...PINCH_OPTS });
    console.log("[4c] 双指放大");
    await phone.pinch(PINCH_FINGER1, PINCH_FINGER2, PINCH_DISTANCE, { pinchIn: false, ...PINCH_OPTS });

    await phone.pressHome();

    console.log("[5] 启动京东 App");
    await wait(500);
    await phone.goto(APP_ID, ABILITY_ID, 2500);

    console.log("[6] 如有弹窗则关闭");
    const dismiss = await phone.dismissPopups(1000, 1);
    const hits = dismiss.hits?.length ? ` hits=${dismiss.hits.length}` : "";
    console.log(
      "  dismissPopups →",
      dismiss.dismissed ? "已关闭弹窗" : "未发现弹窗",
      dismiss.businessCode ?? "",
      hits
    );

    console.log(`[7] 点击搜索框并输入「${SEARCH_TEXT}」`);
    await phone.fillSearch(SEARCH_TEXT, {
      entryHints: ["搜索"],
      inputHints: ["请输入", "输入", "搜索"],
      settleMs: 1500
    });

    console.log("[8] 截图 →", SHOT);
    await phone.screenshot(SHOT);

    console.log("[9] 返回");
    await phone.back();

    console.log("[10] 退出 App");
    await phone.exit(APP_ID);
  } finally {
    await phone.close();
  }

  console.log("\n完成 →", SHOT);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await exit();
  });
