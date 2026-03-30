import { Capacitor } from "@capacitor/core";
import type {
  CreateEventInput,
  CreateEventResponse,
  EventAdmin,
  EventPublic,
  PhotoRecord,
  PublicConfig
} from "@event-photo/shared";

// ============================================================================
// Configuration Constants
// ============================================================================

/** Configured API base URL from environment, with trailing slash removed */
const CONFIGURED_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "");

/** Local API URL for web development */
const LOCAL_WEB_API_BASE_URL = "http://127.0.0.1:8787";

/** Local API URL for Android emulator (special loopback address) */
const LOCAL_ANDROID_API_BASE_URL = "http://10.0.2.2:8787";

/** Vite dev server ports that indicate local development */
const DEV_SERVER_PORTS = new Set(["5173", "4173"]);

/** Loopback hostnames indicating local development */
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

// ============================================================================
// URL Resolution Helpers
// ============================================================================

/** Determines the API base URL based on platform and environment */
function getDefaultApiBaseUrl(): string {
  // Native app: use configured URL or platform-specific local URL
  if (Capacitor.isNativePlatform()) {
    if (CONFIGURED_API_BASE_URL) {
      return CONFIGURED_API_BASE_URL;
    }
    return Capacitor.getPlatform() === "android"
      ? LOCAL_ANDROID_API_BASE_URL
      : LOCAL_WEB_API_BASE_URL;
  }

  // Production web: use same origin
  if (!import.meta.env.DEV && typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }

  // Development web: use configured URL or detect from context
  return CONFIGURED_API_BASE_URL ?? getWebApiBaseUrl();
}

/** Determines the API base URL for web platform */
function getWebApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return LOCAL_WEB_API_BASE_URL;
  }

  const isLocalDev = isLoopbackHostname(window.location.hostname) ||
    DEV_SERVER_PORTS.has(window.location.port);

  return isLocalDev
    ? LOCAL_WEB_API_BASE_URL
    : window.location.origin.replace(/\/$/, "");
}

/** Checks if hostname is a local loopback address */
function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname);
}

// ============================================================================
// Error Handling
// ============================================================================

/** Native app error message when API URL is not configured */
const NATIVE_CONFIG_ERROR = "Native builds need VITE_API_BASE_URL set to a reachable HTTPS API URL.";

/** Converts network errors to user-friendly Error instances */
function toNetworkError(error: unknown): Error {
  if (!CONFIGURED_API_BASE_URL && Capacitor.isNativePlatform()) {
    return new Error(NATIVE_CONFIG_ERROR);
  }

  return error instanceof Error ? error : new Error("Request failed");
}

// ============================================================================
// Core Request Utilities
// ============================================================================

/**
 * Makes an API request with automatic JSON handling.
 * Sets Content-Type for non-FormData bodies automatically.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const hasBody = init?.body !== undefined && init.body !== null;
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

  // Auto-set JSON content type for non-form data requests with a body
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

/** Safely parses JSON from a response, returning null on failure */
async function safeJson(response: Response): Promise<{ error?: string } | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// ============================================================================
// Public Utilities
// ============================================================================

/** Returns the resolved API base URL for the current environment */
export function getApiBaseUrl(): string {
  return getDefaultApiBaseUrl();
}

/** Converts a relative media path to an absolute URL */
export function toAbsoluteMediaUrl(path: string): string {
  return path.startsWith("http") ? path : `${getDefaultApiBaseUrl()}${path}`;
}

// ============================================================================
// Event API Functions
// ============================================================================

/** Creates a new event */
export async function createEvent(input: CreateEventInput): Promise<CreateEventResponse> {
  return request<CreateEventResponse>("/api/events", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

/** Fetches public configuration (Turnstile keys, etc.) */
export async function fetchPublicConfig(): Promise<PublicConfig> {
  return request<PublicConfig>("/api/public-config");
}

/** Fetches public event details for a guest */
export async function fetchGuestEvent(guestToken: string): Promise<EventPublic> {
  return request<EventPublic>(`/api/events/${guestToken}`);
}

/** Fetches photos for a guest event */
export async function fetchGuestPhotos(guestToken: string): Promise<{ photos: PhotoRecord[] }> {
  return request<{ photos: PhotoRecord[] }>(`/api/events/${guestToken}/photos`);
}

/** Creates a guest session to join an event */
export async function createGuestSession(
  guestToken: string,
  nickname: string,
  turnstileToken?: string
): Promise<{ sessionToken: string; nickname: string | null }> {
  return request<{ sessionToken: string; nickname: string | null }>(`/api/events/${guestToken}/sessions`, {
    method: "POST",
    body: JSON.stringify({ nickname, turnstileToken })
  });
}

/** Uploads a photo to an event as a guest */
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
): Promise<void> {
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

// ============================================================================
// Admin API Functions
// ============================================================================

/** Fetches admin event details */
export async function fetchAdminEvent(adminToken: string): Promise<EventAdmin> {
  return request<EventAdmin>(`/api/admin/${adminToken}`);
}

/** Fetches photos for admin management */
export async function fetchAdminPhotos(adminToken: string): Promise<{ photos: PhotoRecord[] }> {
  return request<{ photos: PhotoRecord[] }>(`/api/admin/${adminToken}/photos`);
}

/** Toggles upload permissions for an event */
export async function toggleAdminUploads(adminToken: string, enabled: boolean): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/admin/${adminToken}/uploads`, {
    method: "POST",
    body: JSON.stringify({ enabled })
  });
}

/** Deletes a photo from the event */
export async function deleteAdminPhoto(adminToken: string, photoId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/admin/${adminToken}/photos/${photoId}`, {
    method: "DELETE"
  });
}

/** Permanently closes an event to new uploads */
export async function closeAdminEvent(adminToken: string): Promise<{ ok: boolean; endedAt: string }> {
  return request<{ ok: boolean; endedAt: string }>(`/api/admin/${adminToken}/close`, {
    method: "POST",
    body: JSON.stringify({})
  });
}
