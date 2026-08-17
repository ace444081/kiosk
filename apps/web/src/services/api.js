/**
 * API client with a consistent error envelope.
 * Throws ApiError { code, message, fieldErrors, status, requestId }.
 */
export class ApiError extends Error {
  constructor({
    code,
    message,
    fieldErrors,
    status,
    requestId,
    retryAfterSeconds,
    product,
    order,
  }) {
    super(message);
    this.name = 'ApiError';
    this.code = code || 'GENERIC';
    this.fieldErrors = fieldErrors || {};
    this.status = status || 0;
    this.requestId = requestId || null;
    this.retryAfterSeconds = retryAfterSeconds || 0;
    this.product = product || null;
    this.order = order || null;
  }
}

async function request(path, { method = 'GET', body, headers = {}, csrfToken, staffStation } = {}) {
  let response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...(staffStation ? { 'X-Staff-Station': staffStation } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError({ code: 'NETWORK_ERROR', message: 'Cannot reach the server', status: 0 });
  }

  if (response.status === 204) return null;

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const retryHeader = response.headers.get('Retry-After');
    throw new ApiError({
      code: payload?.error?.code || 'GENERIC',
      message: payload?.error?.message || `Request failed (${response.status})`,
      fieldErrors: payload?.error?.fieldErrors || {},
      status: response.status,
      requestId: payload?.requestId || response.headers.get('X-Request-Id'),
      retryAfterSeconds: retryHeader ? Number(retryHeader) || 0 : 0,
      product: payload?.product,
      order: payload?.order,
    });
  }
  return payload;
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
};

export function idempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
