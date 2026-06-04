import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { MCP_GLOBAL_POLICY, MCP_WORKFLOW_L0_L4 } from "./mcp-tool-policy.js";

export const MCP_ROUTING_GUIDE_URI = "ada://guide/routing";

const ROUTING_GUIDE = `# ADA MCP Routing Guide (advanced)

${MCP_WORKFLOW_L0_L4}

## Depth levels
| Level | Tools |
|-------|--------|
| L0 env | ada_health, ada_install_deps, ada_devices, ada_diagnostics |
| L1 semantic | ada_web_action, ada_mobile_action, extract/assertions |
| L2 orchestrate | ada_batch_actions, ada_run_task_file, ada_mobile_recipe |
| L3 driver | ada_invoke (RPC), ada_execute (task envelope) |
| L4 policy | ada_risk_policy, deviceAdmin via ada_mobile_action |

${MCP_GLOBAL_POLICY}

## Default flow
1. ada_health scope=web|mobile
2. ada_devices action=scan (mobile) → deviceParams.recommended + harmonyLaunchApp (Harmony)
3. ada_web_action / ada_mobile_action (reuse sessionId). Harmony launchApp: payload.appId + payload.abilityId (EntryAbility)
4. On gap: L2 batch/recipe → L3 invoke/execute
5. ada_extract / ada_assertions / ada_mobile_* for verify
6. ada_close_session when done

## Escalation
- Web: semantic insufficient → ada_invoke (method mode); multi-step → ada_batch_actions
- Mobile: search UI → ada_mobile_recipe; shell/hdc/tree → ada_invoke (http); device ops → deviceAdmin
- Harmony launch: never appId-only — use deviceParams.harmonyLaunchApp.args or payload.abilityId
- invoke vs execute: invoke = driver RPC; execute = generic runner schema

## ListTools order
Tools are grouped: env → web (action, invoke, execute) → mobile → orchestrate → session → risk_policy.

## Env
- ADA_MCP_HIDE_ADVANCED: keep unset/false to expose invoke/execute (recommended for advanced use)
- ADA_MCP_DESC_MODE=advanced: longer L3 descriptions in ListTools
- ADA_HARMONY_APP_ID / ADA_HARMONY_ABILITY_ID: optional defaults for deviceParams.harmonyLaunchApp template

## Anti-patterns
- Do not change sessionId every step
- Do not guess mobile platform (scan first)
- Do not use ada_invoke for simple click/type when L1 works
`;

export function registerAdaMcpResources(server: Server): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: MCP_ROUTING_GUIDE_URI,
        name: "ADA MCP Routing Guide",
        description: "L0–L4 workflow, driver escalation, deviceParams, env flags (read once per session)",
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
