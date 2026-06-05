import type { IOSPayload } from "./adapter.js";

export function escapeXpathLiteral(value: string): string {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  return `concat(${value
    .split('"')
    .map((part, i) => (i === 0 ? `"${part}"` : `, '"', "${part}"`))
    .join("")})`;
}

/** Map ADA locator fields to WDA element lookup strategy. */
export function iosLocatorToUsing(locator: NonNullable<IOSPayload["locator"]>): { using: string; value: string } | null {
  if (locator.id) return { using: "id", value: locator.id };
  if (locator.accessibilityId) return { using: "accessibility id", value: locator.accessibilityId };
  if (locator.xpath) return { using: "xpath", value: locator.xpath };
  if (locator.text) {
    const lit = escapeXpathLiteral(String(locator.text));
    return {
      using: "xpath",
      value: `//*[contains(@label, ${lit}) or contains(@name, ${lit}) or contains(@value, ${lit})]`
    };
  }
  return null;
}

export function isIosClearTypeOp(payload: IOSPayload): boolean {
  const p = payload as IOSPayload & { inputOp?: string; iosInputOp?: string };
  return p.inputOp === "clear" || p.iosInputOp === "clear" || (payload.text === "" && Boolean(payload.locator));
}
