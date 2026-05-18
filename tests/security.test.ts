import { describe, it, expect } from 'vitest';
import { buildServer } from '../src/server.js';
import { validateConfig, loadConfig } from '../src/config.js';

describe('mcp-gateway — config validation', () => {
  it('throws when DATABASE_URL is missing', () => {
    const original = process.env['DATABASE_URL'];
    delete process.env['DATABASE_URL'];
    try {
      const cfg = loadConfig();
      expect(() => validateConfig(cfg)).toThrowError(/DATABASE_URL/);
    } finally {
      if (original !== undefined) process.env['DATABASE_URL'] = original;
    }
  });

  it('throws when NATS_URL is missing', () => {
    const origDb = process.env['DATABASE_URL'];
    const origNats = process.env['NATS_URL'];
    process.env['DATABASE_URL'] = 'postgres://example.host:5432/test';
    delete process.env['NATS_URL'];
    try {
      const cfg = loadConfig();
      expect(() => validateConfig(cfg)).toThrowError(/NATS_URL/);
    } finally {
      if (origDb !== undefined) process.env['DATABASE_URL'] = origDb;
      else delete process.env['DATABASE_URL'];
      if (origNats !== undefined) process.env['NATS_URL'] = origNats;
    }
  });

  it('does not throw when both DATABASE_URL and NATS_URL are set', () => {
    const origDb = process.env['DATABASE_URL'];
    const origNats = process.env['NATS_URL'];
    process.env['DATABASE_URL'] = 'postgres://example.host:5432/test';
    process.env['NATS_URL'] = 'nats://example.host:4222';
    try {
      const cfg = loadConfig();
      expect(() => validateConfig(cfg)).not.toThrow();
    } finally {
      if (origDb !== undefined) process.env['DATABASE_URL'] = origDb;
      else delete process.env['DATABASE_URL'];
      if (origNats !== undefined) process.env['NATS_URL'] = origNats;
      else delete process.env['NATS_URL'];
    }
  });
});

describe('mcp-gateway — CORS lockdown via real buildServer + CORS_ORIGINS env', () => {
  // Exercises the actual server.ts wiring (env read, comma split, fastify-cors
  // registration). Note: prior to the §1.3 expansion this service had NO CORS
  // registration — the old stub-based tests were testing fastify-cors itself,
  // not this service.
  const FAKE_CONFIG = {
    port: 0,
    host: '127.0.0.1',
    databaseUrl: 'postgres://fake:fake@127.0.0.1:1/fake',
    natsUrl: 'nats://127.0.0.1:1',
    serviceName: 'mcp-gateway-test',
    openfgaUrl: '',
    openfgaStoreId: '',
  };

  async function buildAppWithCorsOrigins(origins: string | undefined) {
    const orig = process.env['CORS_ORIGINS'];
    if (origins === undefined) delete process.env['CORS_ORIGINS'];
    else process.env['CORS_ORIGINS'] = origins;
    try {
      return await buildServer(FAKE_CONFIG);
    } finally {
      if (orig !== undefined) process.env['CORS_ORIGINS'] = orig;
      else delete process.env['CORS_ORIGINS'];
    }
  }

  it('echoes Access-Control-Allow-Origin for the first allow-listed origin', async () => {
    const app = await buildAppWithCorsOrigins('http://allowed.example,http://other.example');
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/healthz',
      headers: { origin: 'http://allowed.example', 'access-control-request-method': 'GET' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://allowed.example');
  });

  it('echoes Access-Control-Allow-Origin for the second comma-separated origin', async () => {
    const app = await buildAppWithCorsOrigins('http://allowed.example,http://other.example');
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/healthz',
      headers: { origin: 'http://other.example', 'access-control-request-method': 'GET' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://other.example');
  });

  it('does not echo Access-Control-Allow-Origin for a non-allow-listed origin', async () => {
    const app = await buildAppWithCorsOrigins('http://allowed.example');
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/healthz',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('falls back to http://localhost:3000 when CORS_ORIGINS is unset', async () => {
    const app = await buildAppWithCorsOrigins(undefined);
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/healthz',
      headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'GET' },
    });
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });
});
