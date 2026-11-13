import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { AppState } from 'react-native';

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(
      state.isConnected !== false && state.isInternetReachable !== false,
    );
  }),
);

focusManager.setEventListener((setFocused) => {
  const subscription = AppState.addEventListener('change', (state) => {
    setFocused(state === 'active');
  });
  return () => subscription.remove();
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      staleTime: 15_000,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
