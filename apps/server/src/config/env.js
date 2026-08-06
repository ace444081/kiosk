import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repository root (four levels up from src/config). */
export const REPO_ROOT = path.resolve(__dirname, '../../../../');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DB_PATH: z.string().default('./data/kiosk.db'),
  SESSION_SECRET: z.string().optional(),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  LOG_LEVEL: z.string().default('info'),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900_000),
});

export function resolveDbPath(dbPath) {
  if (path.isAbsolute(dbPath)) return dbPath;
  return path.resolve(REPO_ROOT, dbPath);
}

/**
 * Load and validate environment configuration.
 * In production/pilot mode startup FAILS if the HTTPS/security posture is
 * inconsistent: secure cookies and trusted proxy must be enabled and a strong
 * session secret must be provided.
 */
export function loadEnv(overrides = {}) {
  const raw = { ...process.env, ...overrides };
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  const env = parsed.data;

  let sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'SESSION_SECRET is required in production/pilot mode (min 32 characters). ' +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
      );
    }
    sessionSecret = crypto.randomBytes(48).toString('hex');
    console.warn(
      '[config] SESSION_SECRET missing in development mode - using a random per-start secret. ' +
        'Admin sessions will not survive a server restart.',
    );
  }
  if (env.NODE_ENV === 'production' && sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters in production/pilot mode.');
  }

  if (env.NODE_ENV === 'production') {
    if (env.COOKIE_SECURE !== 'true') {
      throw new Error(
        'Production/pilot mode requires COOKIE_SECURE=true (HTTPS is terminated by Caddy in front of Node).',
      );
    }
    if (env.TRUST_PROXY !== 'true') {
      throw new Error(
        'Production/pilot mode requires TRUST_PROXY=true (server runs behind Caddy).',
      );
    }
  }

  return {
    ...env,
    sessionSecret,
    cookieSecure: env.COOKIE_SECURE === 'true',
    trustProxy: env.TRUST_PROXY === 'true',
    dbPath: resolveDbPath(env.DB_PATH),
  };
}
