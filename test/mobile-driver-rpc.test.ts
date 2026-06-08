import test from "node:test";
import assert from "node:assert/strict";
import {
  extractWebDriverElementId,
  resolveMobileHttpPath,
  shouldRecoverMobileServer,
  shouldRecoverWebDriverSession
} from "@ada/driver-rpc";
import { buildWdaXcodeDestination } from "@ada/runtime-probe";

test("resolveMobileHttpPath: session-relative path", () => {
  const url = resolveMobileHttpPath("http://localhost:8100", "/element", "abc");
  assert.equal(url, "http://localhost:8100/session/abc/element");
});

test("resolveMobileHttpPath: global wda path unchanged", () => {
  const url = resolveMobileHttpPath("http://localhost:8100", "/wda/homescreen", "abc");
  assert.equal(url, "http://localhost:8100/wda/homescreen");
});

test("resolveMobileHttpPath: placeholder sessionId", () => {
  const url = resolveMobileHttpPath("http://localhost:8200", "/session/{sessionId}/source", "sid-1");
  assert.equal(url, "http://localhost:8200/session/sid-1/source");
});

test("extractWebDriverElementId: parses W3C element id", () => {
  const id = extractWebDriverElementId({ "element-6066-11e4-a52e-4f735466cecf": "elem-1" });
  assert.equal(id, "elem-1");
});

test("buildWdaXcodeDestination: simulator fallback", () => {
  assert.match(buildWdaXcodeDestination(""), /iOS Simulator/);
  assert.equal(buildWdaXcodeDestination("ABCD-1234"), "id=ABCD-1234");
});

test("shouldRecoverMobileServer: detects connection failure", () => {
  assert.equal(shouldRecoverMobileServer({ ok: false, status: 0, raw: {}, text: "fetch failed" }), true);
  assert.equal(shouldRecoverMobileServer({ ok: false, status: 503, raw: {}, text: "Service Unavailable" }), true);
  assert.equal(shouldRecoverMobileServer({ ok: true, status: 200, raw: { value: {} }, text: "{}" }), false);
});

test("shouldRecoverWebDriverSession: detects invalid session", () => {
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
