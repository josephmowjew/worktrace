import type { QueryClient, QueryKey } from "@tanstack/react-query";

export const workEvidenceQueryRoots = [
  ["activity"],
  ["activityGroups"],
  ["manualLogs"],
  ["weeklyTasks"],
  ["reports"],
  ["reportNotes"],
  ["dashboard-stats"],
  ["dashboard-activity-hours"],
  ["dashboard-breakdown"],
  ["projectStats"],
  ["weekSummary"],
  ["keyHighlights"],
  ["heatmap"],
  ["weekCapacity"],
  ["frictionInsights"],
] as const satisfies readonly QueryKey[];

export const weeklyTaskQueryRoots = workEvidenceQueryRoots.filter(
  (queryKey) => queryKey[0] === "weeklyTasks",
) as Extract<(typeof workEvidenceQueryRoots)[number], readonly ["weeklyTasks"]>[];

type InvalidateWorkEvidenceOptions = {
  extraQueryKeys?: readonly QueryKey[];
};

export async function invalidateWorkEvidence(
  queryClient: QueryClient,
  options: InvalidateWorkEvidenceOptions = {},
) {
  await Promise.all(
    [...workEvidenceQueryRoots, ...(options.extraQueryKeys ?? [])].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}
