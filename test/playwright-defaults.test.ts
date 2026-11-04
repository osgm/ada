import test from "node:test";
import assert from "node:assert/strict";
import {
  applyPlaywrightMaximizeDefaults,
  resolvePlaywrightBringToFront,
  resolvePlaywrightEffectiveDefaults,
  resolvePlaywrightHeadless,
  resolvePlaywrightMaximize
} from "@ada/driver-rpc";

test("resolvePlaywrightHeadless: default visible (headed)", () => {
  const prev = process.env.ADA_PLAYWRIGHT_HEADLESS;
  delete process.env.ADA_PLAYWRIGHT_HEADLESS;
  assert.equal(resolvePlaywrightHeadless({}), false);
  assert.equal(resolvePlaywrightHeadless({ headless: true }), true);
  process.env.ADA_PLAYWRIGHT_HEADLESS = "true";
  assert.equal(resolvePlaywrightHeadless({}), true);
  if (prev === undefined) delete process.env.ADA_PLAYWRIGHT_HEADLESS;
  else process.env.ADA_PLAYWRIGHT_HEADLESS = prev;
});

test("resolvePlaywrightBringToFront: default true", () => {
  assert.equal(resolvePlaywrightBringToFront({}), true);
  assert.equal(resolvePlaywrightBringToFront({ bringToFront: false }), false);
});

test("resolvePlaywrightMaximize: default true when headed", () => {
  const prevHeadless = process.env.ADA_PLAYWRIGHT_HEADLESS;
  const prevMax = process.env.ADA_PLAYWRIGHT_MAXIMIZE;
  delete process.env.ADA_PLAYWRIGHT_HEADLESS;
  delete process.env.ADA_PLAYWRIGHT_MAXIMIZE;
  try {
    assert.equal(resolvePlaywrightMaximize({}), true);
    assert.equal(resolvePlaywrightMaximize({ maximize: false }), false);
    assert.equal(resolvePlaywrightMaximize({ headless: true }), false);
    assert.equal(resolvePlaywrightMaximize({ windowState: "normal" }), false);
    process.env.ADA_PLAYWRIGHT_MAXIMIZE = "0";
    assert.equal(resolvePlaywrightMaximize({}), false);
  } finally {
    if (prevHeadless === undefined) delete process.env.ADA_PLAYWRIGHT_HEADLESS;
    else process.env.ADA_PLAYWRIGHT_HEADLESS = prevHeadless;
    if (prevMax === undefined) delete process.env.ADA_PLAYWRIGHT_MAXIMIZE;
    else process.env.ADA_PLAYWRIGHT_MAXIMIZE = prevMax;
  }
});

test("resolvePlaywrightEffectiveDefaults: local vs ci profiles", () => {
  const prevHeadless = process.env.ADA_PLAYWRIGHT_HEADLESS;
  const prevMax = process.env.ADA_PLAYWRIGHT_MAXIMIZE;
  delete process.env.ADA_PLAYWRIGHT_HEADLESS;
  delete process.env.ADA_PLAYWRIGHT_MAXIMIZE;
  try {
    assert.equal(resolvePlaywrightEffectiveDefaults({}).profile, "local-headed");
    assert.equal(resolvePlaywrightEffectiveDefaults({}).viewportMode, "window");
    assert.equal(resolvePlaywrightEffectiveDefaults({ headless: true }).profile, "ci-headless");
    assert.equal(resolvePlaywrightEffectiveDefaults({ maximize: false }).profile, "headed-no-maximize");
  } finally {
    if (prevHeadless === undefined) delete process.env.ADA_PLAYWRIGHT_HEADLESS;
    else process.env.ADA_PLAYWRIGHT_HEADLESS = prevHeadless;
    if (prevMax === undefined) delete process.env.ADA_PLAYWRIGHT_MAXIMIZE;
    else process.env.ADA_PLAYWRIGHT_MAXIMIZE = prevMax;
  }
});

test("applyPlaywrightMaximizeDefaults: viewport null + start-maximized", () => {
  const prevHeadless = process.env.ADA_PLAYWRIGHT_HEADLESS;
  const prevMax = process.env.ADA_PLAYWRIGHT_MAXIMIZE;
  delete process.env.ADA_PLAYWRIGHT_HEADLESS;
  delete process.env.ADA_PLAYWRIGHT_MAXIMIZE;
  try {
    const applied = applyPlaywrightMaximizeDefaults({});
    assert.equal((applied.contextOptions as { viewport?: unknown }).viewport, null);
    assert.ok(
      ((applied.launchOptions as { args?: string[] }).args ?? []).some((a) => /start-maximized/i.test(a))
    );

    const keepViewport = applyPlaywrightMaximizeDefaults({
      contextOptions: { viewport: { width: 800, height: 600 } }
    });
    assert.deepEqual((keepViewport.contextOptions as { viewport: unknown }).viewport, {
      width: 800,
      height: 600
    });

    const off = applyPlaywrightMaximizeDefaults({ maximize: false });
    assert.equal(off.contextOptions, undefined);
  } finally {
    if (prevHeadless === undefined) delete process.env.ADA_PLAYWRIGHT_HEADLESS;
    else process.env.ADA_PLAYWRIGHT_HEADLESS = prevHeadless;
    if (prevMax === undefined) delete process.env.ADA_PLAYWRIGHT_MAXIMIZE;
    else process.env.ADA_PLAYWRIGHT_MAXIMIZE = prevMax;
  }
});
