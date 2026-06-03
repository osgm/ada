import type { LocatorV2 } from "@ada/contracts";

type PlaywrightPageLike = {
  locator: (selector: string) => any;
  getByRole?: (role: string, options?: Record<string, unknown>) => any;
  getByTestId?: (id: string) => any;
  getByText?: (text: string) => any;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseLocator(raw: unknown): LocatorV2 | undefined {
  if (!raw) return undefined;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") return raw as LocatorV2;
  return undefined;
}

export function summarizeLocator(raw: unknown): string {
  const locator = parseLocator(raw);
  if (!locator) return "(none)";
  if (typeof locator === "string") return locator;
  const l = locator as Record<string, unknown>;
  if (typeof l.kind === "string") {
    if (typeof l.value === "string") return `${l.kind}:${l.value}`;
    if (typeof l.role === "string") return `role:${l.role}${l.name ? `(${String(l.name)})` : ""}`;
    if (typeof l.query === "string") return `visual:${l.query}`;
  }
  if (l.role) return `role:${String(l.role)}${l.name ? `(${String(l.name)})` : ""}`;
  if (l.testId) return `testId:${String(l.testId)}`;
  if (l.css) return `css:${String(l.css)}`;
  if (l.xpath) return `xpath:${String(l.xpath)}`;
  if (l.text) return `text:${String(l.text)}`;
  if (l.accessibilityId) return `a11y:${String(l.accessibilityId)}`;
  if (l.id) return `id:${String(l.id)}`;
  return JSON.stringify(l);
}

export function resolveAutoWaitMs(payload?: Record<string, unknown>): number {
  const p = asRecord(payload);
  const options = asRecord(p.options);
  const fromPayload =
    typeof p.waitTimeoutMs === "number"
      ? p.waitTimeoutMs
      : typeof p.timeoutMs === "number"
        ? p.timeoutMs
        : typeof p.locatorTimeoutMs === "number"
          ? p.locatorTimeoutMs
          : undefined;
  const fromOptions = typeof options.waitTimeoutMs === "number" ? options.waitTimeoutMs : undefined;
  const env = Number(process.env.ADA_PLAYWRIGHT_AUTO_WAIT_MS ?? "5000");
  const raw = fromPayload ?? fromOptions ?? env;
  if (!Number.isFinite(raw) || raw <= 0) return 5000;
  return Math.floor(raw);
}

export async function autoWaitLocator(locator: any, timeoutMs: number): Promise<void> {
  await locator.waitFor({ state: "visible", timeout: timeoutMs });
}

export async function autoWaitEnabled(locator: any, timeoutMs: number): Promise<void> {
  await autoWaitLocator(locator, timeoutMs);
  if (typeof locator.isEnabled === "function") {
    const enabled = await locator.isEnabled({ timeout: timeoutMs });
    if (!enabled) {
      throw new Error("locator is not enabled");
    }
  }
}

export function locatorFromPayload(page: PlaywrightPageLike, payload?: Record<string, unknown>): any | null {
  const p = asRecord(payload);
  const locator = parseLocator(p.locator);
  if (!locator) {
    const selector = getString(p.selector);
    return selector ? page.locator(selector) : null;
  }

  if (typeof locator === "string") {
    return page.locator(locator);
  }

  const l = locator as Record<string, unknown>;
  const kind = getString(l.kind) ?? getString(l.strategy);
  if (kind === "role" && page.getByRole) {
    const role = getString(l.role);
    if (role) return page.getByRole(role, l.name ? { name: String(l.name) } : undefined);
  }
  if (kind === "testId" && page.getByTestId) {
    const value = getString(l.value);
    if (value) return page.getByTestId(value);
  }
  if (kind === "css" || kind === "xpath" || kind === "text" || kind === "resourceId" || kind === "accessibilityId") {
    const value = getString(l.value);
    if (value) {
      if (kind === "text" && page.getByText) return page.getByText(value);
      if (kind === "xpath") return page.locator(`xpath=${value}`);
      return page.locator(value);
    }
  }

  if (l.role && page.getByRole) return page.getByRole(String(l.role), l.name ? { name: String(l.name) } : undefined);
  if (l.testId && page.getByTestId) return page.getByTestId(String(l.testId));
  if (l.text && page.getByText) return page.getByText(String(l.text));
  if (l.css) return page.locator(String(l.css));
  if (l.xpath) return page.locator(`xpath=${String(l.xpath)}`);
  if (l.id) return page.locator(`#${String(l.id)}`);
  if (l.accessibilityId) return page.locator(`[aria-label="${String(l.accessibilityId)}"]`);

  return null;
}
