// In production the API is served from the same origin as the app, so the
// base URL is empty. In development it points at the local Express server.
const fallback = import.meta.env.DEV ? 'http://localhost:4000' : '';
export const API_URL = (import.meta.env.VITE_API_URL ?? fallback).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// Every request resolves to the JSON body or throws an ApiError with a
// message that is safe to show to players.
async function request(path, { method = 'GET', body, timeout = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('NETWORK', 'We cannot reach the PlayHive server right now. Check your connection and try again.', 0);
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new ApiError(data?.error?.code || 'HTTP_ERROR', data?.error?.message || 'Something went wrong. Please try again.', res.status);
  }
  return data;
}

export const api = {
  games: () => request('/api/games'),
  createRoom: (body) => request('/api/rooms', { method: 'POST', body }),
  getRoom: (code) => request(`/api/rooms/${encodeURIComponent(code)}`),
  joinRoom: (code, body) => request(`/api/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', body }),
  history: (id) => request(`/api/history/${encodeURIComponent(id)}`),
  health: () => request('/api/health', { timeout: 60000 }),
};
