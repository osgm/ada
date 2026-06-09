import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chromium, type Browser } from "playwright";
import { executeFillSearch } from "@ada/driver-playwright";

const FIXTURE_HTML = `<!DOCTYPE html>
<html>
  <body>
    <header>
      <button type="button" aria-label="搜索">Search</button>
    </header>
    <main>
      <input type="search" placeholder="请输入关键词" aria-label="搜索框" />
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

describe("web fill_search playwright e2e", { skip: skipE2e }, () => {
  it("executeFillSearch fills visible search input", async () => {
    await withBrowserPage(async (page) => {
      const result = await executeFillSearch(
        {
          requestId: "e2e-fill-search",
          sessionId: "e2e-web",
          platform: "web",
          command: "recipe",
          payload: { action: "fill_search", text: "手机" }
        },
        page,
        { action: "fill_search", text: "手机", inputHints: ["请输入", "搜索"] }
      );

      assert.equal(result.success, true);
      assert.equal((result.data as Record<string, unknown>)?.businessCode, "FILL_SEARCH_OK");
      const value = await page.locator('input[type="search"]').inputValue();
      assert.equal(value, "手机");
    });
  });

  it("executeFillSearch taps entry then fills input", async () => {
    const html = `<!DOCTYPE html>
<html><body>
  <button id="entry">搜索</button>
  <input id="q" type="text" placeholder="请输入" style="display:none" />
  <script>
    document.getElementById('entry').addEventListener('click', () => {
      const input = document.getElementById('q');
      input.style.display = 'block';
      input.focus();
    });
  </script>
</body></html>`;

    await withBrowserPage(async (page) => {
      await page.setContent(html);
      const result = await executeFillSearch(
        {
          requestId: "e2e-fill-search-entry",
          sessionId: "e2e-web",
          platform: "web",
          command: "recipe",
          payload: { action: "fill_search", text: "abc", entryHints: ["搜索"], inputHints: ["请输入"] }
        },
        page,
        { action: "fill_search", text: "abc", entryHints: ["搜索"], inputHints: ["请输入"] }
      );

      assert.equal(result.success, true);
      assert.equal((result.data as Record<string, unknown>)?.mode, "entryTap");
      const value = await page.locator("#q").inputValue();
      assert.equal(value, "abc");
    });
  });
});
