import { describe, it, expect } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { authzMiddleware } from '@urule/authz-middleware';
import { createMockAuthzClient } from '@urule/authz/testing';
import type { RelationTuple } from '@urule/authz';
import { ServerRegistry } from '../src/services/server-registry.js';
import { ToolCatalog } from '../src/services/tool-catalog.js';
import { serversRoutes } from '../src/routes/servers.routes.js';
import { bindingsRoutes } from '../src/routes/bindings.routes.js';
import { errorHandler } from '../src/middleware/error-handler.js';

/* ------------------------------------------------------------------ *
 * Phase F — authz on mcp-gateway. Bindings are workspace-scoped
 * (requireMembership); the global MCP server registry is admin-gated
 * (requireRole). A custom onRequest hook stands in for auth-middleware.
 * ------------------------------------------------------------------ */

type TestUser = { id: string; roles?: string[] } | null;

interface Built {
  app: FastifyInstance;
  registry: ServerRegistry;
}

async function buildApp(opts: { user: TestUser; tuples?: RelationTuple[] }): Promise<Built> {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);

  app.decorateRequest('uruleUser', null);
  app.addHook('onRequest', async (request) => {
    (request as typeof request & { uruleUser: TestUser }).uruleUser = opts.user;
  });

  const authz = createMockAuthzClient();
  if (opts.tuples) await authz.writeTuples(opts.tuples);
  await app.register(authzMiddleware, { authzClient: authz });

  const registry = new ServerRegistry();
  const catalog = new ToolCatalog();
  await app.register(serversRoutes, { registry, catalog });
  await app.register(bindingsRoutes, { registry, catalog });
  await app.ready();
  return { app, registry };
}

const ALICE = { id: 'alice' };
const BOB = { id: 'bob' };
const ROOT = { id: 'root', roles: ['admin'] };
const MEMBER_OF_WS1: RelationTuple[] = [
  { user: 'user:alice', relation: 'member', object: 'workspace:ws-1' },
];

describe('Phase F — mcp-gateway authz', () => {
  it('POST /mcp/servers — 403 for a non-admin (global registry is admin-gated)', async () => {
    const { app } = await buildApp({ user: ALICE, tuples: MEMBER_OF_WS1 });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/servers',
      payload: { name: 'srv', command: 'node' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /mcp/servers — 201 for an admin', async () => {
    const { app } = await buildApp({ user: ROOT });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/servers',
      payload: { name: 'srv', command: 'node' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('POST /mcp/bindings — 403 for a non-member of the target workspace', async () => {
    const { app, registry } = await buildApp({ user: BOB });
    const server = registry.register({ name: 'srv', command: 'node' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/bindings',
      payload: { workspaceId: 'ws-1', serverId: server.id },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /mcp/bindings — 201 for a workspace member', async () => {
    const { app, registry } = await buildApp({ user: ALICE, tuples: MEMBER_OF_WS1 });
    const server = registry.register({ name: 'srv', command: 'node' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/mcp/bindings',
      payload: { workspaceId: 'ws-1', serverId: server.id },
    });
    expect(res.statusCode).toBe(201);
  });

  it('DELETE /mcp/bindings/:bindingId — 403 for a non-member', async () => {
    const { app, registry } = await buildApp({ user: BOB });
    const server = registry.register({ name: 'srv', command: 'node' });
    const binding = registry.bindToWorkspace(server.id, 'ws-1');
    const res = await app.inject({ method: 'DELETE', url: `/api/v1/mcp/bindings/${binding.id}` });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE /mcp/bindings/:bindingId — 404 when the binding does not exist', async () => {
    const { app } = await buildApp({ user: ALICE, tuples: MEMBER_OF_WS1 });
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/mcp/bindings/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('GET /workspaces/:wsId/mcp/bindings — 403 for a non-member', async () => {
    const { app } = await buildApp({ user: BOB });
    const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/ws-1/mcp/bindings' });
    expect(res.statusCode).toBe(403);
  });

  it('GET /workspaces/:wsId/mcp/bindings — 200 for a workspace member', async () => {
    const { app } = await buildApp({ user: ALICE, tuples: MEMBER_OF_WS1 });
    const res = await app.inject({ method: 'GET', url: '/api/v1/workspaces/ws-1/mcp/bindings' });
    expect(res.statusCode).toBe(200);
  });
});
