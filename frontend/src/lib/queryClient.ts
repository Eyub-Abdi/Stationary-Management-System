import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry auth / client errors; retry transient server errors once.
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 1;
      },
    },
  },
});
