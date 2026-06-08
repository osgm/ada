import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { locatorFromPayload, summarizeLocator } from "@ada/driver-playwright";

function mockPage() {
  const chain = (label: string) => {
    const node: Record<string, unknown> = {
      label,
      locator: (sel: string) => chain(`${label}.locator(${sel})`),
      getByRole: (role: string, opts?: Record<string, unknown>) =>
        chain(`${label}.getByRole(${role}${opts?.name ? `:${opts.name}` : ""})`),
      getByTestId: (id: string) => chain(`${label}.getByTestId(${id})`),
      getByText: (text: string) => chain(`${label}.getByText(${text})`),
      nth: (index: number) => chain(`${label}.nth(${index})`)
    };
    return node;
  };
  return chain("page") as any;
}

describe("playwright-locator", () => {
  it("applies nth on resolved locator", () => {
    const page = mockPage();
    const loc = locatorFromPayload(page, {
      locator: { kind: "role", role: "menuitem", name: "File", nth: 2 }
    });
    assert.equal(loc.label, "page.getByRole(menuitem:File).nth(2)");
  });

  it("scopes locator with within parent", () => {
    const page = mockPage();
    const loc = locatorFromPayload(page, {
      locator: {
        kind: "role",
        role: "menuitem",
        name: "Save",
        within: { kind: "role", role: "menubar" }
      }
    });
    assert.match(String(loc.label), /getByRole\(menubar\)/);
    assert.match(String(loc.label), /getByRole\(menuitem:Save\)/);
  });

  it("summarizeLocator includes nth and within hints", () => {
    const summary = summarizeLocator({
      kind: "role",
      role: "link",
      name: "Home",
      nth: 1,
      within: { kind: "css", value: "nav" }
    });
    assert.match(summary, /nth\(1\)/);
    assert.match(summary, /within/);
  });
});
