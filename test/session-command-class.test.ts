import assert from "node:assert/strict";
import test from "node:test";
import { isSessionReadOnlyCommand } from "@ada/driver-rpc";

test("isSessionReadOnlyCommand: core reads and dumps", () => {
  assert.equal(isSessionReadOnlyCommand({ command: "wait", payload: {} }), true);
  assert.equal(isSessionReadOnlyCommand({ command: "screenshot", payload: {} }), true);
  assert.equal(isSessionReadOnlyCommand({ command: "getText", payload: {} }), true);
  assert.equal(isSessionReadOnlyCommand({ command: "click", payload: {} }), false);
  assert.equal(
    isSessionReadOnlyCommand({ command: "recipe", payload: { action: "dump_ui" } }),
    true
  );
  assert.equal(
    isSessionReadOnlyCommand({ command: "recipe", payload: { action: "fill_search" } }),
    false
  );
  assert.equal(
    isSessionReadOnlyCommand({ command: "deviceAdmin", payload: { action: "listApps" } }),
    true
  );
  assert.equal(
    isSessionReadOnlyCommand({ command: "deviceAdmin", payload: { action: "shell" } }),
    false
  );
});
