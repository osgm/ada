import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultUia2ServerUrl,
  probeAndroidUia2Runtime,
  resolveUia2UrlAfterForward,
  uia2ServerUrlForLocalPort
} from "@ada/runtime-probe";

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
