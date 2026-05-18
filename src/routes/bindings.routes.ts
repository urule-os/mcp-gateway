import type { FastifyInstance } from 'fastify';
import { requireMembership } from '@urule/authz-middleware';
import type { ServerRegistry } from '../services/server-registry.js';
import type { ToolCatalog } from '../services/tool-catalog.js';
import { bindingWorkspaceResolver, bodyWorkspaceResolver, wsParamResolver } from '../authz.js';
import { z } from 'zod';

// -- Zod Schemas ------------------------------------------------------

const createBindingSchema = z.object({
  workspaceId: z.string(),
  serverId: z.string(),
  config: z.object({}).passthrough().optional(),
});

const wsParamsSchema = z.object({ wsId: z.string() });
const bindingParamsSchema = z.object({ bindingId: z.string() });

// -- Routes -----------------------------------------------------------

export async function bindingsRoutes(
  app: FastifyInstance,
  opts: { registry: ServerRegistry; catalog: ToolCatalog },
): Promise<void> {
  const { registry, catalog } = opts;

  // Resource-level authz: binding routes are workspace-scoped.
  const requireWsMembership = requireMembership(wsParamResolver);
  const requireBindingMembership = requireMembership(bindingWorkspaceResolver(registry));

  // Bind MCP server to workspace
  app.post<{
    Body: z.infer<typeof createBindingSchema>;
  }>('/api/v1/mcp/bindings', {
    preHandler: requireMembership(bodyWorkspaceResolver),
    schema: {
      tags: ['bindings'],
      summary: 'Bind an MCP server to a workspace',
      description:
        'Creates a binding row that exposes a registered MCP server inside a workspace. Optional `config` is merged at runtime (env vars, per-workspace overrides). 404 SERVER_NOT_FOUND when the referenced `serverId` is not in the registry.',
      body: createBindingSchema,
    },
  }, async (request, reply) => {
    try {
      const binding = registry.bindToWorkspace(
        request.body.serverId,
        request.body.workspaceId,
        request.body.config,
      );
      reply.status(201).send(binding);
    } catch (err) {
      reply.status(404).send({ error: { code: 'SERVER_NOT_FOUND', message: (err as Error).message } });
    }
  });

  // List bindings for a workspace
  app.get<{ Params: z.infer<typeof wsParamsSchema> }>(
    '/api/v1/workspaces/:wsId/mcp/bindings',
    {
      preHandler: requireWsMembership,
      schema: {
        tags: ['bindings'],
        summary: 'List bindings for a workspace',
        description: 'Returns every binding row attached to the given workspace, including per-binding `config` overrides.',
        params: wsParamsSchema,
      },
    },
    async (request) => {
      return registry.getWorkspaceBindings(request.params.wsId);
    },
  );

  // List MCP servers available in a workspace
  app.get<{ Params: z.infer<typeof wsParamsSchema> }>(
    '/api/v1/workspaces/:wsId/mcp/servers',
    {
      preHandler: requireWsMembership,
      schema: {
        tags: ['bindings'],
        summary: 'List MCP servers exposed in a workspace',
        description: 'Returns the server records (resolved via bindings) that are reachable inside the workspace.',
        params: wsParamsSchema,
      },
    },
    async (request) => {
      return registry.getWorkspaceServers(request.params.wsId);
    },
  );

  // List all tools available in a workspace
  app.get<{ Params: z.infer<typeof wsParamsSchema> }>(
    '/api/v1/workspaces/:wsId/mcp/tools',
    {
      preHandler: requireWsMembership,
      schema: {
        tags: ['bindings'],
        summary: 'List tools exposed in a workspace',
        description: 'Aggregates the tool catalog across every MCP server bound to the workspace, so callers see one flat list of callable tools.',
        params: wsParamsSchema,
      },
    },
    async (request) => {
      const servers = registry.getWorkspaceServers(request.params.wsId);
      const allTools = servers.flatMap((s) => catalog.listByServer(s.id));
      return allTools;
    },
  );

  // Remove binding
  app.delete<{ Params: z.infer<typeof bindingParamsSchema> }>(
    '/api/v1/mcp/bindings/:bindingId',
    {
      preHandler: requireBindingMembership,
      schema: {
        tags: ['bindings'],
        summary: 'Remove a workspace binding',
        description: 'Detaches an MCP server from a workspace. 204 on success, 404 BINDING_NOT_FOUND when the binding does not exist.',
        params: bindingParamsSchema,
      },
    },
    async (request, reply) => {
      const removed = registry.unbindFromWorkspace(request.params.bindingId);
      if (!removed) {
        reply.status(404).send({ error: { code: 'BINDING_NOT_FOUND', message: `Binding ${request.params.bindingId} not found` } });
        return;
      }
      reply.status(204).send();
    },
  );
}
