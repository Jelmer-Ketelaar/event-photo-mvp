import { getApiBaseUrl } from "./api";

/**
 * Opens a WebSocket connection for real-time event updates.
 * Automatically upgrades HTTP(S) to WS(S) protocol.
 * 
 * @param path - API path for the socket endpoint
 * @param onRefresh - Callback invoked when a message is received (typically to refetch data)
 * @returns The WebSocket instance for cleanup
 */
export function openEventSocket(path: string, onRefresh: () => Promise<void>): WebSocket {
  const socketUrl = new URL(path, getApiBaseUrl());
  socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";

  const socket = new WebSocket(socketUrl);
  
  socket.addEventListener("message", () => {
    onRefresh().catch(() => undefined);
  });

  return socket;
}
