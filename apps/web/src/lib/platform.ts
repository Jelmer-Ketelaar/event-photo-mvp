import { Capacitor } from "@capacitor/core";

/** Checks if running as a native app (iOS/Android) vs web browser */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Returns the current platform: "ios", "android", or "web" */
export function getNativePlatform(): string {
  return Capacitor.getPlatform();
}
