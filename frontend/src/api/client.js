import axios from 'axios';

/**
 * One shared API client. Cookies carry the session (withCredentials).
 * Every error is normalised to ApiError so screens can rely on one shape:
 * { status, code, message, details, requestId, currentVersion }.
 */
export class ApiError extends Error {
  constructor({ status, code, message, details, requestId, currentVersion }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details || [];
    this.requestId = requestId || null;
    this.currentVersion = currentVersion;
  }
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 20000,
});

let unauthorizedHandler = null;

/** AuthContext registers a handler that clears the user on 401. */
export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

export function normalizeError(error) {
  if (error instanceof ApiError) return error;
  if (error && error.response) {
    const body = error.response.data && error.response.data.error ? error.response.data.error : {};
    return new ApiError({
      status: error.response.status,
      code: body.code || 'HTTP_ERROR',
      message: body.message || `Request failed with status ${error.response.status}.`,
      details: body.details,
      requestId: body.requestId,
      currentVersion: body.currentVersion,
    });
  }
  return new ApiError({
    status: 0,
    code: 'NETWORK_ERROR',
    message: 'The server could not be reached. Check your connection and try again.',
  });
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const normalized = normalizeError(error);
    const url = error && error.config ? error.config.url || '' : '';
    if (normalized.status === 401 && unauthorizedHandler && !url.startsWith('/auth/')) {
      unauthorizedHandler();
    }
    return Promise.reject(normalized);
  }
);

/** Builds the If-Match header for optimistic concurrency. */
export function ifMatch(version) {
  return { headers: { 'If-Match': String(version) } };
}

export default api;
