/** Date formatter for full event date display (e.g., "Monday, January 1, 2024, 12:00 PM") */
const longDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

/** Date formatter for compact timestamps (e.g., "Jan 1, 12:00 PM") */
const shortDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

/** Milliseconds per minute for timezone offset calculations */
const MS_PER_MINUTE = 60_000;

/** Pattern for mobile device detection in user agent */
const MOBILE_UA_PATTERN = /android|iphone|ipad|ipod|mobile/i;

/**
 * Converts an ISO date string to datetime-local input format.
 * Adjusts for the local timezone offset.
 */
export function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * MS_PER_MINUTE;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

/** Formats a date string for full display with day of week */
export function formatLongDateTime(value: string): string {
  return longDateTimeFormatter.format(new Date(value));
}

/** Formats a date string for compact display */
export function formatShortDateTime(value: string): string {
  return shortDateTimeFormatter.format(new Date(value));
}

/**
 * Sanitizes a string for use as a file name.
 * Converts to lowercase, replaces special characters with hyphens.
 */
export function sanitizeFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Formats a nickname for display as photo attribution */
export function formatUploaderLabel(nickname: string | null): string {
  const resolvedNickname = nickname?.trim();
  return resolvedNickname ? `From ${resolvedNickname}` : "From a guest";
}

/** Formats a nickname for use in file names, defaults to "guest" */
export function formatUploaderFileToken(nickname: string | null): string {
  return sanitizeFileName(nickname?.trim() || "guest") || "guest";
}

/** Detects if the current device is likely a mobile device */
export function detectMobileDevice(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return MOBILE_UA_PATTERN.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
}
