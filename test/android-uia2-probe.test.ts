import test from "node:test";
import assert from "node:assert/strict";
import { resolveMobileHttpPath } from "@ada/driver-rpc";
import {
  defaultUia2ServerUrl,
  probeAndroidUia2Runtime,
  resolveUia2UrlAfterForward,
  uia2ServerUrlForLocalPort
} from "@ada/runtime-probe";

test("resolveMobileHttpPath: session-relative path", () => {
  const url = resolveMobileHttpPath("http://127.0.0.1:8100", "/element", "abc");
  assert.equal(url, "http://127.0.0.1:8100/session/abc/element");
});

test("resolveMobileHttpPath: global wda path unchanged", () => {
  const url = resolveMobileHttpPath("http://127.0.0.1:8100", "/wda/homescreen", "abc");
  assert.equal(url, "http://127.0.0.1:8100/wda/homescreen");
});

test("resolveMobileHttpPath: placeholder sessionId", () => {
  const url = resolveMobileHttpPath("http://127.0.0.1:8200", "/session/{sessionId}/source", "sid-1");
  assert.equal(url, "http://127.0.0.1:8200/session/sid-1/source");
});

test("probeAndroidUia2Runtime: returns structured detail without device", async () => {
  const probe = await probeAndroidUia2Runtime({ serverUrl: "http://127.0.0.1:59999", ensureForward: false });
  assert.equal(typeof probe.detail, "string");
  assert.equal(probe.serverUrl, "http://127.0.0.1:59999");
  assert.equal(probe.reachable, false);
});

test("uia2ServerUrlForLocalPort defaults to localhost", () => {
  const prevHost = process.env.ADA_ANDROID_LOCAL_HOST;
  const prevUrl = process.env.ADA_ANDROID_UIA2_SERVER_URL;
  delete process.env.ADA_ANDROID_LOCAL_HOST;
  delete process.env.ADA_ANDROID_UIA2_SERVER_URL;
  try {
    assert.equal(uia2ServerUrlForLocalPort(8200), "http://localhost:8200");
  } finally {
    if (prevHost === undefined) delete process.env.ADA_ANDROID_LOCAL_HOST;
    else process.env.ADA_ANDROID_LOCAL_HOST = prevHost;
    if (prevUrl === undefined) delete process.env.ADA_ANDROID_UIA2_SERVER_URL;
    else process.env.ADA_ANDROID_UIA2_SERVER_URL = prevUrl;
  }
});

test("resolveUia2UrlAfterForward: uses local port when env unset", () => {
  const prevUrl = process.env.ADA_ANDROID_UIA2_SERVER_URL;
  delete process.env.ADA_ANDROID_UIA2_SERVER_URL;
  try {
    assert.equal(resolveUia2UrlAfterForward({ localPort: 8200 }), "http://localhost:8200");
    assert.equal(resolveUia2UrlAfterForward({ localPort: 8200 }, "http://10.0.0.3:8200"), "http://10.0.0.3:8200");
  } finally {
    if (prevUrl === undefined) delete process.env.ADA_ANDROID_UIA2_SERVER_URL;
    else process.env.ADA_ANDROID_UIA2_SERVER_URL = prevUrl;
  }
});

test("defaultUia2ServerUrl: env override", () => {
  const prev = process.env.ADA_ANDROID_UIA2_SERVER_URL;
  process.env.ADA_ANDROID_UIA2_SERVER_URL = "http://10.0.0.2:8200/";
  assert.equal(defaultUia2ServerUrl(), "http://10.0.0.2:8200");
  if (prev === undefined) delete process.env.ADA_ANDROID_UIA2_SERVER_URL;
  else process.env.ADA_ANDROID_UIA2_SERVER_URL = prev;
});

test("extractWebDriverElementId: parses W3C element id", async () => {
  const { extractWebDriverElementId } = await import("@ada/driver-rpc");
  const id = extractWebDriverElementId({ "element-6066-11e4-a52e-4f735466cecf": "elem-1" });
  assert.equal(id, "elem-1");
});

test("buildWdaXcodeDestination: simulator fallback", async () => {
  const { buildWdaXcodeDestination } = await import("@ada/runtime-probe");
  assert.match(buildWdaXcodeDestination(""), /iOS Simulator/);
  assert.equal(buildWdaXcodeDestination("ABCD-1234"), "id=ABCD-1234");
});

test("shouldRecoverMobileServer: detects connection failure", async () => {
  const { shouldRecoverMobileServer } = await import("@ada/driver-rpc");
  assert.equal(shouldRecoverMobileServer({ ok: false, status: 0, raw: {}, text: "fetch failed" }), true);
  assert.equal(shouldRecoverMobileServer({ ok: false, status: 503, raw: {}, text: "Service Unavailable" }), true);
  assert.equal(shouldRecoverMobileServer({ ok: true, status: 200, raw: { value: {} }, text: "{}" }), false);
});

test("shouldRecoverWebDriverSession: detects invalid session", async () => {
  const { shouldRecoverWebDriverSession } = await import("@ada/driver-rpc");
  assert.equal(shouldRecoverWebDriverSession({ ok: false, status: 404, raw: {}, text: "" }), true);
  assert.equal(
    shouldRecoverWebDriverSession({
      ok: false,
      status: 500,
      raw: { value: { error: "invalid session id" } },
      text: ""
    }),
    true
  );
  assert.equal(
    shouldRecoverWebDriverSession({ ok: true, status: 200, raw: { value: { sessionId: "x" } }, text: "{}" }),
    false
  );
});
