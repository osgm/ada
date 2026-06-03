import test from "node:test";
import assert from "node:assert/strict";
import { UiDumpCache } from "@ada/driver-rpc";

test("UiDumpCache: getOrLoad caches result", async () => {
  const cache = new UiDumpCache(5000);
  let loads = 0;
  const raw = await cache.getOrLoad(async () => {
    loads += 1;
    return "<xml/>";
  });
  assert.equal(raw, "<xml/>");
  assert.equal(loads, 1);
  await cache.getOrLoad(async () => {
    loads += 1;
    return "<xml2/>";
  });
  assert.equal(loads, 1);
});

test("UiDumpCache: invalidate forces reload", async () => {
  const cache = new UiDumpCache(5000);
  let loads = 0;
  await cache.getOrLoad(async () => {
    loads += 1;
    return "a";
  });
  cache.invalidate();
  await cache.getOrLoad(async () => {
    loads += 1;
    return "b";
  });
  assert.equal(loads, 2);
});
