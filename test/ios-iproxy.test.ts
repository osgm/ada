import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultWdaLocalPort,
  isIosIproxyHostSupported,
  resolveWdaLocalPortForUdid,
  wdaServerUrlForLocalPort
} from "@ada/runtime-probe";
import {
  isIosHostSupported,
  isIosUsbHostSupported,
  isIosWdaBootstrapSupported
} from "@ada/install-deps";

test("resolveWdaLocalPortForUdid reads ADA_IOS_WDA_PORT_MAP", () => {
  const prev = process.env.ADA_IOS_WDA_PORT_MAP;
  process.env.ADA_IOS_WDA_PORT_MAP = "AAAA-BBBB-CCCC:8101,DDDD-EEEE-FFFF:8102";
  try {
    assert.equal(resolveWdaLocalPortForUdid("aaaa-bbbb-cccc"), 8101);
    assert.equal(resolveWdaLocalPortForUdid("DDDD-EEEE-FFFF"), 8102);
    assert.equal(resolveWdaLocalPortForUdid("unknown-udid"), defaultWdaLocalPort());
  } finally {
    if (prev === undefined) delete process.env.ADA_IOS_WDA_PORT_MAP;
    else process.env.ADA_IOS_WDA_PORT_MAP = prev;
  }
});

test("wdaServerUrlForLocalPort", () => {
  assert.equal(wdaServerUrlForLocalPort(8100), "http://127.0.0.1:8100");
  assert.equal(wdaServerUrlForLocalPort(8101), "http://127.0.0.1:8101");
});

test("isIosIproxyHostSupported on darwin and win32", () => {
  const platform = process.platform;
  if (platform === "darwin" || platform === "win32") {
    assert.equal(isIosIproxyHostSupported(), true);
    assert.equal(isIosHostSupported(), true);
    assert.equal(isIosUsbHostSupported(), true);
  }
  if (platform === "win32") {
    assert.equal(isIosWdaBootstrapSupported(), false);
  }
  if (platform === "darwin") {
    assert.equal(isIosWdaBootstrapSupported(), true);
  }
});
