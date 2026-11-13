import { getApiBaseUrl } from './config';
import { tokenStore } from './tokenStore';
import type { TokenPair } from './types';

type TokenStorage = typeof tokenStore;

const defaultFetch: typeof fetch = (input, init) =>
  globalThis.fetch(input, init);

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isOffline(): boolean {
    return this.status === 0;
  }
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

function messageFromPayload(payload: unknown, fallback: string): string {
  if (typeof payload !== 'object' || payload === null) {
    return fallback;
  }
  if ('detail' in payload && typeof payload.detail === 'string') {
    return payload.detail;
  }
  if ('non_field_errors' in payload && Array.isArray(payload.non_field_errors)) {
    return payload.non_field_errors.map(String).join(' ');
  }

  const messages = Object.values(payload)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === 'string');
  return messages.length > 0 ? messages.join(' ') : fallback;
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

const noRefreshPaths = [
  '/accounts/register/',
  '/accounts/email/verify/',
  '/accounts/login/',
  '/accounts/token/refresh/',
  '/accounts/password/reset/',
  '/accounts/password/reset/confirm/',
];

export class ApiClient {
  private refreshInFlight: Promise<string | null> | null = null;
  private onSessionExpired: (() => void) | null = null;

  constructor(
    private readonly storage: TokenStorage = tokenStore,
    private readonly fetcher: typeof fetch = defaultFetch,
    private readonly baseUrl: () => string = getApiBaseUrl,
  ) {}

  setSessionExpiredHandler(handler: (() => void) | null): void {
    this.onSessionExpired = handler;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'DELETE' });
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    retryAfterRefresh = true,
  ): Promise<T> {
    const tokens = await this.storage.get();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
    };
    if (tokens?.access) {
      headers.Authorization = `Bearer ${tokens.access}`;
    }

    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl()}${path}`, {
        ...init,
        headers,
      });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new ApiError(
          'Unable to reach the service. Check your connection and try again.',
          0,
          error,
        );
      }
      throw error;
    }

    if (response.status === 401 && retryAfterRefresh && tokens?.refresh) {
      if (noRefreshPaths.some((authPath) => path.startsWith(authPath))) {
        throw new ApiError('Invalid email or password.', 401);
      }
      const access = await this.refreshAccessToken(tokens.refresh);
      if (access) {
        return this.request<T>(path, init, false);
      }
    } else if (response.status === 401 && retryAfterRefresh && tokens) {
      await this.expireSession();
    }

    const payload = await readPayload(response);
    if (!response.ok) {
      throw new ApiError(
        messageFromPayload(payload, `Request failed (${response.status}).`),
        response.status,
        payload,
      );
    }
    return payload as T;
  }

  private async refreshAccessToken(refresh: string): Promise<string | null> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.performRefresh(refresh).finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async performRefresh(refresh: string): Promise<string | null> {
    let response: Response;
    try {
      response = await this.fetcher(
        `${this.baseUrl()}/accounts/token/refresh/`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh }),
        },
      );
    } catch {
      throw new ApiError(
        'Unable to refresh your session while offline. Reconnect and sign in again.',
        0,
      );
    }

    const payload = await readPayload(response);
    if (!response.ok || typeof payload !== 'object' || payload === null) {
      await this.expireSession();
      return null;
    }
    if (!('access' in payload) || typeof payload.access !== 'string') {
      await this.expireSession();
      return null;
    }

    const previous = await this.storage.get();
    const tokens: TokenPair = {
      access: payload.access,
      refresh:
        'refresh' in payload && typeof payload.refresh === 'string'
          ? payload.refresh
          : previous?.refresh ?? refresh,
    };
    await this.storage.set(tokens);
    return tokens.access;
  }

  private async expireSession(): Promise<void> {
    try {
      await this.storage.clear();
    } finally {
      this.onSessionExpired?.();
    }
  }
}

export const apiClient = new ApiClient();
