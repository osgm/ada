import type { CommandEnvelope, CommandResult } from "@ada/contracts";
import type { DriverSession } from "@ada/plugin-sdk";
import { getString, serializeRpcResult } from "@ada/driver-rpc";
import fs from "node:fs/promises";
import path from "node:path";
import {
  autoWaitEnabled,
  autoWaitLocator,
  locatorFromPayload,
  resolveAutoWaitMs,
  summarizeLocator
} from "../playwright-locator.js";
import { executeClickPath, executeFillSearch, waitAfterNavigation } from "../web-interaction-recipe.js";
import { gotoPage } from "../web-navigation.js";
import { executeDismissPopups } from "../web-dismiss-popups.js";
import {
  asRecord,
  ensurePlaywrightSession,
  executePlaywrightInvoke,
  failResult,
  failWithPage,
  focusVisibleBrowser,
  getNumber,
  getStringArray,
  isRecoverableInteractionError,
  isTypeClearOp,
  LOCATOR_FORMAT_HINT,
  getPlaywrightSession,
  mergeWithLaunchDefaults,
  releasePlaywrightDriverSession,
  runMock
} from "../runtime.js";

export async function executePlaywrightCommand(session: DriverSession, command: CommandEnvelope): Promise<CommandResult> {
    const cmd = command.command;
    const payload = command.payload;
    const forceMock = Boolean(payload?.mock);
    if (forceMock) {
      return runMock(command, "payload.mock=true");
    }

    if (cmd === "invoke") {
    try {
      const pw = await ensurePlaywrightSession(session, payload);
      await focusVisibleBrowser(pw, payload);
      return await executePlaywrightInvoke(command, pw, payload);
      } catch (error) {
        if (!isRecoverableInteractionError(error)) {
          await releasePlaywrightDriverSession(session.id);
        }
        return failResult(command, "INVOKE_FAILED", error instanceof Error ? error.message : String(error));
      }
    }

    try {
      const pw = await ensurePlaywrightSession(session, payload);
      const effective = mergeWithLaunchDefaults(pw, payload);
      await focusVisibleBrowser(pw, effective);
      const page = pw.page;
      const url = getString(effective?.url);
      const locator = locatorFromPayload(page, effective);
      const waitMs = resolveAutoWaitMs(effective);

      if (cmd === "navigate") {
        if (!url) {
          return failResult(command, "INVALID_PAYLOAD", "navigate requires url");
        }
        await gotoPage(page, url, effective);
        await focusVisibleBrowser(pw, effective);
      } else if (command.command === "click") {
        if (!locator) {
          return await failWithPage(command, page, "LOCATOR_NOT_FOUND", `click requires locator. ${LOCATOR_FORMAT_HINT}`, {
            locatorUsed: summarizeLocator(effective?.locator ?? effective?.selector),
            locatorHint: LOCATOR_FORMAT_HINT
          });
        }
        await autoWaitEnabled(locator, waitMs);
        const beforeClickUrl = page.url();
        await locator.click({ timeout: waitMs });
        await waitAfterNavigation(page, effective, beforeClickUrl);
      } else if (command.command === "hover") {
        if (!locator) {
          return await failWithPage(command, page, "LOCATOR_NOT_FOUND", `hover requires locator. ${LOCATOR_FORMAT_HINT}`, {
            locatorUsed: summarizeLocator(effective?.locator ?? effective?.selector),
            locatorHint: LOCATOR_FORMAT_HINT
          });
        }
        await autoWaitEnabled(locator, waitMs);
        await locator.hover({ timeout: waitMs });
      } else if (command.command === "type") {
        if (!locator) {
          return await failWithPage(command, page, "LOCATOR_NOT_FOUND", `type requires locator. ${LOCATOR_FORMAT_HINT}`, {
            locatorUsed: summarizeLocator(effective?.locator ?? effective?.selector),
            locatorHint: LOCATOR_FORMAT_HINT
          });
        }
        await autoWaitEnabled(locator, waitMs);
        if (isTypeClearOp(payload)) {
          await locator.clear({ timeout: waitMs });
        } else {
          const text = getString(payload?.text) ?? "";
          await locator.fill(text, { timeout: waitMs });
        }
      } else if (command.command === "press") {
        const key = getString(payload?.key);
        if (!key) {
          return failResult(command, "INVALID_PAYLOAD", "press requires key");
        }
        if (locator) {
          await locator.press(key);
        } else {
          await page.keyboard.press(key);
        }
      } else if (command.command === "select") {
        if (!locator) {
          return failResult(command, "LOCATOR_NOT_FOUND", "click requires locator");
        }
        const value = getString(payload?.value);
        const label = getString(payload?.label);
        const index = getNumber(payload?.index);
        if (value) {
          await locator.selectOption({ value });
        } else if (label) {
          await locator.selectOption({ label });
        } else if (typeof index === "number") {
          await locator.selectOption({ index });
        } else {
          return failResult(command, "INVALID_PAYLOAD", "select requires value, label, or index");
        }
      } else if (command.command === "scroll") {
        const deltaX = getNumber(payload?.deltaX) ?? 0;
        const deltaY = getNumber(payload?.deltaY) ?? 500;
        if (locator) {
          await locator.scrollIntoViewIfNeeded();
        }
        await page.mouse.wheel(deltaX, deltaY);
      } else if (command.command === "forward") {
        await page.goForward().catch(() => null);
      } else if (command.command === "newTab") {
        const newPage = await pw.context.newPage();
        pw.page = newPage;
        if (url) {
          await gotoPage(newPage, url, effective);
        }
        await focusVisibleBrowser(pw, effective);
      } else if (command.command === "switchTab") {
        const pages = pw.context.pages();
        const tabIndex = getNumber(payload?.tabIndex) ?? 0;
        const safeIndex = Math.max(0, Math.min(pages.length - 1, tabIndex));
        const selected = pages[safeIndex];
        if (!selected) {
          return failResult(command, "TAB_NOT_FOUND", `No tab found at index ${tabIndex}`);
        }
        pw.page = selected;
        await focusVisibleBrowser(pw, effective);
      } else if (command.command === "uploadFile") {
        if (!locator) {
          return failResult(command, "LOCATOR_NOT_FOUND", "click requires locator");
        }
        const filePath = getString(payload?.filePath);
        const filePaths = getStringArray(payload?.filePaths);
        const targetPaths = filePaths.length > 0 ? filePaths : filePath ? [filePath] : [];
        if (targetPaths.length === 0) {
          return failResult(command, "INVALID_PAYLOAD", "uploadFile requires filePath or filePaths");
        }
        await locator.setInputFiles(targetPaths);
      } else if (command.command === "dragDrop") {
        const sourceLocatorObj = asRecord(payload?.sourceLocator ?? payload?.fromLocator);
        const targetLocatorObj = asRecord(payload?.targetLocator ?? payload?.toLocator);
        const source = Object.keys(sourceLocatorObj).length > 0 ? locatorFromPayload(page, { locator: sourceLocatorObj }) : locator;
        const target =
          Object.keys(targetLocatorObj).length > 0 ? locatorFromPayload(page, { locator: targetLocatorObj }) : undefined;
        if (!source || !target) {
          return failResult(command, "LOCATOR_NOT_FOUND", "dragDrop requires source and target locator");
        }
        await source.dragTo(target);
      } else if (command.command === "wait") {
        const timeoutMs = getNumber(payload?.timeoutMs) ?? 300;
        await page.waitForTimeout(timeoutMs);
      } else if (command.command === "back") {
        await page.goBack().catch(() => null);
      } else if (command.command === "reload") {
        await page.reload();
      } else if (command.command === "closeTab") {
        await page.close();
        pw.page = await pw.context.newPage();
      } else if (command.command === "assertVisible") {
        if (!locator) {
          return failResult(command, "LOCATOR_NOT_FOUND", "assertVisible requires locator", {
            locatorUsed: summarizeLocator(payload?.locator)
          });
        }
        try {
          await autoWaitLocator(locator, waitMs);
        } catch {
          return failResult(command, "ASSERT_NOT_VISIBLE", "Target element is not visible.", {
            assertionDiff: {
              type: "visible",
              expected: true,
              actual: false,
              locatorUsed: summarizeLocator(payload?.locator)
            }
          });
        }
      } else if (command.command === "assertText") {
        if (!locator) {
          return failResult(command, "LOCATOR_NOT_FOUND", "assertText requires locator", {
            locatorUsed: summarizeLocator(payload?.locator)
          });
        }
        const expected = getString(payload?.expectedText);
        if (!expected) {
          return failResult(command, "INVALID_PAYLOAD", "assertText requires expectedText");
        }
        try {
          await autoWaitLocator(locator, waitMs);
        } catch {
          return failResult(command, "ASSERT_NOT_VISIBLE", "Target element is not visible before text assert.", {
            assertionDiff: {
              type: "text",
              expected,
              actual: null,
              locatorUsed: summarizeLocator(payload?.locator)
            }
          });
        }
        const actual = (await locator.textContent()) ?? "";
        if (!actual.includes(expected)) {
          return failResult(command, "ASSERT_TEXT_MISMATCH", `Expected text to include "${expected}", got "${actual}"`, {
            assertionDiff: {
              type: "text",
              expected,
              actual,
              locatorUsed: summarizeLocator(payload?.locator)
            }
          });
        }
      } else if (command.command === "getText") {
        if (!locator) {
          return failResult(command, "LOCATOR_NOT_FOUND", "click requires locator");
        }
        const text = (await locator.textContent()) ?? "";
        return {
          requestId: command.requestId,
          success: true,
          data: { driver: "playwright", command: command.command, mode: "real", text, headless: pw.headless, browser: pw.browserKind }
        };
      } else if (command.command === "screenshot") {
        const customPath = getString(payload?.screenshotPath);
        const dir = path.join(process.cwd(), "artifacts");
        await fs.mkdir(dir, { recursive: true });
        const target = customPath ? path.resolve(customPath) : path.join(dir, `${command.requestId}.png`);
        if (customPath) {
          await fs.mkdir(path.dirname(target), { recursive: true });
        }
        const fullPage = typeof payload?.fullPage === "boolean" ? payload.fullPage : false;
        await page.screenshot({ path: target, fullPage });
        return {
          requestId: command.requestId,
          success: true,
          data: {
            driver: "playwright",
            command: command.command,
            screenshot: target,
            fullPage,
            headless: pw.headless,
            browser: pw.browserKind
          }
        };
      } else if (command.command === "recipe") {
        const action = getString(payload?.action)?.toLowerCase();
        if (action === "clickpath") {
          return executeClickPath(command, page, payload);
        }
        if (action === "fill_search" || action === "fillsearch") {
          return executeFillSearch(command, page, payload);
        }
        return failResult(
          command,
          "UNSUPPORTED_COMMAND",
          `unsupported web recipe action: ${action ?? "(missing)"}; supported: clickPath, fill_search`
        );
      } else if (command.command === "custom") {
        const action = getString(payload?.action)?.toLowerCase();
        if (action === "invoke" || (payload?.method && !action)) {
          return executePlaywrightInvoke(command, pw, payload);
        }
        if (action === "evaluate") {
          const script = getString(payload?.script);
          if (!script) {
            return failResult(command, "INVALID_PAYLOAD", "evaluate requires script");
          }
          const value = await page.evaluate(script);
          return {
            requestId: command.requestId,
            success: true,
            data: {
              driver: "playwright",
              command: command.command,
              mode: "real",
              action: "evaluate",
              value: serializeRpcResult(value),
              headless: pw.headless,
              browser: pw.browserKind
            }
          };
        }
        if (action === "dismisspopups" || action === "dismiss_popups") {
          return executeDismissPopups(command, page, effective);
        }
        return failResult(
          command,
          "UNSUPPORTED_COMMAND",
          "unsupported custom action; use action=evaluate|invoke or command=invoke"
        );
      } else {
        return failResult(command, "UNSUPPORTED_COMMAND", `unsupported command: ${cmd}`);
      }

      return {
        requestId: command.requestId,
        success: true,
        data: {
          driver: "playwright",
          command: command.command,
          mode: "real",
          headless: pw.headless,
          browser: pw.browserKind,
          connectedOverCdp: pw.connectedOverCdp,
          localBrowser: pw.localBrowser
        }
      };
    } catch (error) {
      if (!isRecoverableInteractionError(error)) {
        await releasePlaywrightDriverSession(session.id);
      }
      const pw = getPlaywrightSession(session.id);
      return await failWithPage(
        command,
        pw?.page,
        "COMMAND_FAILED",
        error instanceof Error ? error.message : String(error),
        { locatorUsed: summarizeLocator(payload?.locator ?? payload?.selector) }
      );
    }
}
