import { Capacitor } from "@capacitor/core";
import type {
  CreateEventInput,
  CreateEventResponse,
  EventAdmin,
  EventPublic,
  PhotoRecord,
  PublicConfig
} from "@event-photo/shared";

const CONFIGURED_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "");
const LOCAL_WEB_API_BASE_URL = "http://127.0.0.1:8787";
const LOCAL_ANDROID_API_BASE_URL = "http://10.0.2.2:8787";
const DEV_SERVER_PORTS = new Set(["5173", "4173"]);

function getDefaultApiBaseUrl() {
  if (Capacitor.isNativePlatform()) {
    if (CONFIGURED_API_BASE_URL) {
      return CONFIGURED_API_BASE_URL;
    }

    return Capacitor.getPlatform() === "android" ? LOCAL_ANDROID_API_BASE_URL : LOCAL_WEB_API_BASE_URL;
  }

  if (!import.meta.env.DEV && typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }

  if (CONFIGURED_API_BASE_URL) {
    return CONFIGURED_API_BASE_URL;
  }

  return getWebApiBaseUrl();
}

function getWebApiBaseUrl() {
  if (typeof window === "undefined") {
    return LOCAL_WEB_API_BASE_URL;
  }

  if (isLoopbackHostname(window.location.hostname) || DEV_SERVER_PORTS.has(window.location.port)) {
    return LOCAL_WEB_API_BASE_URL;
  }

  return window.location.origin.replace(/\/$/, "");
}

function isLoopbackHostname(hostname: string) {
  return ["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname);
}

function toNetworkError(error: unknown) {
  if (!CONFIGURED_API_BASE_URL && Capacitor.isNativePlatform()) {
    return new Error("Native builds need VITE_API_BASE_URL set to a reachable HTTPS API URL.");
  }

  return error instanceof Error ? error : new Error("Request failed");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const hasBody = init?.body !== undefined && init.body !== null;
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  if (hasBody && !isFormData && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`${getDefaultApiBaseUrl()}${path}`, {
      ...init,
      headers
    });
  } catch (error) {
    throw toNetworkError(error);
  }

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
  return getDefaultApiBaseUrl();
}

export function toAbsoluteMediaUrl(path: string) {
  return path.startsWith("http") ? path : `${getDefaultApiBaseUrl()}${path}`;
}

export async function createEvent(input: CreateEventInput) {
  return request<CreateEventResponse>("/api/events", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function fetchPublicConfig() {
  return request<PublicConfig>("/api/public-config");
}

export async function fetchGuestEvent(guestToken: string) {
  return request<EventPublic>(`/api/events/${guestToken}`);
}

export async function fetchGuestPhotos(guestToken: string) {
  return request<{ photos: PhotoRecord[] }>(`/api/events/${guestToken}/photos`);
}

export async function createGuestSession(guestToken: string, nickname: string, turnstileToken?: string) {
  return request<{ sessionToken: string; nickname: string | null }>(`/api/events/${guestToken}/sessions`, {
    method: "POST",
    body: JSON.stringify({ nickname, turnstileToken })
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

  const response = await fetch(`${getDefaultApiBaseUrl()}/api/events/${guestToken}/photos`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionToken}`
    },
    body: formData
  }).catch((error) => {
    throw toNetworkError(error);
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
