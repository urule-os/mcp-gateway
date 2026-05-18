import type { FastifyInstance } from 'fastify';
import { requireRole } from '@urule/authz-middleware';
import type { ServerRegistry, RegisterServerRequest } from '../services/server-registry.js';
import type { ToolCatalog } from '../services/tool-catalog.js';
import { z } from 'zod';
import { AuditLogger } from '@urule/events';

const audit = new AuditLogger('mcp-gateway', (topic, data) => {
  console.log(JSON.stringify({ audit: true, topic, ...data as Record<string, unknown> }));
});

// -- Zod Schemas ------------------------------------------------------

const registerServerSchema = z.object({
  name: z.string().min(1),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  transportType: z.string().optional(),
  env: z.object({}).passthrough().optional(),
});

const registerToolSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputSchema: z.object({}).passthrough().optional(),
});

const registerToolsSchema = z.array(registerToolSchema);

const listServersQuerySchema = z.object({
  limit: z.string().optional(),
  offset: z.string().optional(),
});

const serverParamsSchema = z.object({ serverId: z.string() });

// -- Routes -----------------------------------------------------------

export async function serversRoutes(
  app: FastifyInstance,
  opts: { registry: ServerRegistry; catalog: ToolCatalog },
): Promise<void> {
  const { registry, catalog } = opts;

  // List all MCP servers
  app.get<{ Querystring: z.infer<typeof listServersQuerySchema> }>('/api/v1/mcp/servers', {
    schema: {
      tags: ['servers'],
      summary: 'List registered MCP servers',
      description: 'Paginated list of every MCP server registered with the gateway. `?limit` capped at 100, default 50; `?offset` defaults to 0.',
      querystring: listServersQuerySchema,
    },
  }, async (request) => {
    const limit = Math.min(parseInt(request.query.limit ?? '50', 10), 100);
    const offset = parseInt(request.query.offset ?? '0', 10);
    const all = registry.list();
    return all.slice(offset, offset + limit);
  });

  // Register a new MCP server. The server registry is global (servers carry
  // no workspace) and registering one defines a command to spawn — a
  // privileged operation — so it is gated to the `admin` realm role. Workspace
  // members consume servers via bindings, which are membership-gated.
  app.post<{ Body: z.infer<typeof registerServerSchema> }>('/api/v1/mcp/servers', {
    preHandler: requireRole('admin'),
    schema: {
      tags: ['servers'],
      summary: 'Register a new MCP server',
      description: 'Adds an MCP server record (stdio command, args, optional env, transport hint). Admin-only — the server registry is global. Emits an audit event for the create.',
      body: registerServerSchema,
    },
  }, async (request, reply) => {
    const server = registry.register(request.body as RegisterServerRequest);

    const user = (request as unknown as { uruleUser?: { id?: string; username?: string } }).uruleUser;
    audit.entityCreated(
      { id: user?.id ?? 'anonymous', username: user?.username ?? 'anonymous' },
      'mcp-server', server.id, `MCP server "${request.body.name}" registered`,
    ).catch(() => {});

    reply.status(201).send(server);
  });

  // Get MCP server by ID
  app.get<{ Params: z.infer<typeof serverParamsSchema> }>('/api/v1/mcp/servers/:serverId', {
    schema: {
      tags: ['servers'],
      summary: 'Get MCP server by ID',
      description: 'Returns the registered MCP server record. 404 SERVER_NOT_FOUND when the id is unknown.',
      params: serverParamsSchema,
    },
  }, async (request, reply) => {
    const server = registry.get(request.params.serverId);
    if (!server) {
      reply.status(404).send({ error: { code: 'SERVER_NOT_FOUND', message: `MCP server ${request.params.serverId} not found` } });
      return;
    }
    return server;
  });

  // Remove MCP server — admin-only (global registry).
  app.delete<{ Params: z.infer<typeof serverParamsSchema> }>('/api/v1/mcp/servers/:serverId', {
    preHandler: requireRole('admin'),
    schema: {
      tags: ['servers'],
      summary: 'Remove an MCP server',
      description: 'Deletes the server record + every tool the catalog tracked under it. Emits an audit event for the delete. 204 on success, 404 SERVER_NOT_FOUND when unknown.',
      params: serverParamsSchema,
    },
  }, async (request, reply) => {
    const removed = registry.remove(request.params.serverId);
    if (!removed) {
      reply.status(404).send({ error: { code: 'SERVER_NOT_FOUND', message: `MCP server ${request.params.serverId} not found` } });
      return;
    }
    catalog.removeServerTools(request.params.serverId);

    const user = (request as unknown as { uruleUser?: { id?: string; username?: string } }).uruleUser;
    audit.entityDeleted(
      { id: user?.id ?? 'anonymous', username: user?.username ?? 'anonymous' },
      'mcp-server', request.params.serverId, `MCP server "${request.params.serverId}" removed`,
    ).catch(() => {});

    reply.status(204).send();
  });

  // Register tools for a server
  app.post<{
    Params: z.infer<typeof serverParamsSchema>;
    Body: z.infer<typeof registerToolsSchema>;
  }>('/api/v1/mcp/servers/:serverId/tools', {
    preHandler: requireRole('admin'),
    schema: {
      tags: ['servers'],
      summary: 'Register the tool catalog for a server',
      description: 'Bulk-registers the tools an MCP server exposes (`name`, `description`, optional `inputSchema`). 404 SERVER_NOT_FOUND when the server id is unknown.',
      params: serverParamsSchema,
      body: registerToolsSchema,
    },
  }, async (request, reply) => {
    const server = registry.get(request.params.serverId);
    if (!server) {
      reply.status(404).send({ error: { code: 'SERVER_NOT_FOUND', message: `MCP server ${request.params.serverId} not found` } });
      return;
    }

    const registered = request.body.map((tool) =>
      catalog.registerTool(request.params.serverId, server.name, tool),
    );

    reply.status(201).send(registered);
  });

  // List tools for a server
  app.get<{ Params: z.infer<typeof serverParamsSchema> }>('/api/v1/mcp/servers/:serverId/tools', {
    schema: {
      tags: ['servers'],
      summary: 'List tools registered for a server',
      description: 'Returns every tool the catalog tracks under this MCP server id. 404 SERVER_NOT_FOUND when the server id is unknown.',
      params: serverParamsSchema,
    },
  }, async (request, reply) => {
    const server = registry.get(request.params.serverId);
    if (!server) {
      reply.status(404).send({ error: { code: 'SERVER_NOT_FOUND', message: `MCP server ${request.params.serverId} not found` } });
      return;
    }
    return catalog.listByServer(request.params.serverId);
  });
}
