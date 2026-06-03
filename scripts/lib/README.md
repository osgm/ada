# scripts/lib

| 文件 | 说明 |
|------|------|
| **[`LOCATOR_MATRIX.md`](./LOCATOR_MATRIX.md)** | `by` + `find` 各平台字段与支持矩阵 |
| **`ada-client.d.ts`** | `page` / `phone` / `find` TypeScript 类型（IDE 与 LLM 可读） |
| **`ada-client.mjs`** | JS 唯一入口（与 `ada_client.py` API 并集） |
| **`ada_client.py`** | Python 唯一入口 |
| `popups.py` / `popups.mjs` | 关弹窗 |
| `read_device.py` / `read-device.mjs` | adb/hdc 设备探测 |
| `swipe_duration.py` / `swipe-duration.mjs` | 滑动时长预设 |
| `swipe_coords.py` / `swipe-coords.mjs` | 滑动坐标（像素默认、`relative`、占位符） |
| `step_log.py` / `step_log.mjs` | 分步 trace（`ADA_STEP_LOG=1`） |
| `run-python-example.mjs` | `npm run test:jd-*:py` 启动器 |

在 `scripts/examples` 下编辑时，VS Code/Cursor 会读取 `scripts/jsconfig.json` 并为 `ada-client.mjs` 提供补全。可选在脚本首行加 `// @ts-check` 开启轻量类型检查。

```javascript
import { open, browser, device, dir, by, wait, connectMcp, init, stepLog, exit } from "../../../lib/ada-client.mjs";
// MCP（无需 connectMcp）：await open(device({ ... }), { connect: "mcp" });
//      await phone.close();  // 自动断开 MCP
// import 类型（仅编辑器）：import type { AndroidPhone, WebPage } from "../../../lib/ada-client.mjs";

// 默认：脚本跑完自动 quit，无需 finally。要保持浏览器/会话：browser({ keepAlive: true }) 或 ADA_KEEP_ALIVE=1

const page = await open(browser({ sessionId: "jd-web-1", type: "chrome" }));
await page.goto("https://www.jd.com"); // tab(url) 同义
// timeoutMs: 30000  // 选填，auto-wait 超时，默认 20000

const phone = await open(device({ type: "harmony", sessionId: "jd-harmony" }));
// 多台设备：device_id: "SN"

const OUT = "artifacts/examples/nodejs/web";
await dir(OUT);
```

```python
from ada_client import open, browser, device, dir, by, wait, init, exit, step_log

OUT = "artifacts/examples/python/web"
dir(OUT)
# wait(1500)  # 强制等待（毫秒）；操作自带 auto-wait，一般不必写
# page.wait(500)  # 驱动级等待（毫秒）
```
