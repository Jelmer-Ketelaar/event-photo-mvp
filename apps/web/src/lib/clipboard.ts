const COPY_FALLBACK_ID = "eventframe-copy-buffer";

export async function copyText(value: string) {
  if (await tryClipboardApi(value)) {
    return true;
  }

  return tryLegacyCopy(value);
}

async function tryClipboardApi(value: string) {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }

  if (!window.isSecureContext || typeof navigator.clipboard?.writeText !== "function") {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function tryLegacyCopy(value: string) {
  if (typeof document === "undefined") {
    return false;
  }

  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");

  textarea.id = COPY_FALLBACK_ID;
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, value.length);

  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    activeElement?.focus();
  }
}
