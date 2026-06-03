/**
 * 京东 Web — LLM + ada-mcp（四场景，与 jd-e2e.mjs 逐步一致）
 * 运行：npm run test:jd-web:mcp
 */
import { dir, open, browser, by, wait, exit } from "../../../lib/ada-client.mjs";

const MCP = {
  connect: "mcp",
  mcpOptions: {
    name: "jd-mcp-web",
    env: { ADA_PLAYWRIGHT_HEADLESS: "false" }
  }
};

const OUT = "artifacts/examples/nodejs/web";
const HOME_URL = "https://www.jd.com";
const SEARCH_TEXT = "ABC";
const JD_SEARCH_CSS =
  "input#key, input[name='keyword']:not([type='file']), .form input[type='text'], input[placeholder*='搜索']";
const WEB_WINDOW = {
  maximize: true,
  launchOptions: { args: ["--start-maximized", "--window-position=0,0", "--window-size=1920,1080"] },
  contextOptions: { viewport: null }
};
/** Web 支持 open(browser(...)) 与 open(device({ type: "chrome", ... }))；第二参 { connect: "mcp" } 自动连 MCP */
const WEB_MCP_SESSION = {
  headless: false,
  waitTimeoutMs: 8_000,
  commandTimeoutMs: 90_000
};

/** 新 Tab + 关弹窗 + 搜索（场景 3/4 共用，避开首屏 login2025 弹窗） */
async function runWebSearchFlow(page, shotPath) {
  await page.goto(HOME_URL);
  await page.newTab(HOME_URL);
  await wait(3000);
  await page.dismissPopups({ timeoutMs: 5000, attempts: 4 });
  await wait(1500);
  let searchBox = page.find(by.css(JD_SEARCH_CSS));
  if (!(await searchBox.exists())) searchBox = page.find(by.placeholder("搜索"));
  try {
    await searchBox.click();
  } catch {
    await page.dismissPopups({ timeoutMs: 5000, attempts: 4 });
    await wait(600);
    searchBox = page.find(by.css(JD_SEARCH_CSS));
    if (!(await searchBox.exists())) searchBox = page.find(by.placeholder("搜索"));
    await searchBox.click();
  }
  await searchBox.fill(SEARCH_TEXT);
  await page.keyboard.press("Enter");
  await wait(2000);
  await page.screenshot(shotPath);
}

async function main() {
  await dir(OUT);

  console.log("[1] 打开谷歌浏览器，截图后退出");
  let page = await open(
    browser({ sessionId: "jd-web-mcp-1", type: "chrome", ...WEB_WINDOW, ...WEB_MCP_SESSION }),
    MCP
  );
  await page.goto(HOME_URL);
  await page.screenshot(`${OUT}/01-chrome-mcp.png`);
  await page.close();

  console.log("[2] 使用本地浏览器缓存打开 Chrome，截图后退出");
  page = await open(
    browser({
      sessionId: "jd-web-mcp-2",
      type: "chrome",
      profile: `${OUT}/chrome-profile`,
      ...WEB_WINDOW,
      ...WEB_MCP_SESSION
    }),
    MCP
  );
  await page.goto(HOME_URL);
  await page.screenshot(`${OUT}/02-profile-mcp.png`);
  await page.close();

  console.log("[3] 新 Tab 打开首页，关弹窗，搜索，截图，关 Tab，退出");
  page = await open(
    browser({ sessionId: "jd-web-mcp-3", type: "chrome", ...WEB_WINDOW, ...WEB_MCP_SESSION }),
    MCP
  );
  try {
    await runWebSearchFlow(page, `${OUT}/03-tab-search-mcp.png`);
    await page.closeTab();
  } finally {
    await page.close().catch(() => undefined);
  }

  console.log("[4] CDP 模式打开首页，关弹窗，搜索，截图后退出");
  page = await open(
    browser({ sessionId: "jd-web-mcp-4", type: "chrome", cdp: true, ...WEB_WINDOW, ...WEB_MCP_SESSION }),
    MCP
  );
  try {
    await runWebSearchFlow(page, `${OUT}/04-cdp-search-mcp.png`);
  } finally {
    await page.close().catch(() => undefined);
  }

  console.log("\n完成 →", OUT);
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await exit();
  });
