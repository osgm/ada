import type { UiPickResult } from "@ada/mobile-ui";
import { escapeXpathLiteral } from "./ios-locator.js";

/** Build xpath candidates for a UI pick (search entry / input). */
export function iosPickToXpathCandidates(pick: UiPickResult): string[] {
  if (!pick.label || pick.label === "fallback") {
    if (pick.kind === "input") {
      return ["//XCUIElementTypeSearchField", '//XCUIElementTypeTextField[@visible="true"]'];
    }
    return ['//*[@visible="true" and contains(@type, "Button")]'];
  }
  const label = pick.label.trim();
  const shortLabel = label.length > 12 ? label.slice(0, 12) : label;
  const lit = escapeXpathLiteral(shortLabel);
  const textMatch = `contains(@label, ${lit}) or contains(@name, ${lit}) or contains(@value, ${lit})`;
  if (pick.kind === "input") {
    return [
      `//XCUIElementTypeSearchField[${textMatch}]`,
      `//XCUIElementTypeTextField[${textMatch}]`,
      "//XCUIElementTypeSearchField",
      '//XCUIElementTypeTextField[@visible="true"]'
    ];
  }
  return [
    `//XCUIElementTypeButton[${textMatch}]`,
    `//XCUIElementTypeSearchField[${textMatch}]`,
    `//*[@visible="true" and (${textMatch})]`
  ];
}
