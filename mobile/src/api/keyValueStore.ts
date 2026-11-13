import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

function getWebStorage(): Storage {
  if (typeof globalThis.localStorage !== 'undefined') {
    return globalThis.localStorage;
  }
  if (typeof globalThis.sessionStorage !== 'undefined') {
    return globalThis.sessionStorage;
  }
  throw new Error('Session storage is unavailable in this browser.');
}

export const keyValueStore = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return getWebStorage().getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },

  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      getWebStorage().setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async delete(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      getWebStorage().removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
