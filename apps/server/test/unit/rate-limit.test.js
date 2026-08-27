import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../../src/config/env.js';
import { LoginRateLimiter } from '../../src/services/admin-auth.js';
import { apiRateLimit, loginRateLimit } from '../../src/middleware/rate-limit.js';

describe('local rate-limit testing override', () => {
  it('disables API and login middleware when explicitly requested', () => {
    const apiNext = vi.fn();
    apiRateLimit({ disabled: true })({}, {}, apiNext);
    expect(apiNext).toHaveBeenCalledOnce();

    const loginNext = vi.fn();
    const login = loginRateLimit({ disabled: true, max: 1 });
    login.middleware({ body: { username: 'demo' }, ip: '127.0.0.1' }, {}, loginNext);
    expect(loginNext).toHaveBeenCalledOnce();
    login.limiter.recordFailure('127.0.0.1', 'demo');
    expect(login.limiter.isBlocked('127.0.0.1', 'demo')).toBe(false);
    clearInterval(login.limiter.pruneTimer);
  });

  it('keeps the normal login limiter enabled by default', () => {
    const limiter = new LoginRateLimiter({ max: 1, windowMs: 60_000 });
    limiter.recordFailure('127.0.0.1', 'demo');
    expect(limiter.isBlocked('127.0.0.1', 'demo')).toBe(true);
    clearInterval(limiter.pruneTimer);
  });

  it('rejects the testing override in production', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DISABLE_RATE_LIMITS: 'true',
        SESSION_SECRET: 'production-test-secret-that-is-at-least-32-chars',
        COOKIE_SECURE: 'true',
        TRUST_PROXY: 'true',
      }),
    ).toThrow(/only allowed in development or test/i);
  });
});
