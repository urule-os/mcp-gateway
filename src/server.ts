import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ServerRegistry } from './services/server-registry.js';
import { ToolCatalog } from './services/tool-catalog.js';
import { serversRoutes } from './routes/servers.routes.js';
import { bindingsRoutes } from './routes/bindings.routes.js';
import { toolsRoutes } from './routes/tools.routes.js';
import { authMiddleware } from '@urule/auth-middleware';
import { correlationIdPlugin } from '@urule/correlation-id';
import { metricsPlugin } from '@urule/observability';
import { errorHandler } from './middleware/error-handler.js';
import type { Config } from './config.js';

export async function buildServer(config: Config) {
  const app = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            hostname: request.hostname,
            remoteAddress: request.ip,
          };
        },
      },
    },
  });

  app.setErrorHandler(errorHandler);

  // Correlation ID — must be the first plugin so all other middleware logs carry it
  await app.register(correlationIdPlugin);

  // Prometheus /metrics endpoint
  await app.register(metricsPlugin, { serviceName: 'mcp-gateway' });

  // Register CORS
  const allowedOrigins = (process.env['CORS_ORIGINS'] ?? 'http://localhost:3000').split(',');
  await app.register(cors, { origin: allowedOrigins });

  // Rate limiting
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  // Auth middleware
  await app.register(authMiddleware, { publicRoutes: ['/healthz', '/metrics', '/docs'] });

  // OpenAPI documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Urule MCP Gateway API',
        description: 'MCP server registry, workspace bindings, and tool catalog',
        version: '0.1.0',
      },
      servers: [{ url: 'http://localhost:3005' }],
      tags: [{ name: 'servers' }, { name: 'bindings' }, { name: 'tools' }],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

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
