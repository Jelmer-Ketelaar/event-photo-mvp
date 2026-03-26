const longDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

const shortDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

export function toDateTimeLocal(value: string) {
  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

export function formatLongDateTime(value: string) {
  return longDateTimeFormatter.format(new Date(value));
}

export function formatShortDateTime(value: string) {
  return shortDateTimeFormatter.format(new Date(value));
}

export function sanitizeFileName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function formatUploaderLabel(nickname: string | null) {
  const resolvedNickname = nickname?.trim();
  return resolvedNickname ? `From ${resolvedNickname}` : "From a guest";
}

export function formatUploaderFileToken(nickname: string | null) {
  return sanitizeFileName(nickname?.trim() || "guest") || "guest";
}

export function detectMobileDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
}
