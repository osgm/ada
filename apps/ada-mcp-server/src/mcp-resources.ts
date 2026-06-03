import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export const MCP_ROUTING_GUIDE_URI = "ada://guide/routing";

const ROUTING_GUIDE = `# ADA MCP Routing Guide

## Default workflow (T1)
1. ada_health scope=web|mobile
2. ada_devices action=scan (mobile only)
3. ada_web_action / ada_mobile_action (reuse sessionId)
4. ada_extract / ada_assertions for verify
5. ada_close_session when done

## Tier policy
- T1: ada_web_action, ada_mobile_action, ada_extract, ada_assertions, ada_batch_actions
- T2: ada_diagnostics, ada_run_task_file, ada_mobile_recipe
- T3: ada_execute, ada_invoke — only after T1 fails

## On failure
1. Read recoveryHint / recoveryPlan from tool response
2. Retry same T1 tool with retry=1 and same sessionId
3. Observe via ada_extract or ada_mobile_extract
4. Use ada_invoke only with riskApproved=true

## Anti-patterns
- Do not change sessionId every step
- Do not skip ada_health on cold start
- Do not use ada_execute when ada_web_action / ada_mobile_action suffice (T3 only)
- Do not use ada_invoke for simple click/type
- Enable monitor.onFailureOnly=true on risky steps
`;

export function registerAdaMcpResources(server: Server): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: MCP_ROUTING_GUIDE_URI,
        name: "ADA MCP Routing Guide",
        description: "Tool tiers, default workflow, failure escalation (read once per session)",
        mimeType: "text/markdown"
      }
    ]
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = String(request.params.uri ?? "");
    if (uri !== MCP_ROUTING_GUIDE_URI) {
      throw new Error(`Unknown resource: ${uri}`);
    }
    return {
      contents: [
        {
          uri: MCP_ROUTING_GUIDE_URI,
          mimeType: "text/markdown",
          text: ROUTING_GUIDE
        }
      ]
    };
  });
}
