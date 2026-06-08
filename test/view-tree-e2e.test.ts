import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chromium, type Browser } from "playwright";
import { findControlByPath } from "@ada/driver-rpc";
import { executeClickPath, observeViewOnPage } from "@ada/driver-playwright";

const FIXTURE_HTML = `<!DOCTYPE html>
<html>
  <body>
    <nav role="navigation">
      <a href="/home">Home</a>
      <a href="/about">About</a>
    </nav>
    <main>
      <button type="button">Go</button>
    </main>
  </body>
</html>`;

const skipE2e = process.env.ADA_SKIP_PLAYWRIGHT_E2E === "1";

async function withBrowserPage<T>(fn: (page: Awaited<ReturnType<Browser["newPage"]>>) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(FIXTURE_HTML);
    return await fn(page);
  } finally {
    await browser.close();
  }
}

describe("viewTree playwright e2e", { skip: skipE2e }, () => {
  it("executeClickPath activates link from viewTree path", async () => {
    await withBrowserPage(async (page) => {
      const before = await observeViewOnPage(page);
      const about = findControlByPath(before.flat, ["About"]);
      assert.ok(about?.path?.length);

      const result = await executeClickPath(
        {
          requestId: "e2e-click-path",
          sessionId: "e2e-web",
          platform: "web",
          command: "recipe",
          payload: { action: "clickPath", path: about!.path, waitNavigation: false }
        },
        page,
        { action: "clickPath", path: about!.path, waitNavigation: false }
      );

      assert.equal(result.success, true);
      assert.equal((result.data as Record<string, unknown>)?.businessCode, "PATH_CLICK_OK");
      const controls = (result.data as Record<string, unknown>)?.controls;
      assert.ok(Array.isArray(controls));
      assert.ok((controls as unknown[]).length > 0);
    });
  });
});
