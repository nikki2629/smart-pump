import { keyValueStore } from './keyValueStore';
import type { TokenPair } from './types';

const TOKEN_STORAGE_KEY = 'smart-pump.auth.tokens.v1';

export const tokenStore = {
  async get(): Promise<TokenPair | null> {
    const stored = await keyValueStore.get(TOKEN_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    try {
      const value: unknown = JSON.parse(stored);
      if (
        typeof value === 'object' &&
        value !== null &&
        'access' in value &&
        'refresh' in value &&
        typeof value.access === 'string' &&
        typeof value.refresh === 'string'
      ) {
        return { access: value.access, refresh: value.refresh };
      }
    } catch {
      await this.clear();
      return null;
    }

    await this.clear();
    return null;
  },

  async set(tokens: TokenPair): Promise<void> {
    await keyValueStore.set(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
  },

  async clear(): Promise<void> {
    await keyValueStore.delete(TOKEN_STORAGE_KEY);
  },
};
