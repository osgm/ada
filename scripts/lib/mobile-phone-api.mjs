/**
 * 移动 phone 通用 API（Node）— back / goto，供 ada-fluent 与 MCP 适配器复用
 */
import { wait } from "./ada.mjs";
import { runLaunchSettle } from "./smart-wait-launch.mjs";

export function isAppBundleId(value) {
  return typeof value === "string" && /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]+)+$/i.test(value);
}

/** @param {(cmd: string, extra?: object) => Promise<unknown>} run */
export function createBack(run) {
  return async (times = 1, gapMs = 400) => {
    const n = Math.max(1, Number(times) || 1);
    for (let i = 0; i < n; i++) {
      await run("back");
      if (i < n - 1) await wait(gapMs);
    }
  };
}

/**
 * @param {"android"|"ios"|"harmony"} platform
 * @param {(loc: unknown) => { exists: () => Promise<boolean>, click: () => Promise<void> }} find
 * @param {(cmd: string, extra?: object) => Promise<unknown>} run
 */
export function createGoto(platform, find, run) {
  return async (target, second, third) => {
    if (target == null) throw new Error("goto: target is required");

    if (typeof target === "object") {
      const { appId, bundleId, abilityId, ability, settleMs, wait: waitOpts } = target;
      const id = appId ?? bundleId;
      if (!id) throw new Error("goto: appId is required");
      const extra = { appId: id };
      if (platform === "harmony") extra.abilityId = abilityId ?? ability ?? "EntryAbility";
      await run("launchApp", extra);
      await runLaunchSettle(run, platform, settleMs, waitOpts);
      return;
    }

    if (typeof target === "string" && isAppBundleId(target)) {
      const extra = { appId: target };
      if (platform === "harmony") {
        extra.abilityId = typeof second === "string" ? second : "EntryAbility";
        const settleMs = typeof second === "number" ? second : typeof third === "number" ? third : undefined;
        await run("launchApp", extra);
        await runLaunchSettle(run, platform, settleMs);
        return;
      }
      const settleMs = typeof second === "number" ? second : undefined;
      await run("launchApp", extra);
      await runLaunchSettle(run, platform, settleMs);
      return;
    }

    const labels = Array.isArray(target) ? target : [target];
    for (const label of labels) {
      const handle = find(label);
      if (await handle.exists()) {
        await handle.click();
        return;
      }
    }
    throw new Error(`goto: page not found: ${JSON.stringify(target)}`);
  };
}
