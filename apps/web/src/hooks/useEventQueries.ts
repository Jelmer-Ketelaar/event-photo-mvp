import { useQuery } from "@tanstack/react-query";
import type { EventAdmin, EventPublic, PhotoRecord, PublicConfig } from "@event-photo/shared";
import { fetchAdminEvent, fetchAdminPhotos, fetchGuestEvent, fetchGuestPhotos, fetchPublicConfig } from "../lib/api";
import { queryKeys } from "../lib/query";

export type GuestAlbumData = {
  eventData: EventPublic;
  photos: PhotoRecord[];
};

export type AdminAlbumData = {
  eventData: EventAdmin;
  photos: PhotoRecord[];
};

export function usePublicConfigQuery() {
  return useQuery({
    queryKey: queryKeys.publicConfig,
    queryFn: (): Promise<PublicConfig> => fetchPublicConfig()
  });
}

export function useAdminEventQuery(adminToken: string) {
  return useQuery({
    queryKey: queryKeys.adminEvent(adminToken),
    queryFn: () => fetchAdminEvent(adminToken),
    enabled: Boolean(adminToken)
  });
}

export function useGuestAlbumQuery(guestToken: string) {
  return useQuery({
    queryKey: queryKeys.guestAlbum(guestToken),
    queryFn: async (): Promise<GuestAlbumData> => {
      const [eventData, photoResponse] = await Promise.all([
        fetchGuestEvent(guestToken),
        fetchGuestPhotos(guestToken)
      ]);

      return {
        eventData,
        photos: photoResponse.photos
      };
    },
    enabled: Boolean(guestToken)
  });
}

export function useAdminAlbumQuery(adminToken: string) {
  return useQuery({
    queryKey: queryKeys.adminAlbum(adminToken),
    queryFn: async (): Promise<AdminAlbumData> => {
      const [eventData, photoResponse] = await Promise.all([
        fetchAdminEvent(adminToken),
        fetchAdminPhotos(adminToken)
      ]);

      return {
        eventData,
        photos: photoResponse.photos
      };
    },
    enabled: Boolean(adminToken)
  });
}
