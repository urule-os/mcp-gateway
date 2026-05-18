import type { FastifyRequest } from 'fastify';
import type { WorkspaceIdResolver } from '@urule/authz-middleware';
import type { ServerRegistry } from './services/server-registry.js';

/* ------------------------------------------------------------------ *
 * Workspace-id resolvers for `requireMembership` preHandlers.
 *
 * The gateway holds bindings in memory, so resolvers read the
 * `ServerRegistry`. A resolver returns `null` to make `requireMembership`
 * answer 404 (unknown resource) without leaking existence.
 *
 * MCP servers themselves are global (no workspace) — their write routes
 * are admin-gated with `requireRole('admin')` instead. Bindings carry the
 * workspace association and use these resolvers.
 *
 * The OpenFGA client is built by `bootstrapAuthzClient` from `@urule/authz`
 * — see server.ts.
 * ------------------------------------------------------------------ */

/** Resolver for create routes that carry the workspace id in the body. */
export const bodyWorkspaceResolver: WorkspaceIdResolver = (req: FastifyRequest) => {
  const body = (req.body ?? {}) as { workspaceId?: string };
  return body.workspaceId ?? null;
};

/** Resolver for `/workspaces/:wsId/...` routes — the workspace id is in the path. */
export const wsParamResolver: WorkspaceIdResolver = (req: FastifyRequest) => {
  const { wsId } = req.params as { wsId?: string };
  return wsId ?? null;
};

/** Resolver for `/mcp/bindings/:bindingId` — looks the binding up and returns its workspace. */
export function bindingWorkspaceResolver(registry: ServerRegistry): WorkspaceIdResolver {
  return (req: FastifyRequest) => {
    const { bindingId } = req.params as { bindingId?: string };
    if (!bindingId) return null;
    return registry.getBinding(bindingId)?.workspaceId ?? null;
  };
}
