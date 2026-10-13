// Cliente de la API. Toda la comunicación con el servidor pasa por aquí.
// La sesión viaja en una cookie httpOnly, así que el token nunca es accesible desde JavaScript.

import { handleBrowserRequest } from './browserStorage';

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export const onUnauthorized = (fn: Listener) => {
  unauthorizedListeners.add(fn);
  return () => {
    unauthorizedListeners.delete(fn);
  };
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isStaticHost =
    typeof window !== 'undefined' &&
    (window.location.hostname.endsWith('github.io') ||
      window.location.hostname.includes('pages.dev') ||
      window.location.protocol === 'file:' ||
      (window as unknown as { __MOCK_API__?: boolean }).__MOCK_API__ === true);

  if (isStaticHost) {
    return handleBrowserRequest<T>(method, path, body);
  }

  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined || method !== 'GET' ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : method !== 'GET' ? '{}' : undefined,
    });
  } catch {
    return handleBrowserRequest<T>(method, path, body);
  }
  if (res.status === 404 && res.headers.get('content-type')?.includes('text/html')) {
    return handleBrowserRequest<T>(method, path, body);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = data as { error?: string; details?: unknown } | null;
    if (res.status === 401 && path !== '/login' && path !== '/setup') unauthorizedListeners.forEach((f) => f());
    throw new ApiError(res.status, d?.error ?? `Error ${res.status}`, d?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
};

export function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? '?' + s : '';
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
