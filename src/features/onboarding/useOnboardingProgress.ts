import { useQuery } from "@tanstack/react-query";
import { listActivity } from "../../lib/api/activity";
import { listManualLogs } from "../../lib/api/manualLogs";
import { listProjects } from "../../lib/api/projects";
import { listReports } from "../../lib/api/reports";
import { getSettings } from "../../lib/api/settings";
import { listWeeklyTasks } from "../../lib/api/weeklyTasks";
import { listWorkspaces } from "../../lib/api/workspaces";
import { useWeekRange } from "../../hooks/useWeekRange";
import { buildOnboardingProgress } from "./onboardingSteps";

export function useOnboardingProgress() {
  const weekRange = useWeekRange();
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });
  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: listWorkspaces,
  });
  const activityQuery = useQuery({
    queryKey: ["activity", weekRange.from, weekRange.to, "onboarding"],
    queryFn: () =>
      listActivity({
        from: weekRange.from,
        to: weekRange.to,
      }),
  });
  const manualLogsQuery = useQuery({
    queryKey: ["manualLogs", weekRange.from, weekRange.to, "onboarding"],
    queryFn: () =>
      listManualLogs({
        from: weekRange.from,
        to: weekRange.to,
      }),
  });
  const reportsQuery = useQuery({
    queryKey: ["reports", "onboarding"],
    queryFn: listReports,
  });
  const tasksQuery = useQuery({
    queryKey: ["weeklyTasks", weekRange.from, weekRange.to, "onboarding"],
    queryFn: () =>
      listWeeklyTasks({
        weekStartDate: weekRange.from,
        weekEndDate: weekRange.to,
      }),
  });

  const progress = buildOnboardingProgress({
    settings: settingsQuery.data,
    projects: projectsQuery.data ?? [],
    workspaces: workspacesQuery.data ?? [],
    activityItems: activityQuery.data?.flatMap((day) => day.items) ?? [],
    manualLogs: manualLogsQuery.data ?? [],
    reports: reportsQuery.data ?? [],
    tasks: tasksQuery.data ?? [],
  });

  return {
    progress,
    settingsQuery,
    projectsQuery,
    workspacesQuery,
    activityQuery,
    manualLogsQuery,
    reportsQuery,
    tasksQuery,
    weekRange,
    isLoading:
      settingsQuery.isLoading ||
      projectsQuery.isLoading ||
      workspacesQuery.isLoading ||
      activityQuery.isLoading ||
      manualLogsQuery.isLoading ||
      reportsQuery.isLoading ||
      tasksQuery.isLoading,
  };
}
