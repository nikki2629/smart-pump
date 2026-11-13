import { ApiClient, ApiError, apiErrorMessage } from '../api/client';
import type { TokenPair } from '../api/types';
import { describe, expect, it, jest } from '@jest/globals';

function makeResponse(status: number, payload?: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => (payload === undefined ? '' : JSON.stringify(payload)),
  } as Response;
}

function makeStorage(initial: TokenPair | null) {
  let current = initial;
  return {
    get: async () => current,
    set: async (tokens: TokenPair) => {
      current = tokens;
    },
    clear: async () => {
      current = null;
    },
    current: () => current,
  };
}

describe('ApiClient', () => {
  it('calls the default fetch implementation with the global receiver', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = function (
      this: typeof globalThis,
      _input: RequestInfo | URL,
    ): Promise<Response> {
      expect(this).toBe(globalThis);
      return Promise.resolve(makeResponse(200, { ok: true }));
    };

    try {
      const client = new ApiClient(
        makeStorage(null),
        undefined,
        () => 'http://localhost:8000/api/v1',
      );
      await expect(client.get('/health/')).resolves.toEqual({ ok: true });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('refreshes an expired access token once and retries with the new token', async () => {
    const storage = makeStorage({ access: 'old-access', refresh: 'refresh-1' });
    const requests: { url: string; init?: RequestInit }[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith('/accounts/token/refresh/')) {
        return makeResponse(200, {
          access: 'new-access',
          refresh: 'refresh-2',
        });
      }
      if (requests.filter((request) => request.url.endsWith('/pumps/')).length === 1) {
        return makeResponse(401, { detail: 'Expired' });
      }
      return makeResponse(200, { results: [] });
    };
    const client = new ApiClient(
      storage,
      fetcher,
      () => 'https://api.example.invalid/api/v1',
    );

    await expect(client.get('/pumps/')).resolves.toEqual({ results: [] });
    expect(storage.current()).toEqual({
      access: 'new-access',
      refresh: 'refresh-2',
    });
    const retriedRequest = requests.filter((request) =>
      request.url.endsWith('/pumps/'),
    )[1];
    expect(retriedRequest.init?.headers).toMatchObject({
      Authorization: 'Bearer new-access',
    });
  });

  it('clears tokens and invokes the session-expiry handler when refresh is rejected', async () => {
    const storage = makeStorage({ access: 'expired', refresh: 'invalid' });
    const fetcher: typeof fetch = async (input) =>
      makeResponse(
        String(input).endsWith('/token/refresh/') ? 401 : 401,
        { detail: 'Not authorized' },
      );
    const client = new ApiClient(
      storage,
      fetcher,
      () => 'https://api.example.invalid/api/v1',
    );
    const onExpired = jest.fn();
    client.setSessionExpiredHandler(onExpired);

    await expect(client.get('/pumps/')).rejects.toBeInstanceOf(ApiError);
    expect(storage.current()).toBeNull();
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('reports network errors as offline errors', async () => {
    const client = new ApiClient(
      makeStorage(null),
      async () => {
        throw new TypeError('Network unavailable');
      },
      () => 'https://api.example.invalid/api/v1',
    );

    await expect(client.get('/pumps/')).rejects.toMatchObject({
      isOffline: true,
      status: 0,
    });
  });

  it('surfaces backend validation messages', async () => {
    const client = new ApiClient(
      makeStorage(null),
      async () => makeResponse(400, { name: ['Pump name is required.'] }),
      () => 'https://api.example.invalid/api/v1',
    );

    let caught: unknown;
    try {
      await client.post('/pumps/', {});
    } catch (error) {
      caught = error;
    }
    expect(apiErrorMessage(caught)).toBe('Pump name is required.');
  });

  it('sends the backend-required idempotency header for command creation', async () => {
    let requestInit: RequestInit | undefined;
    const client = new ApiClient(
      makeStorage({ access: 'access', refresh: 'refresh' }),
      async (_input, init) => {
        requestInit = init;
        return makeResponse(201, { id: 'command-1' });
      },
      () => 'https://api.example.invalid/api/v1',
    );

    await client.post(
      '/commands/',
      { pump_id: 'pump-1', action: 'start' },
      { 'Idempotency-Key': 'idempotency-key-1' },
    );
    expect(requestInit?.headers).toMatchObject({
      'Idempotency-Key': 'idempotency-key-1',
      Authorization: 'Bearer access',
    });
  });

  it('does not send an expired session refresh request for login failures', async () => {
    const storage = makeStorage({ access: 'old', refresh: 'refresh' });
    const requests: string[] = [];
    const client = new ApiClient(
      storage,
      async (input) => {
        requests.push(String(input));
        return makeResponse(401, { detail: 'Invalid email or password.' });
      },
      () => 'https://api.example.invalid/api/v1',
    );

    await expect(
      client.post('/accounts/login/', {
        email: 'user@example.test',
        password: 'bad-password',
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(requests).toHaveLength(1);
  });
});
