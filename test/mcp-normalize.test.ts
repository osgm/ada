import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeCommand,
  normalizePlatform,
  requireMobilePlatform
} from "../apps/ada-mcp-server/src/mcp-normalize.ts";

describe("mcp-normalize", () => {
  it("normalizePlatform requires explicit value by default", () => {
    assert.throws(() => normalizePlatform(undefined), /platform is required/);
    assert.throws(() => normalizePlatform("andriod"), /invalid platform/);
    assert.equal(normalizePlatform("android"), "android");
  });

  it("normalizePlatform allowDefaultWeb only when opted in", () => {
    assert.equal(normalizePlatform(undefined, { allowDefaultWeb: true }), "web");
    assert.throws(() => normalizePlatform("bogus", { allowDefaultWeb: true }), /invalid platform/);
  });

  it("normalizeCommand rejects missing and invalid commands", () => {
    assert.throws(() => normalizeCommand(undefined), /command is required/);
    assert.throws(() => normalizeCommand("clik"), /invalid command/);
    assert.equal(normalizeCommand("click"), "click");
  });

  it("normalizeCommand maps deprecated aliases", () => {
    assert.equal(normalizeCommand("terminateApp"), "exitApp");
    assert.equal(normalizeCommand("fill"), "type");
    assert.equal(normalizeCommand("home"), "pressHome");
    assert.equal(normalizeCommand("recipe"), "recipe");
  });

  it("requireMobilePlatform rejects web", () => {
    assert.throws(() => requireMobilePlatform("web"), /mobile platform is required/);
    assert.equal(requireMobilePlatform("harmony"), "harmony");
  });
});
