# syntax=docker/dockerfile:1
# Build context: urule-repos/ (parent of urule and the standalone). Compose:
#   build:
#     context: ../../..
#     dockerfile: mcp-gateway/Dockerfile
#
# Workspace deps (@urule/auth-middleware, @urule/authz, @urule/authz-middleware,
# @urule/correlation-id, @urule/events, @urule/observability) are `file:..` paths in
# package.json and resolved here via copies into the build context. Caller is
# expected to have run `npm --prefix urule run build:all` so the consumed
# dist/ directories are populated before `docker compose build`.

FROM node:20-slim AS builder
WORKDIR /app
COPY urule/packages/auth-middleware/package.json urule/packages/auth-middleware/package.json
COPY urule/packages/auth-middleware/dist urule/packages/auth-middleware/dist
COPY urule/packages/authz/package.json urule/packages/authz/package.json
COPY urule/packages/authz/dist urule/packages/authz/dist
COPY urule/packages/authz-middleware/package.json urule/packages/authz-middleware/package.json
COPY urule/packages/authz-middleware/dist urule/packages/authz-middleware/dist
COPY urule/packages/correlation-id/package.json urule/packages/correlation-id/package.json
COPY urule/packages/correlation-id/dist urule/packages/correlation-id/dist
COPY urule/packages/events/package.json urule/packages/events/package.json
COPY urule/packages/events/dist urule/packages/events/dist
COPY urule/packages/observability/package.json urule/packages/observability/package.json
COPY urule/packages/observability/dist urule/packages/observability/dist
COPY mcp-gateway/package.json mcp-gateway/package-lock.json mcp-gateway/
WORKDIR /app/mcp-gateway
RUN npm ci --install-links
WORKDIR /app
COPY mcp-gateway/tsconfig.json mcp-gateway/tsconfig.json
COPY mcp-gateway/src mcp-gateway/src
WORKDIR /app/mcp-gateway
RUN npm run build

FROM builder AS migrator
WORKDIR /app/mcp-gateway
COPY mcp-gateway/drizzle.config.ts ./
COPY mcp-gateway/migrations ./migrations
CMD ["npx", "drizzle-kit", "migrate"]

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY urule/packages/auth-middleware/package.json urule/packages/auth-middleware/package.json
COPY urule/packages/auth-middleware/dist urule/packages/auth-middleware/dist
COPY urule/packages/authz/package.json urule/packages/authz/package.json
COPY urule/packages/authz/dist urule/packages/authz/dist
COPY urule/packages/authz-middleware/package.json urule/packages/authz-middleware/package.json
COPY urule/packages/authz-middleware/dist urule/packages/authz-middleware/dist
COPY urule/packages/correlation-id/package.json urule/packages/correlation-id/package.json
COPY urule/packages/correlation-id/dist urule/packages/correlation-id/dist
COPY urule/packages/events/package.json urule/packages/events/package.json
COPY urule/packages/events/dist urule/packages/events/dist
COPY urule/packages/observability/package.json urule/packages/observability/package.json
COPY urule/packages/observability/dist urule/packages/observability/dist
COPY mcp-gateway/package.json mcp-gateway/package-lock.json mcp-gateway/
WORKDIR /app/mcp-gateway
RUN npm ci --omit=dev --install-links
COPY --from=builder /app/mcp-gateway/dist ./dist
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/healthz').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
