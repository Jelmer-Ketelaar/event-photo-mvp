import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

export const queryKeys = {
  adminEvent: (adminToken: string) => ["admin-event", adminToken] as const,
  adminAlbum: (adminToken: string) => ["admin-album", adminToken] as const,
  guestAlbum: (guestToken: string) => ["guest-album", guestToken] as const
};
