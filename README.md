# @urule/mcp-gateway

MCP server registry with workspace bindings and tool catalog.

Part of the [Urule](https://github.com/urule-os/urule) ecosystem — the open-source coordination layer for AI agents.

## Features

- **Server registry** -- register, list, and remove MCP servers with support for `stdio`, `sse`, and `streamable-http` transports
- **Workspace bindings** -- bind MCP servers to workspaces so agents only see the tools available in their context
- **Tool catalog** -- register tools per server, search across all tools, and look up by server or keyword
- **Fastify REST API** with health check, structured error handling, and request ID tracking
- **Drizzle ORM schemas** ready for PostgreSQL persistence (in-memory by default for development)
- Designed for the [Model Context Protocol](https://modelcontextprotocol.io/) specification

## Quick Start

```bash
npm install
npm run build
npm start
```

Or for development with hot reload:

```bash
npm run dev
```

The server starts on port `3000` by default.

### Register an MCP server

```bash
curl -X POST http://localhost:3000/api/v1/mcp/servers \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "filesystem",
    "description": "File system access",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    "transportType": "stdio"
  }'
```

### Bind a server to a workspace

```bash
curl -X POST http://localhost:3000/api/v1/mcp/bindings \
  -H 'Content-Type: application/json' \
  -d '{"workspaceId": "ws-1", "serverId": "SERVER_ID"}'
```

### List tools available in a workspace

```bash
curl http://localhost:3000/api/v1/workspaces/ws-1/mcp/tools
```

## API Endpoints

### Servers

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/mcp/servers` | List all registered MCP servers |
| `POST` | `/api/v1/mcp/servers` | Register a new MCP server |
| `GET` | `/api/v1/mcp/servers/:serverId` | Get server by ID |
| `DELETE` | `/api/v1/mcp/servers/:serverId` | Remove a server and its tools |
| `POST` | `/api/v1/mcp/servers/:serverId/tools` | Register tools for a server |
| `GET` | `/api/v1/mcp/servers/:serverId/tools` | List tools for a server |

### Bindings

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/mcp/bindings` | Bind an MCP server to a workspace |
| `DELETE` | `/api/v1/mcp/bindings/:bindingId` | Remove a binding |
| `GET` | `/api/v1/workspaces/:wsId/mcp/bindings` | List bindings for a workspace |
| `GET` | `/api/v1/workspaces/:wsId/mcp/servers` | List servers available in a workspace |
| `GET` | `/api/v1/workspaces/:wsId/mcp/tools` | List all tools available in a workspace |

### Tools

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/mcp/tools` | Search/list all tools (query: `search`, `serverId`) |
| `GET` | `/api/v1/mcp/tools/:toolId` | Get tool by ID |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/healthz` | Health check |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATABASE_URL` | `postgres://urule:urule@localhost:5432/mcp_gateway` | PostgreSQL connection string |
| `NATS_URL` | `nats://localhost:4222` | NATS server URL |
| `REGISTRY_URL` | `http://localhost:3001` | Urule registry service URL |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

Apache-2.0
