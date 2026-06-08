import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultWdaLocalHost,
  defaultWdaLocalPort,
  hasExplicitWdaServerUrlEnv,
  isIosIproxyHostSupported,
  loopbackHostsForProbe,
  resolveWdaLocalPortForUdid,
  resolveWdaUrlAfterForward,
  syncWdaServerUrlEnv,
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

test("wdaServerUrlForLocalPort defaults to localhost", () => {
  const prevHost = process.env.ADA_IOS_LOCAL_HOST;
  const prevWda = process.env.ADA_WDA_SERVER_URL;
  delete process.env.ADA_IOS_LOCAL_HOST;
  delete process.env.ADA_WDA_SERVER_URL;
  try {
    assert.equal(wdaServerUrlForLocalPort(8100), "http://localhost:8100");
    assert.equal(wdaServerUrlForLocalPort(8101), "http://localhost:8101");
  } finally {
    if (prevHost === undefined) delete process.env.ADA_IOS_LOCAL_HOST;
    else process.env.ADA_IOS_LOCAL_HOST = prevHost;
    if (prevWda === undefined) delete process.env.ADA_WDA_SERVER_URL;
    else process.env.ADA_WDA_SERVER_URL = prevWda;
  }
});

test("defaultWdaLocalHost respects ADA_IOS_LOCAL_HOST and ADA_WDA_SERVER_URL", () => {
  const prevHost = process.env.ADA_IOS_LOCAL_HOST;
  const prevWda = process.env.ADA_WDA_SERVER_URL;
  try {
    process.env.ADA_IOS_LOCAL_HOST = "127.0.0.1";
    assert.equal(defaultWdaLocalHost(), "127.0.0.1");
    delete process.env.ADA_IOS_LOCAL_HOST;
    process.env.ADA_WDA_SERVER_URL = "http://localhost:8200";
    assert.equal(defaultWdaLocalHost(), "localhost");
  } finally {
    if (prevHost === undefined) delete process.env.ADA_IOS_LOCAL_HOST;
    else process.env.ADA_IOS_LOCAL_HOST = prevHost;
    if (prevWda === undefined) delete process.env.ADA_WDA_SERVER_URL;
    else process.env.ADA_WDA_SERVER_URL = prevWda;
  }
});

test("loopbackHostsForProbe includes localhost and 127.0.0.1 aliases", () => {
  assert.deepEqual(loopbackHostsForProbe("localhost"), ["localhost", "127.0.0.1"]);
  assert.deepEqual(loopbackHostsForProbe("127.0.0.1"), ["127.0.0.1", "localhost"]);
});

test("syncWdaServerUrlEnv does not override explicit ADA_WDA_SERVER_URL", () => {
  const prev = process.env.ADA_WDA_SERVER_URL;
  process.env.ADA_WDA_SERVER_URL = "http://localhost:8100";
  try {
    assert.equal(hasExplicitWdaServerUrlEnv(), true);
    syncWdaServerUrlEnv("http://127.0.0.1:8100");
    assert.equal(process.env.ADA_WDA_SERVER_URL, "http://localhost:8100");
    assert.equal(resolveWdaUrlAfterForward({ localPort: 8100, serverUrl: "http://127.0.0.1:8100" }), "http://localhost:8100");
  } finally {
    if (prev === undefined) delete process.env.ADA_WDA_SERVER_URL;
    else process.env.ADA_WDA_SERVER_URL = prev;
  }
});

test("syncWdaServerUrlEnv fills env when unset", () => {
  const prev = process.env.ADA_WDA_SERVER_URL;
  delete process.env.ADA_WDA_SERVER_URL;
  try {
    syncWdaServerUrlEnv("http://localhost:8105");
    assert.equal(process.env.ADA_WDA_SERVER_URL, "http://localhost:8105");
  } finally {
    if (prev === undefined) delete process.env.ADA_WDA_SERVER_URL;
    else process.env.ADA_WDA_SERVER_URL = prev;
  }
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

