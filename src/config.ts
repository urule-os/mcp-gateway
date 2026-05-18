export interface Config {
  port: number;
  host: string;
  databaseUrl: string;
  natsUrl: string;
  registryUrl: string;
  serviceName: string;
  /** OpenFGA API URL — when empty, authz runs in in-memory mock mode (dev / no-authz stacks). */
  openfgaUrl: string;
  /** OpenFGA store ID — when empty, the `urule` store is reused/created. */
  openfgaStoreId: string;
  /** Optional OpenFGA model ID — when empty, the latest model in the store is used. */
  openfgaModelId?: string;
}

export function loadConfig(): Config {
  return {
    port: parseInt(process.env['PORT'] ?? '3000', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    databaseUrl: process.env['DATABASE_URL'] ?? '',
    natsUrl: process.env['NATS_URL'] ?? 'nats://localhost:4222',
    registryUrl: process.env['REGISTRY_URL'] ?? 'http://localhost:3001',
    serviceName: 'urule-mcp-gateway',
    openfgaUrl: process.env['OPENFGA_URL'] ?? '',
    openfgaStoreId: process.env['OPENFGA_STORE_ID'] ?? '',
    openfgaModelId: process.env['OPENFGA_MODEL_ID'] || undefined,
  };
}

export function validateConfig(config: Config): void {
  const missing: string[] = [];
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (!process.env['NATS_URL']) missing.push('NATS_URL');
  if (missing.length > 0) {
    throw new Error(
      `[${config.serviceName}] Missing required env vars: ${missing.join(', ')}`,
    );
  }
}
