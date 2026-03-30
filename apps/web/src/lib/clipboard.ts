/** ID for fallback textarea element used in legacy copy */
const COPY_FALLBACK_ID = "eventframe-copy-buffer";

/**
 * Copies text to the clipboard using the modern API with legacy fallback.
 * @returns true if copy succeeded, false otherwise
 */
export async function copyText(value: string): Promise<boolean> {
  // Try modern Clipboard API first
  if (await tryClipboardApi(value)) {
    return true;
  }

  // Fall back to execCommand for older browsers
  return tryLegacyCopy(value);
}

/** Attempts to copy using the modern Clipboard API */
async function tryClipboardApi(value: string): Promise<boolean> {
  // Check environment requirements
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }

  // Clipboard API requires secure context and proper support
  const isSupported = window.isSecureContext &&
    typeof navigator.clipboard?.writeText === "function";

  if (!isSupported) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Legacy clipboard copy using execCommand.
 * Creates an invisible textarea, selects its content, and executes copy.
 */
function tryLegacyCopy(value: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  // Store current focus to restore after copy
  const activeElement = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;

  // Create invisible textarea for copy operation
  const textarea = document.createElement("textarea");
  textarea.id = COPY_FALLBACK_ID;
  textarea.value = value;
  textarea.setAttribute("readonly", "true");

  // Position off-screen but still functional
  Object.assign(textarea.style, {
    position: "fixed",
    top: "0",
    left: "0",
    opacity: "0",
    pointerEvents: "none"
  });

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
