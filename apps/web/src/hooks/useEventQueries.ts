import { useQuery } from "@tanstack/react-query";
import type { EventAdmin, EventPublic, PhotoRecord, PublicConfig } from "@event-photo/shared";
import { fetchAdminEvent, fetchAdminPhotos, fetchGuestEvent, fetchGuestPhotos, fetchPublicConfig } from "../lib/api";
import { queryKeys } from "../lib/query";

/** Combined data structure for guest album view */
export type GuestAlbumData = {
  eventData: EventPublic;
  photos: PhotoRecord[];
};

/** Combined data structure for admin album view */
export type AdminAlbumData = {
  eventData: EventAdmin;
  photos: PhotoRecord[];
};

/** Fetches public configuration (e.g., Turnstile site key) */
export function usePublicConfigQuery() {
  return useQuery({
    queryKey: queryKeys.publicConfig,
    queryFn: fetchPublicConfig
  });
}

/** Fetches admin event details by admin token */
export function useAdminEventQuery(adminToken: string) {
  return useQuery({
    queryKey: queryKeys.adminEvent(adminToken),
    queryFn: () => fetchAdminEvent(adminToken),
    enabled: Boolean(adminToken)
  });
}

/**
 * Fetches guest event data and photos in parallel.
 * Combines both into a single data structure for the guest view.
 */
export function useGuestAlbumQuery(guestToken: string) {
  return useQuery({
    queryKey: queryKeys.guestAlbum(guestToken),
    queryFn: async (): Promise<GuestAlbumData> => {
      const [eventData, photoResponse] = await Promise.all([
        fetchGuestEvent(guestToken),
        fetchGuestPhotos(guestToken)
      ]);

      return { eventData, photos: photoResponse.photos };
    },
    enabled: Boolean(guestToken)
  });
}

/**
 * Fetches admin event data and photos in parallel.
 * Combines both into a single data structure for the admin view.
 */
export function useAdminAlbumQuery(adminToken: string) {
  return useQuery({
    queryKey: queryKeys.adminAlbum(adminToken),
    queryFn: async (): Promise<AdminAlbumData> => {
      const [eventData, photoResponse] = await Promise.all([
        fetchAdminEvent(adminToken),
        fetchAdminPhotos(adminToken)
      ]);

      return { eventData, photos: photoResponse.photos };
    },
    enabled: Boolean(adminToken)
  });
}
