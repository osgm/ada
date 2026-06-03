# @ada/driver-rpc

驱动 RPC 工具：超时、会话键、移动 recipe、UI dump 缓存、智能等待。

## UI dump 缓存

| 环境变量 | 默认 | 说明 |
|----------|------|------|
| `ADA_UI_DUMP_CACHE_MS` | `2000` | hierarchy/layout 缓存 TTL（毫秒） |
| `ADA_ANDROID_HIERARCHY_CACHE_MS` | 同上别名 | Android adapter |
| `ADA_UI_DUMP_CACHE_INVALIDATE_ON_ACTION` | `true` | click/swipe/launch 后失效 |

Recipe 与 adapter 共用 `UiDumpCache` / `getCachedHierarchy`（Android）。

## 智能等待

payload 或 env：

```json
{ "wait": { "until": "ui_stable", "timeoutMs": 15000, "stableMs": 600, "pollMs": 400 } }
```

| `ADA_WAIT_UNTIL` | `timeout` \| `ui_stable` \| `launch_settled` |
| `ADA_WAIT_MAX_MS` | 最大等待 |
| `ADA_WAIT_UI_STABLE_MS` | 节点数稳定持续时间 |

## 内核 session 键

多设备时：`android:{udid}:{sessionId}`、`harmony:{deviceSn}:{sessionId}`。

使用 `buildKernelSessionKey` / `resolveMobileDeviceId`。
