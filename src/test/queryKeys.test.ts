import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  invalidateWorkEvidence,
  weeklyTaskQueryRoots,
  workEvidenceQueryRoots,
} from "../lib/api/queryKeys";

describe("query key invalidation helpers", () => {
  it("invalidates every work evidence root", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    await invalidateWorkEvidence(queryClient);

    expect(invalidateQueries).toHaveBeenCalledTimes(workEvidenceQueryRoots.length);
    expect(invalidateQueries.mock.calls.map(([options]) => options.queryKey)).toEqual(
      workEvidenceQueryRoots,
    );
  });

  it("includes contextual extra keys after the shared roots", async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);
    const queryClient = { invalidateQueries } as unknown as QueryClient;
    const extraQueryKeys = [["manualLogAttachments", "log-1"], ["todayCommandCenter", "2026-06-11"]] as const;

    await invalidateWorkEvidence(queryClient, { extraQueryKeys });

    expect(invalidateQueries.mock.calls.map(([options]) => options.queryKey)).toEqual([
      ...workEvidenceQueryRoots,
      ...extraQueryKeys,
    ]);
  });

  it("keeps weekly task roots derived from the shared work evidence roots", () => {
    expect(weeklyTaskQueryRoots).toEqual([["weeklyTasks"]]);
  });
});
