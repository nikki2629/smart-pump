import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { keyValueStore } from '../api/keyValueStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe('key-value storage on web', () => {
  const originalPlatform = Platform.OS;
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    'sessionStorage',
  );
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'web',
    });
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: originalPlatform,
    });
    if (originalStorage) {
      Object.defineProperty(globalThis, 'sessionStorage', originalStorage);
    } else {
      Reflect.deleteProperty(globalThis, 'sessionStorage');
    }
  });

  it('stores, reads, and removes values in the browser session', async () => {
    await keyValueStore.set('tokens', 'saved');
    await expect(keyValueStore.get('tokens')).resolves.toBe('saved');
    await keyValueStore.delete('tokens');
    await expect(keyValueStore.get('tokens')).resolves.toBeNull();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('reports when browser session storage is unavailable', async () => {
    Reflect.deleteProperty(globalThis, 'sessionStorage');
    await expect(keyValueStore.get('tokens')).rejects.toThrow(
      'Session storage is unavailable in this browser.',
    );
  });
});
