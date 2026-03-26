export interface Config {
  port: number;
  host: string;
  databaseUrl: string;
  natsUrl: string;
  registryUrl: string;
  serviceName: string;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env['PORT'] ?? '3000', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    databaseUrl: process.env['DATABASE_URL'] ?? 'postgres://urule:urule@localhost:5432/mcp_gateway',
    natsUrl: process.env['NATS_URL'] ?? 'nats://localhost:4222',
    registryUrl: process.env['REGISTRY_URL'] ?? 'http://localhost:3001',
    serviceName: 'urule-mcp-gateway',
  };
}

export function validateConfig(config: Config): void {
  const missing: string[] = [];
  if (!process.env['DATABASE_URL'] && config.databaseUrl.includes('localhost')) {
    missing.push('DATABASE_URL (using default)');
  }
  if (missing.length > 0) {
    console.warn(`[${config.serviceName}] Config warnings: ${missing.join(', ')}`);
  }
}
