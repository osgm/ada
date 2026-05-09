# @ada/mcp-server

ADA MCP server package that supports:

- Local stdio mode (default) for MCP hosts
- Remote HTTP mode (`server`) with API key authentication

## Run with npx / pnpm dlx

```bash
npx -y @ada/mcp-server
```

```bash
pnpm dlx @ada/mcp-server
```

## Cursor MCP config (local stdio)

```json
{
  "mcpServers": {
    "ada-mcp": {
      "command": "npx",
      "args": ["-y", "@ada/mcp-server"]
    }
  }
}
```

## Remote mode

Set API key in environment variable first:

```bash
export ADA_MCP_REMOTE_API_KEY=your_token
```

Windows PowerShell:

```powershell
$env:ADA_MCP_REMOTE_API_KEY="your_token"
```

Then run:

```bash
ada-mcp server --host=127.0.0.1 --port=8787 --allow-risky=true --risky-mode=whitelist --risky-commands=custom
```
