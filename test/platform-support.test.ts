import assert from "node:assert/strict";
import test from "node:test";
import { isIosHostSupported, isIosUsbHostSupported, isIosWdaBootstrapSupported } from "@ada/install-deps";

test("platform-support reflects host OS", () => {
  const platform = process.platform;
  if (platform === "darwin" || platform === "win32") {
    assert.equal(isIosUsbHostSupported(), true);
    assert.equal(isIosHostSupported(), true);
  } else {
    assert.equal(isIosUsbHostSupported(), false);
    assert.equal(isIosHostSupported(), false);
  }
  assert.equal(isIosWdaBootstrapSupported(), platform === "darwin");
});
