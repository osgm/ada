# @ada-mcp/mcp-server

ADA MCP server package that supports:

- Local stdio mode (default) for MCP hosts
- Remote HTTP mode (`server`) with API key authentication
- MCP **Streamable HTTP** on `POST|GET|DELETE /mcp` (same port as legacy REST), with optional SSE per MCP spec (`@modelcontextprotocol/sdk` transport)

## Run with npx / pnpm dlx

```bash
npx -y @ada-mcp/mcp-server
```

```bash
pnpm dlx @ada-mcp/mcp-server
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

### Streamable HTTP (`/mcp`)

- Endpoint: `http://<host>:<port>/mcp` — same API key headers as below (`x-api-key` or `Authorization: Bearer`).
- First request: `POST /mcp` with JSON-RPC `initialize` (no `Mcp-Session-Id`); server returns a session id in `Mcp-Session-Id` response header.
- Follow-up: `POST /mcp` with body + `Mcp-Session-Id`; for server-initiated streaming, open `GET /mcp` with `Accept: text/event-stream` and the same session header.
- Session teardown: `DELETE /mcp` with `Mcp-Session-Id`.

When listening on all interfaces (e.g. `--host=0.0.0.0`), set allowed Host headers to satisfy DNS rebinding checks:

```bash
ada-mcp server --host=0.0.0.0 --port=8787 --api-key=your_token --allowed-hosts=localhost,127.0.0.1
```
