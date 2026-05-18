import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { ServerRegistry } from './services/server-registry.js';
import { ToolCatalog } from './services/tool-catalog.js';
import { serversRoutes } from './routes/servers.routes.js';
import { bindingsRoutes } from './routes/bindings.routes.js';
import { toolsRoutes } from './routes/tools.routes.js';
import { authMiddleware } from '@urule/auth-middleware';
import { bootstrapAuthzClient } from '@urule/authz';
import { authzMiddleware } from '@urule/authz-middleware';
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
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

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

  // Resource-level authz — decorates request.authz with an OpenFGA-backed
  // AuthzClient. Must come AFTER authMiddleware so request.uruleUser exists.
  const authzClient = await bootstrapAuthzClient(config, app.log);
  await app.register(authzMiddleware, { authzClient });

  // OpenAPI documentation. Tag descriptions surface in swagger-ui as
  // section headers; per-route tags / summaries / descriptions live in
  // each route's `schema:` field. `jsonSchemaTransform` from
  // fastify-type-provider-zod converts the per-route Zod schemas into
  // valid JSON Schema for the spec.
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Urule MCP Gateway API',
        description: 'MCP server registry, workspace bindings, and tool catalog',
        version: '0.1.0',
      },
      servers: [{ url: 'http://localhost:3005' }],
      tags: [
        { name: 'servers', description: 'Register, list, and remove MCP servers + their tool inventories.' },
        { name: 'bindings', description: 'Bind MCP servers to workspaces and inspect what is exposed there.' },
        { name: 'tools', description: 'Browse + look up the tool catalog aggregated across MCP servers.' },
      ],
    },
    transform: jsonSchemaTransform,
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
