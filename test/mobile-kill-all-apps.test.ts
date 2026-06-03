import assert from "node:assert/strict";
import test from "node:test";
import {
  isSystemBundle,
  parseAndroidKillPids,
  parseHarmonyKillPids,
  parseHarmonyRunningBundles,
  parseUserBundleIdsFromText
} from "../scripts/lib/mobile-kill-all-apps.mjs";

test("parseUserBundleIdsFromText: ps line with user app", () => {
  const text = `
  u0_a123  12345  com.jd.hm.mall  com.jd.hm.mall
  system   1     com.ohos.systemui
  `;
  const pkgs = parseUserBundleIdsFromText(text, "harmony");
  assert.ok(pkgs.includes("com.jd.hm.mall"));
  assert.ok(!pkgs.some((p) => p.startsWith("com.ohos.")));
});

test("parseHarmonyKillPids: skip system_server and zygote", () => {
  const text = `
USER PID PPID
shell 1001 1 com.jd.hm.mall
system 50 1 system_server
root 2 0 zygote
app 2002 1 com.example.demo
  `;
  const pids = parseHarmonyKillPids(text);
  assert.deepEqual(pids, ["1001", "2002"]);
});

test("parseHarmonyKillPids: OpenHarmony ps PID in first column", () => {
  const text = `
   PID TTY          TIME CMD
  5601 ?        00:01:18 com.jd.hm.mall
  7269 ?        00:00:00 .hm.mall:render
  470 ?        00:01:25 hguard.elf
    50 ?        00:00:01 system_server
  `;
  const pids = parseHarmonyKillPids(text);
  assert.deepEqual(pids, ["5601"]);
});

test("parseAndroidKillPids: skip zygote64 and low pid", () => {
  const text = `
USER PID PPID
u0_a1  5100  1234 com.jingdong.app.mall
root   2     0   zygote64
system 1000  1   system_server
  `;
  const pids = parseAndroidKillPids(text);
  assert.deepEqual(pids, ["5100"]);
});

test("parseHarmonyRunningBundles: OpenHarmony ps lines", () => {
  const text = `
   PID TTY          TIME CMD
  5601 ?        00:01:18 com.jd.hm.mall
  470 ?        00:01:25 hguard.elf
  `;
  assert.deepEqual(parseHarmonyRunningBundles(text), ["com.jd.hm.mall"]);
  assert.deepEqual(parseHarmonyRunningBundles(text, { excludePackages: ["com.jd.hm.mall"] }), []);
});

test("parseHarmonyKillPids: excludePackages by line match", () => {
  const text = "u0 3001 1 com.jd.hm.mall\nu0 3002 1 com.other.app\n";
  const pids = parseHarmonyKillPids(text, { excludePackages: ["com.jd.hm.mall"] });
  assert.deepEqual(pids, ["3002"]);
});

test("isSystemBundle: android vs harmony prefixes", () => {
  assert.equal(isSystemBundle("com.android.systemui", "android"), true);
  assert.equal(isSystemBundle("com.jingdong.app.mall", "android"), false);
  assert.equal(isSystemBundle("com.ohos.settings", "harmony"), true);
  assert.equal(isSystemBundle("com.jd.hm.mall", "harmony"), false);
});
