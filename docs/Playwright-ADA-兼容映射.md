# Playwright 用例兼容映射（ADA MCP）

目标：让现有 Playwright 风格测试步骤尽量不改语义，直接映射到 ADA MCP 调用。

## 1. 兼容原则

- 保持动作语义一致：导航、点击、输入、等待、断言、截图优先 1:1 映射。
- 会话复用统一使用 `sessionId`，同一用例集固定一个 `sessionId`。
- 默认真实执行：`allowMock=false`，避免误把 mock 当通过。
- 对于 ADA 暂未覆盖的 Playwright 能力，降级到 `ada_web_action(command=custom, action=evaluate)`。

## 2. 方法映射表（核心）

```json
{
  "page.goto(url)": {
    "tool": "ada_web_action",
    "command": "navigate",
    "payload": { "url": "<url>", "headless": false }
  },
  "page.click(selector)": {
    "tool": "ada_web_action",
    "command": "click",
    "payload": { "locator": { "css": "<selector>" } }
  },
  "page.getByText(text).click()": {
    "tool": "ada_web_action",
    "command": "click",
    "payload": { "locator": { "text": "<text>" } }
  },
  "locator.fill(text)": {
    "tool": "ada_web_action",
    "command": "type",
    "payload": { "locator": { "css|text|testId": "<locator>" }, "text": "<text>" }
  },
  "locator.hover()": {
    "tool": "ada_web_action",
    "command": "hover",
    "payload": { "locator": { "css|text|testId": "<locator>" } }
  },
  "page.keyboard.press(key)": {
    "tool": "ada_web_action",
    "command": "press",
    "payload": { "key": "<key>" }
  },
  "locator.press(key)": {
    "tool": "ada_web_action",
    "command": "press",
    "payload": { "locator": { "css|text|testId": "<locator>" }, "key": "<key>" }
  },
  "page.waitForTimeout(ms)": {
    "tool": "ada_web_action",
    "command": "wait",
    "payload": { "timeoutMs": "<ms>" }
  },
  "page.goBack()": {
    "tool": "ada_web_action",
    "command": "back",
    "payload": {}
  },
  "page.reload()": {
    "tool": "ada_web_action",
    "command": "reload",
    "payload": {}
  },
  "page.close()": {
    "tool": "ada_web_action",
    "command": "closeTab",
    "payload": {}
  },
  "expect(locator).toBeVisible()": {
    "tool": "ada_web_action",
    "command": "assertVisible",
    "payload": { "locator": { "css|text|testId": "<locator>" } }
  },
  "expect(locator).toContainText(text)": {
    "tool": "ada_web_action",
    "command": "assertText",
    "payload": { "locator": { "css|text|testId": "<locator>" }, "expectedText": "<text>" }
  },
  "locator.textContent()": {
    "tool": "ada_web_action",
    "command": "getText",
    "payload": { "locator": { "css|text|testId": "<locator>" } }
  },
  "page.screenshot()": {
    "tool": "ada_web_action",
    "command": "screenshot",
    "payload": {}
  },
  "page.mouse.wheel(x, y)": {
    "tool": "ada_web_action",
    "command": "scroll",
    "payload": { "deltaX": "<x>", "deltaY": "<y>" }
  },
  "page.goForward()": {
    "tool": "ada_web_action",
    "command": "forward",
    "payload": {}
  },
  "context.newPage()": {
    "tool": "ada_web_action",
    "command": "newTab",
    "payload": {}
  },
  "切换到第N个Tab": {
    "tool": "ada_web_action",
    "command": "switchTab",
    "payload": { "tabIndex": "<index>" }
  },
  "locator.setInputFiles(path)": {
    "tool": "ada_web_action",
    "command": "uploadFile",
    "payload": { "locator": { "css|text|testId": "<locator>" }, "filePath": "<path>" }
  },
  "source.dragTo(target)": {
    "tool": "ada_web_action",
    "command": "dragDrop",
    "payload": {
      "sourceLocator": { "css|text|testId": "<source>" },
      "targetLocator": { "css|text|testId": "<target>" }
    }
  },
  "page.evaluate(script)": {
    "tool": "ada_web_action",
    "command": "custom",
    "payload": { "action": "evaluate", "script": "<script>" }
  }
}
```

## 3. 参数映射规范

```json
{
  "sessionId": "对应一个测试会话，建议按用例集固定",
  "allowMock": false,
  "payload.headless": false,
  "payload.locator.testId": "对应 page.getByTestId()",
  "payload.locator.text": "对应 page.getByText()",
  "payload.locator.role": "对应 page.getByRole()（当前支持基础角色查询）",
  "payload.locator.css": "对应 locator('css')",
  "payload.locator.xpath": "对应 locator('//xpath')"
}
```

## 4. 不完全等价能力（当前）

- 多页面/多 tab 精细控制（如 `context.newPage()`）暂未暴露专用 MCP 动作。
- 网络拦截、HAR、trace 原生能力未直接 1:1 暴露。
- 复杂 locator 组合（`locator.filter()` 链式）建议先转为 `css/text/testId`，不行再用 `custom/evaluate`。

## 5. 兼容落地建议

- 同一条 Playwright 用例转换后，统一走 `ada_web_action` + 固定 `sessionId`。
- 用例结束调用：
  - `ada_close_session`（推荐）
  - 或 `ada_close_all_sessions`
- 把 Playwright 原始步骤转为中间 DSL（JSON），再按本映射生成 MCP 调用，后续最易维护。
