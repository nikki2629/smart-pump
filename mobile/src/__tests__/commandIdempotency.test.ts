import {
  clearCommandIdempotencyKey,
  getCommandIdempotencyKey,
} from '../data/commandIdempotency';
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => values.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      values.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      values.delete(key);
    },
  };
});

jest.mock('expo-crypto', () => {
  let sequence = 0;
  return {
    randomUUID: () => {
      sequence += 1;
      return `123e4567-e89b-4${String(sequence).padStart(3, '0')}-8000-426614174000`;
    },
  };
});

describe('command idempotency key storage', () => {
  it('reuses a saved key after an uncertain request and clears it after resolution', async () => {
    const firstKey = await getCommandIdempotencyKey('pump-1', 'start');
    const retryKey = await getCommandIdempotencyKey('pump-1', 'start');
    await clearCommandIdempotencyKey('pump-1', 'start');
    const nextKey = await getCommandIdempotencyKey('pump-1', 'start');

    expect(firstKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(retryKey).toBe(firstKey);
    expect(nextKey).not.toBe(firstKey);
  });
});
