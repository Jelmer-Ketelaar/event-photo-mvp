import { getApiBaseUrl } from "./api";

export function openEventSocket(path: string, onRefresh: () => Promise<void>) {
  const socketUrl = new URL(path, getApiBaseUrl());
  socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";

  const socket = new WebSocket(socketUrl);
  socket.addEventListener("message", () => {
    onRefresh().catch(() => undefined);
  });

  return socket;
}
