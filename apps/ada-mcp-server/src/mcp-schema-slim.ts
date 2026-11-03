/**
 * ListTools schema 体积优化：title 与 property name 重复；compact 下再去掉字段 description/examples。
 * 工具级 description 仍由 mcp-tool-definitions / formatTieredDescription 负责路由。
 */

export type McpSchemaSlimMode = "advanced" | "compact";

export function slimInputSchemaForListTools(
  schema: Record<string, unknown>,
  mode: McpSchemaSlimMode
): Record<string, unknown> {
  return slimNode(schema, mode) as Record<string, unknown>;
}

function slimNode(node: unknown, mode: McpSchemaSlimMode): unknown {
  if (!node || typeof node !== "object") {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map((item) => slimNode(item, mode));
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "title") {
      continue;
    }
    if (mode === "compact" && (key === "description" || key === "examples")) {
      continue;
    }
    out[key] = slimNode(value, mode);
  }
  return out;
}
