import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { ServerRegistry } from './services/server-registry.js';
import { ToolCatalog } from './services/tool-catalog.js';
import { serversRoutes } from './routes/servers.routes.js';
import { bindingsRoutes } from './routes/bindings.routes.js';
import { toolsRoutes } from './routes/tools.routes.js';
import { authMiddleware } from '@urule/auth-middleware';
import { errorHandler } from './middleware/error-handler.js';
import type { Config } from './config.js';

export async function buildServer(config: Config) {
  const app = Fastify({
    logger: true,
    genReqId: () => crypto.randomUUID(),
  });

  app.setErrorHandler(errorHandler);

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Auth middleware
  await app.register(authMiddleware, { publicRoutes: ['/healthz'] });

  // Health check
  app.get('/healthz', async () => ({ status: 'ok', service: config.serviceName }));

  // Services (in-memory for now)
  const registry = new ServerRegistry();
  const catalog = new ToolCatalog();

  // Routes
  await app.register(serversRoutes, { registry, catalog });
  await app.register(bindingsRoutes, { registry, catalog });
  await app.register(toolsRoutes, { catalog });

  return app;
}
