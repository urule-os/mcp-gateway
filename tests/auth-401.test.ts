import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { authMiddleware } from '@urule/auth-middleware';

// Mirror mcp-gateway's server.ts publicRoutes config. Drift in either
// direction shows up here.
const PUBLIC_ROUTES = ['/healthz', '/docs'];

async function buildAuthClosedApp() {
  const app = Fastify({ logger: false });
  await app.register(authMiddleware, {
    failClosed: true,
    jwksUrl: 'http://localhost:99999/nonexistent',
    publicRoutes: PUBLIC_ROUTES,
  });
  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/docs/json', async () => ({ openapi: '3.0' }));
  app.post('/api/v1/servers', async () => ({ id: 's1' }));
  return app;
}

describe('mcp-gateway — fail-closed auth wiring', () => {
  it('returns 401 on a protected route with no auth header', async () => {
    const app = await buildAuthClosedApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/servers', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('keeps /healthz accessible (k8s liveness probe)', async () => {
    const app = await buildAuthClosedApp();
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
  });

  it('keeps /docs/* accessible (Swagger UI)', async () => {
    const app = await buildAuthClosedApp();
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
  });
});
