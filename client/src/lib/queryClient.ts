import { QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error: any) => {
        if (error?.status === 401) {
          // Token expired — try to refresh, then retry once
          useAuthStore.getState().clearAuth();
          return false;
        }
        if (error?.status === 403) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
