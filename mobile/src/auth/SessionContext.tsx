import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api } from '@/api/endpoints';
import { apiClient } from '@/api/client';
import { tokenStore } from '@/api/tokenStore';
import type { TokenPair } from '@/api/types';
import { queryClient } from '@/data/queryClient';

type SessionContextValue = {
  hydrated: boolean;
  hydrationError: Error | null;
  tokens: TokenPair | null;
  signIn: (tokens: TokenPair) => Promise<void>;
  signOut: () => Promise<void>;
  clearSession: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<TokenPair | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [hydrationError, setHydrationError] = useState<Error | null>(null);

  const clearSession = useCallback(async () => {
    let storageError: unknown;
    try {
      await tokenStore.clear();
    } catch (error) {
      storageError = error;
    } finally {
      setTokens(null);
      queryClient.clear();
    }
    if (storageError) {
      throw storageError;
    }
  }, []);

  useEffect(() => {
    apiClient.setSessionExpiredHandler(() => {
      setTokens(null);
      queryClient.clear();
    });
    void tokenStore
      .get()
      .then(setTokens)
      .catch((error: unknown) => {
        setHydrationError(
          error instanceof Error
            ? error
            : new Error('Unable to load the saved session.'),
        );
      })
      .finally(() => setHydrated(true));
    return () => apiClient.setSessionExpiredHandler(null);
  }, []);

  const signIn = useCallback(async (nextTokens: TokenPair) => {
    await tokenStore.set(nextTokens);
    setTokens(nextTokens);
    queryClient.clear();
  }, []);

  const signOut = useCallback(async () => {
    const activeTokens = await tokenStore.get();
    try {
      if (activeTokens?.refresh) {
        try {
          await api.logout(activeTokens.refresh);
        } catch (logoutError) {
          const rotatedTokens = await tokenStore.get();
          if (
            !rotatedTokens?.refresh ||
            rotatedTokens.refresh === activeTokens.refresh
          ) {
            throw logoutError;
          }
          await api.logout(rotatedTokens.refresh);
        }
      }
    } finally {
      await clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({
      hydrated,
      hydrationError,
      tokens,
      signIn,
      signOut,
      clearSession,
    }),
    [hydrated, hydrationError, tokens, signIn, signOut, clearSession],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside SessionProvider.');
  }
  return value;
}
