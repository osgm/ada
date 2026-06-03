import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultCdpPort,
  parseCdpEndpoint,
  resolveCdpAutoLaunchPlan,
  resolveCdpBrowserFamily,
  resolveChromiumCdpUserDataDir
} from "@ada/driver-rpc";

test("parseCdpEndpoint: port shorthand", () => {
  const p = parseCdpEndpoint("9222");
  assert.equal(p.url, "http://127.0.0.1:9222");
  assert.equal(p.port, 9222);
});

test("parseCdpEndpoint: full URL", () => {
  const p = parseCdpEndpoint("http://127.0.0.1:9333");
  assert.equal(p.port, 9333);
});

test("resolveCdpBrowserFamily: firefox", () => {
  assert.equal(resolveCdpBrowserFamily({ browser: "firefox" }), "firefox");
  assert.equal(resolveCdpBrowserFamily({ browser: "chromium" }), "chromium");
});

test("defaultCdpPort: differs by browser", () => {
  assert.equal(defaultCdpPort("chromium"), 9222);
  assert.equal(defaultCdpPort("firefox"), 9223);
});

test("resolveCdpAutoLaunchPlan: autoLaunch without explicit endpoint", () => {
  const prev = process.env.ADA_PLAYWRIGHT_CDP_AUTO_LAUNCH;
  process.env.ADA_PLAYWRIGHT_CDP_AUTO_LAUNCH = "true";
  const resolved = resolveCdpAutoLaunchPlan({ browser: "firefox", headless: false });
  assert.ok(resolved);
  assert.equal(resolved?.autoLaunch, true);
  assert.equal(resolved?.browser, "firefox");
  assert.equal(resolved?.port, 9223);
  if (prev === undefined) delete process.env.ADA_PLAYWRIGHT_CDP_AUTO_LAUNCH;
  else process.env.ADA_PLAYWRIGHT_CDP_AUTO_LAUNCH = prev;
});

test("resolveCdpAutoLaunchPlan: chrome uses distinct default port from firefox", () => {
  const chrome = resolveCdpAutoLaunchPlan({ cdpAutoLaunch: true, browser: "chromium" });
  const ff = resolveCdpAutoLaunchPlan({ cdpAutoLaunch: true, browser: "firefox" });
  assert.ok(chrome && ff);
  assert.notEqual(chrome.port, ff.port);
});

test("resolveChromiumCdpUserDataDir: auto temp when omitted", () => {
  const plan = resolveCdpAutoLaunchPlan({ cdpAutoLaunch: true, browser: "chromium" });
  assert.ok(plan);
  const dir = resolveChromiumCdpUserDataDir(plan!);
  assert.ok(dir.includes("ada-cdp-chromium-"));
});

test("cleanupCdpSpawns: exported alongside cleanupAllCdpSpawns", async () => {
  const { cleanupCdpSpawns, cleanupAllCdpSpawns } = await import("@ada/driver-rpc");
  assert.equal(typeof cleanupCdpSpawns, "function");
  assert.equal(typeof cleanupAllCdpSpawns, "function");
});
