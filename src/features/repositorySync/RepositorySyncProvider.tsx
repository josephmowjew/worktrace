import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { syncCommits } from "../../lib/api/gitSync";
import { WorkTraceCommandError } from "../../lib/api/client";
import type { SyncCommitsInput, SyncCommitsResult } from "../../types/gitSync";

export type RepositorySyncScope =
  | "all"
  | "workspace"
  | "project"
  | "timeline"
  | "today"
  | "dashboard"
  | "friction"
  | "onboarding"
  | "auto";

type SyncRepositoriesOptions = {
  scope?: RepositorySyncScope;
  onAlreadyRunning?: () => void;
  skipCommonInvalidation?: boolean;
};

type RepositorySyncContextValue = {
  isSyncing: boolean;
  activeScope: RepositorySyncScope | null;
  lastResult: SyncCommitsResult | null;
  lastError: Error | null;
  syncRepositories: (
    input: SyncCommitsInput,
    options?: SyncRepositoriesOptions,
  ) => Promise<SyncCommitsResult>;
};

const RepositorySyncContext = createContext<RepositorySyncContextValue | null>(null);

const commonInvalidationRoots = [
  ["activity"],
  ["activityGroups"],
  ["projects"],
  ["projectStats"],
  ["recentCommits"],
  ["topContributors"],
  ["dashboard-stats"],
  ["dashboard-activity-hours"],
  ["dashboard-breakdown"],
  ["weekSummary"],
  ["keyHighlights"],
  ["heatmap"],
  ["weeklyTasks"],
  ["reports"],
  ["frictionInsights"],
] as const;

export function RepositorySyncProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const inFlightRef = useRef<Promise<SyncCommitsResult> | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeScope, setActiveScope] = useState<RepositorySyncScope | null>(null);
  const [lastResult, setLastResult] = useState<SyncCommitsResult | null>(null);
  const [lastError, setLastError] = useState<Error | null>(null);

  const invalidateCommonSyncViews = useCallback(async () => {
    await Promise.all(
      commonInvalidationRoots.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  }, [queryClient]);

  const syncRepositories = useCallback(
    async (input: SyncCommitsInput, options: SyncRepositoriesOptions = {}) => {
      if (inFlightRef.current) {
        options.onAlreadyRunning?.();
        throw new WorkTraceCommandError(
          "sync_commits",
          "SYNC_IN_PROGRESS",
          "Repository sync is already running.",
        );
      }

      setIsSyncing(true);
      setActiveScope(options.scope ?? "all");
      setLastError(null);

      const syncPromise = syncCommits(input)
        .then(async (result) => {
          setLastResult(result);
          if (!options.skipCommonInvalidation) {
            await invalidateCommonSyncViews();
          }
          return result;
        })
        .catch((error) => {
          if (isRepositorySyncInProgressError(error)) {
            options.onAlreadyRunning?.();
          }
          const normalizedError =
            error instanceof Error ? error : new Error("Repository sync could not be completed.");
          if (!isRepositorySyncInProgressError(normalizedError)) {
            setLastError(normalizedError);
          }
          throw normalizedError;
        })
        .finally(() => {
          inFlightRef.current = null;
          setIsSyncing(false);
          setActiveScope(null);
        });

      inFlightRef.current = syncPromise;
      return syncPromise;
    },
    [invalidateCommonSyncViews],
  );

  const value = useMemo(
    () => ({
      isSyncing,
      activeScope,
      lastResult,
      lastError,
      syncRepositories,
    }),
    [activeScope, isSyncing, lastError, lastResult, syncRepositories],
  );

  return (
    <RepositorySyncContext.Provider value={value}>
      {children}
    </RepositorySyncContext.Provider>
  );
}

export function useRepositorySync() {
  const context = useContext(RepositorySyncContext);
  if (!context) {
    throw new Error("useRepositorySync must be used within RepositorySyncProvider.");
  }
  return context;
}

export function isRepositorySyncInProgressError(error: unknown) {
  return error instanceof WorkTraceCommandError && error.code === "SYNC_IN_PROGRESS";
}
