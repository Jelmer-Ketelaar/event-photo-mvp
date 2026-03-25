import type {
  CreateEventInput,
  CreateEventResponse,
  EventAdmin,
  EventPublic,
  PhotoRecord
} from "@event-photo/shared";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:8787";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const hasBody = init?.body !== undefined && init.body !== null;
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  if (hasBody && !isFormData && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const errorBody = await safeJson(response);
    throw new Error(errorBody?.error ?? "Request failed");
  }

  return (await response.json()) as T;
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function toAbsoluteMediaUrl(path: string) {
  return path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
}

export async function createEvent(input: CreateEventInput) {
  return request<CreateEventResponse>("/api/events", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function fetchGuestEvent(guestToken: string) {
  return request<EventPublic>(`/api/events/${guestToken}`);
}

export async function fetchGuestPhotos(guestToken: string) {
  return request<{ photos: PhotoRecord[] }>(`/api/events/${guestToken}/photos`);
}

export async function createGuestSession(guestToken: string, nickname: string) {
  return request<{ sessionToken: string; nickname: string | null }>(`/api/events/${guestToken}/sessions`, {
    method: "POST",
    body: JSON.stringify({ nickname })
  });
}

export async function uploadGuestPhoto(
  guestToken: string,
  sessionToken: string,
  payload: {
    blob: Blob;
    fileName: string;
    filterName: string;
    width: number;
    height: number;
  }
) {
  const formData = new FormData();
  formData.append("file", new File([payload.blob], payload.fileName, { type: "image/jpeg" }));
  formData.append("filterName", payload.filterName);
  formData.append("width", String(payload.width));
  formData.append("height", String(payload.height));

  const response = await fetch(`${API_BASE_URL}/api/events/${guestToken}/photos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionToken}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorBody = await safeJson(response);
    throw new Error(errorBody?.error ?? "Upload failed");
  }
}

export async function fetchAdminEvent(adminToken: string) {
  return request<EventAdmin>(`/api/admin/${adminToken}`);
}

export async function fetchAdminPhotos(adminToken: string) {
  return request<{ photos: PhotoRecord[] }>(`/api/admin/${adminToken}/photos`);
}

export async function toggleAdminUploads(adminToken: string, enabled: boolean) {
  return request<{ ok: boolean }>(`/api/admin/${adminToken}/uploads`, {
    method: "POST",
    body: JSON.stringify({ enabled })
  });
}

export async function deleteAdminPhoto(adminToken: string, photoId: string) {
  return request<{ ok: boolean }>(`/api/admin/${adminToken}/photos/${photoId}`, {
    method: "DELETE"
  });
}

export async function closeAdminEvent(adminToken: string) {
  return request<{ ok: boolean; endedAt: string }>(`/api/admin/${adminToken}/close`, {
    method: "POST",
    body: JSON.stringify({})
  });
}
