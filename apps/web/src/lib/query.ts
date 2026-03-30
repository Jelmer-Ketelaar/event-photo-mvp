import { QueryClient } from "@tanstack/react-query";

/** Time data is considered fresh before refetching (ms) */
const STALE_TIME_MS = 5_000;

/** Global query client with optimized defaults for the app */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME_MS,
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

/**
 * Centralized query key factory for type-safe cache management.
 * All keys are defined here to ensure consistency and easy cache invalidation.
 */
export const queryKeys = {
  /** Public configuration (Turnstile keys, etc.) */
  publicConfig: ["public-config"] as const,

  /** Admin event details by admin token */
  adminEvent: (adminToken: string) => ["admin-event", adminToken] as const,

  /** Admin album (event + photos) by admin token */
  adminAlbum: (adminToken: string) => ["admin-album", adminToken] as const,

  /** Guest album (event + photos) by guest token */
  guestAlbum: (guestToken: string) => ["guest-album", guestToken] as const
};
