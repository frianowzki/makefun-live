// Makefun Live — network and small helpers.
// Every request goes to make.fun's public API with an AbortSignal, a timeout and one retry on
// transient failure. Nothing here throws into a paint: callers get { ok, data } or { ok:false, error }.

export const API_ROOT = 'https://make.fun/api';
export const SITE_ROOT = 'https://make.fun';
const TIMEOUT_MS = 12000;
const RETRY_DELAY_MS = 700;

export class ApiError extends Error {
  constructor(message, { status = 0, aborted = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.aborted = aborted;
  }
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new ApiError('aborted', { aborted: true }));
      }, { once: true });
    }
  });
}

// GETs `${API_ROOT}${path}` (path starts with '/'). Resolves to parsed JSON.
export async function apiGet(path, { signal, timeoutMs = TIMEOUT_MS, retries = 1 } = {}) {
  const url = path.startsWith('http') ? path : `${API_ROOT}${path}`;
  let lastError = new ApiError('request failed');
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal && signal.aborted) throw new ApiError('aborted', { aborted: true });
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
        cache: attempt === 0 ? 'default' : 'no-store',
      });
      if (!response.ok) {
        let detail = '';
        try {
          const body = await response.json();
          detail = firstErrorMessage(body);
        } catch {
          detail = '';
        }
        throw new ApiError(detail || `make.fun answered ${response.status}`, { status: response.status });
      }
      return await response.json();
    } catch (err) {
      if (signal && signal.aborted) throw new ApiError('aborted', { aborted: true });
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429) {
        throw err;
      }
      if (err instanceof ApiError && err.aborted === false && err.message === 'aborted') {
        throw err;
      }
      if (controller.signal.aborted && !(signal && signal.aborted)) {
        lastError = new ApiError('make.fun did not answer in time');
      } else if (err instanceof ApiError) {
        lastError = err;
      } else {
        lastError = new ApiError('make.fun could not be reached from this browser');
      }
      if (attempt < retries) await sleep(RETRY_DELAY_MS, signal);
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }
  throw lastError;
}

function firstErrorMessage(body) {
  if (!body || typeof body !== 'object') return '';
  if (Array.isArray(body.error) && body.error.length > 0) {
    const first = body.error[0];
    if (first && typeof first.message === 'string') return first.message;
  }
  if (typeof body.error === 'string') return body.error;
  if (typeof body.message === 'string') return body.message;
  return '';
}

// Wraps an apiGet so a route always receives a result object.
export async function load(path, options) {
  try {
    const data = await apiGet(path, options);
    return { ok: true, data };
  } catch (err) {
    if (err && err.aborted) return { ok: false, aborted: true, error: 'aborted' };
    return { ok: false, aborted: false, error: err && err.message ? err.message : 'unknown error', status: err && err.status ? err.status : 0 };
  }
}
