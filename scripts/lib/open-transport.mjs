/**
 * open(target, second) 第二参：MCP 传输
 *
 * 支持：
 *   open(device({...}), mcp)              // connectMcp() 返回值
 *   open(device({...}), { mcp })          // 或 { mcp: mcp }
 *   open(device({...}), { connect: "mcp" }) // 自动 connectMcp，close 时断开
 *   open(device({...}), "mcp")              // 同上简写
 *   open(device({...}), { via: "mcp", client }) // 兼容旧写法
 */

/** @param {unknown} v */
export function isMcpHandle(v) {
  if (!v || typeof v !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (v);
  if (typeof o.call_tool === "function") return true;
  if (typeof o.health === "function" && (o.client != null || typeof o.close === "function")) return true;
  if (typeof o.close === "function" && o.client != null) return true;
  return false;
}

/**
 * @param {unknown} second
 * @returns {{ useMcp: boolean, mcpSecond: Record<string, unknown> }}
 */
export function resolveOpenSecond(second) {
  if (second == null) {
    return { useMcp: false, mcpSecond: {} };
  }

  if (second === "mcp") {
    return { useMcp: true, mcpSecond: { via: "mcp" } };
  }

  // open(desc, mcp)
  if (isMcpHandle(second)) {
    const handle = /** @type {{ client?: unknown }} */ (second);
    return {
      useMcp: true,
      mcpSecond: { via: "mcp", client: handle.client ?? second }
    };
  }

  if (typeof second !== "object") {
    return { useMcp: false, mcpSecond: {} };
  }

  const o = /** @type {Record<string, unknown>} */ (second);

  // open(desc, { mcp }) / { mcp: mcp }
  if (o.mcp != null) {
    const raw = o.mcp;
    const client =
      raw && typeof raw === "object" && "client" in /** @type {object} */ (raw)
        ? /** @type {{ client: unknown }} */ (raw).client
        : raw;
    return { useMcp: true, mcpSecond: { via: "mcp", client, mcpOptions: o.mcpOptions } };
  }

  // open(desc, { connect: "mcp" }) — 可省略 mcp，由 ensureMcpClient 自动连接
  if (o.connect === "mcp" || o.via === "mcp" || o.transport === "mcp") {
    const raw = o.mcp ?? o.client;
    const client =
      raw && typeof raw === "object" && raw !== null && "client" in raw
        ? /** @type {{ client: unknown }} */ (raw).client
        : raw;
    return {
      useMcp: true,
      mcpSecond: {
        via: "mcp",
        ...(client != null ? { client } : {}),
        mcpOptions: o.mcpOptions
      }
    };
  }

  return { useMcp: false, mcpSecond: o };
}
