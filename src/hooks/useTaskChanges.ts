import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { invalidateWorkEvidence } from "../lib/api/queryKeys";

/** Keep the main workspace and the separate native widget on the same task records. */
export function useTaskChanges() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen("tasks://changed", () => {
      void invalidateWorkEvidence(queryClient, { extraQueryKeys: [["todayCommandCenter"], ["priorityReminders"]] });
    }).then((cleanup) => { if (disposed) cleanup(); else unlisten = cleanup; }).catch(() => {});
    return () => { disposed = true; unlisten?.(); };
  }, [queryClient]);
}
