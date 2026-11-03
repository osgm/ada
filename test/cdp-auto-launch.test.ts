import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateFreeTcpPort,
  defaultCdpPort,
  parseCdpEndpoint,
  reserveFreeTcpPort,
  resolveCdpAutoLaunchPlan,
  resolveCdpBrowserFamily,
  resolveChromiumCdpUserDataDir,
  resolveShareCdpBrowser,
  tryReserveTcpPort,
  withCdpPlanPort
} from "@ada/driver-rpc";
import net from "node:net";

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

test("resolveShareCdpBrowser: default false for autoLaunch; attach-only shares", () => {
  assert.equal(resolveShareCdpBrowser({ cdpAutoLaunch: true }), false);
  assert.equal(resolveShareCdpBrowser({ cdpEndpoint: "http://127.0.0.1:9222" }), true);
  assert.equal(resolveShareCdpBrowser({ cdpAutoLaunch: true, shareCdpBrowser: true }), true);
  assert.equal(resolveShareCdpBrowser({ cdpAutoLaunch: true, shareCdpBrowser: false }), false);
});

test("resolveCdpAutoLaunchPlan: shareExisting follows shareCdpBrowser", () => {
  const dedicated = resolveCdpAutoLaunchPlan({ cdpAutoLaunch: true });
  assert.ok(dedicated);
  assert.equal(dedicated!.shareExisting, false);
  const shared = resolveCdpAutoLaunchPlan({ cdpAutoLaunch: true, shareCdpBrowser: true });
  assert.ok(shared);
  assert.equal(shared!.shareExisting, true);
});

test("withCdpPlanPort + allocateFreeTcpPort for concurrent isolation", async () => {
  const plan = resolveCdpAutoLaunchPlan({ cdpAutoLaunch: true, browser: "chromium" });
  assert.ok(plan);
  const a = await allocateFreeTcpPort();
  const b = await allocateFreeTcpPort();
  assert.notEqual(a, b);
  const next = withCdpPlanPort(plan!, a);
  assert.equal(next.port, a);
  assert.equal(next.url, `http://127.0.0.1:${a}`);
  assert.equal(next.shareExisting, false);
});

test("tryReserveTcpPort: occupied port returns null; free port holds until release", async () => {
  const holder = await reserveFreeTcpPort();
  try {
    const again = await tryReserveTcpPort(holder.port);
    assert.equal(again, null);
  } finally {
    await holder.release();
  }
  const reserved = await tryReserveTcpPort(holder.port);
  assert.ok(reserved);
  assert.equal(reserved!.port, holder.port);
  await reserved!.release();
  // confirm port is free again
  await new Promise<void>((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(holder.port, "127.0.0.1", () => {
      s.close(() => resolve());
    });
  });
});

test("resolvePlaywrightMaxBrowsers defaults to 20", async () => {
  const { DEFAULT_PLAYWRIGHT_MAX_BROWSERS, resolvePlaywrightMaxBrowsers } = await import("@ada/driver-rpc");
  const prev = process.env.ADA_PLAYWRIGHT_MAX_BROWSERS;
  delete process.env.ADA_PLAYWRIGHT_MAX_BROWSERS;
  try {
    assert.equal(DEFAULT_PLAYWRIGHT_MAX_BROWSERS, 20);
    assert.equal(resolvePlaywrightMaxBrowsers(), 20);
    process.env.ADA_PLAYWRIGHT_MAX_BROWSERS = "0";
    assert.equal(resolvePlaywrightMaxBrowsers(), 0);
    process.env.ADA_PLAYWRIGHT_MAX_BROWSERS = "8";
    assert.equal(resolvePlaywrightMaxBrowsers(), 8);
  } finally {
    if (prev === undefined) delete process.env.ADA_PLAYWRIGHT_MAX_BROWSERS;
    else process.env.ADA_PLAYWRIGHT_MAX_BROWSERS = prev;
  }
});
