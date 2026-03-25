import { useEffect } from "react";
import type { QueryKey } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { openEventSocket } from "../lib/socket";

export function useEventSocketInvalidation(path: string, queryKey: QueryKey, enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const socket = openEventSocket(path, async () => {
      await queryClient.invalidateQueries({ queryKey });
    });

    return () => socket.close();
  }, [enabled, path, queryClient, queryKey]);
}
