import type { CommandEnvelope } from "@ada/contracts";
import { probeAndroidRuntime, probeIosRuntime } from "@ada/runtime-probe";
import type { InstallDepsConfig } from "./types.js";
import { probeHarmonyRuntime } from "./harmony-runtime-probe.js";

export type TaskRuntimeProbe = {
  android: { needed: boolean; ready: boolean; detail: string };
  ios: { needed: boolean; ready: boolean; detail: string };
  harmony: { needed: boolean; ready: boolean; detail: string };
};

/** 按任务平台探测运行时（不受 monitoring.platforms 影响，供 require-real / MCP 使用） */
export async function probeRuntimesForTasks(
  tasks: CommandEnvelope[],
  config: InstallDepsConfig
): Promise<TaskRuntimeProbe> {
  const needAndroid = tasks.some((t) => t.platform === "android");
  const needIos = tasks.some((t) => t.platform === "ios");
  const needHarmony = tasks.some((t) => t.platform === "harmony");

  const out: TaskRuntimeProbe = {
    android: { needed: needAndroid, ready: true, detail: "not required" },
    ios: { needed: needIos, ready: true, detail: "not required" },
    harmony: { needed: needHarmony, ready: true, detail: "not required" }
  };

  if (needAndroid) {
    const android = await probeAndroidRuntime();
    out.android = {
      needed: true,
      ready: android.adbOnPath && android.deviceConnected,
      detail: android.detail
    };
  }
  if (needIos) {
    const ios = await probeIosRuntime();
    out.ios = {
      needed: true,
      ready: ios.hostSupported && ios.xcrunOk && ios.wdaReachable,
      detail: ios.detail
    };
  }
  if (needHarmony) {
    const harmony = await probeHarmonyRuntime(config);
    out.harmony = {
      needed: true,
      ready: harmony.ready,
      detail: harmony.detail
    };
  }

  return out;
}
