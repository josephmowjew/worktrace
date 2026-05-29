import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { ReactNode } from "react";
import { syncCommits } from "../lib/api/gitSync";
import {
  RepositorySyncProvider,
  useRepositorySync,
} from "../features/repositorySync/RepositorySyncProvider";
import type { SyncCommitsResult } from "../types/gitSync";

vi.mock("../lib/api/gitSync", () => ({
  syncCommits: vi.fn(),
}));

const syncCommitsMock = vi.mocked(syncCommits);

const syncResult: SyncCommitsResult = {
  scannedProjects: 1,
  skippedProjects: 0,
  skippedFreshProjects: 0,
  incrementalProjects: 1,
  fullProjects: 0,
  unchangedProjects: 0,
  fallbackRescans: 0,
  newCommits: 2,
  updatedCommits: 0,
  evidenceRepaired: 0,
  diffSnippetsCollected: 0,
  durationMs: 12,
  slowProjects: [],
  errors: [],
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function renderWithProvider(node: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RepositorySyncProvider>{node}</RepositorySyncProvider>
    </QueryClientProvider>,
  );
}

function SyncConsumer() {
  const repositorySync = useRepositorySync();
  return (
    <div>
      <div data-testid="state">{repositorySync.isSyncing ? "syncing" : "idle"}</div>
      <div data-testid="result">{repositorySync.lastResult?.newCommits ?? "none"}</div>
      <div data-testid="error">{repositorySync.lastError?.message ?? "none"}</div>
      <button
        type="button"
        onClick={() =>
          void repositorySync
            .syncRepositories({
              from: null,
              to: null,
              authorEmail: null,
            })
            .catch(() => undefined)
        }
      >
        Sync
      </button>
    </div>
  );
}

function MountAnotherConsumer() {
  const [showSecond, setShowSecond] = useState(false);
  return (
    <div>
      <SyncConsumer />
      <button type="button" onClick={() => setShowSecond(true)}>
        Mount another
      </button>
      {showSecond ? <div data-testid="second"><SyncConsumer /></div> : null}
    </div>
  );
}

describe("RepositorySyncProvider", () => {
  beforeEach(() => {
    syncCommitsMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("sets shared syncing state while a sync is active", async () => {
    const deferred = createDeferred<SyncCommitsResult>();
    syncCommitsMock.mockReturnValue(deferred.promise);
    renderWithProvider(<SyncConsumer />);

    fireEvent.click(screen.getByRole("button", { name: "Sync" }));

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("syncing"));
    await act(async () => deferred.resolve(syncResult));

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("idle"));
    expect(screen.getByTestId("result")).toHaveTextContent("2");
  });

  it("blocks duplicate triggers while a sync is active", async () => {
    const deferred = createDeferred<SyncCommitsResult>();
    syncCommitsMock.mockReturnValue(deferred.promise);
    renderWithProvider(<SyncConsumer />);

    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    fireEvent.click(screen.getByRole("button", { name: "Sync" }));

    expect(syncCommitsMock).toHaveBeenCalledTimes(1);
    await act(async () => deferred.resolve(syncResult));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("idle"));
  });

  it("shares active state with newly mounted consumers", async () => {
    const deferred = createDeferred<SyncCommitsResult>();
    syncCommitsMock.mockReturnValue(deferred.promise);
    renderWithProvider(<MountAnotherConsumer />);

    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("syncing"));

    fireEvent.click(screen.getByRole("button", { name: "Mount another" }));

    expect(screen.getByTestId("second")).toHaveTextContent("syncing");
    await act(async () => deferred.resolve(syncResult));
  });

  it("clears syncing state and stores errors after failure", async () => {
    const deferred = createDeferred<SyncCommitsResult>();
    syncCommitsMock.mockReturnValue(deferred.promise);
    renderWithProvider(<SyncConsumer />);

    fireEvent.click(screen.getByRole("button", { name: "Sync" }));
    await act(async () => deferred.reject(new Error("sync failed")));

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("idle"));
    expect(screen.getByTestId("error")).toHaveTextContent("sync failed");
  });
});
