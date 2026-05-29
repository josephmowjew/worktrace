import type { ActivityItem } from "../../types/activity";
import type { ManualLog } from "../../types/manualLog";
import type { Project } from "../../types/project";
import type { ReportSummary } from "../../types/report";
import type { Settings } from "../../types/settings";
import type { WeeklyTask } from "../../types/weeklyTask";
import type { Workspace } from "../../types/workspace";

export type OnboardingStepId = "profile" | "projects" | "sync" | "capture" | "report";

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  detail: string;
  action: string;
  done: boolean;
  disabled?: boolean;
};

export type OnboardingEvidence = {
  settings?: Settings;
  projects: Project[];
  workspaces: Workspace[];
  activityItems: ActivityItem[];
  manualLogs: ManualLog[];
  reports: ReportSummary[];
  tasks: WeeklyTask[];
};

export type OnboardingProgress = {
  steps: OnboardingStep[];
  completedCount: number;
  isComplete: boolean;
  profileComplete: boolean;
  projectsComplete: boolean;
  syncComplete: boolean;
  captureComplete: boolean;
  reportComplete: boolean;
  hasMeaningfulSetup: boolean;
  reportReadyCount: number;
  commitCount: number;
  manualLogCount: number;
  hasSyncableProjects: boolean;
  nextStep: OnboardingStep | null;
};

export function buildOnboardingProgress(evidence: OnboardingEvidence): OnboardingProgress {
  const persistedSteps = new Set(evidence.settings?.onboardingCompletedSteps ?? []);
  const activeProjects = evidence.projects.filter((project) => project.status === "active");
  const activeWorkspaces = evidence.workspaces.filter((workspace) => workspace.status === "active");
  const commitCount = evidence.activityItems.filter((item) => item.activityType === "commit").length;
  const manualLogCount = evidence.manualLogs.length;
  const reportIncludedManualLogCount = evidence.manualLogs.filter((log) => log.includedInReport).length;
  const hasSyncableProjects = activeProjects.some((project) => Boolean(project.repoPath));

  const profileComplete = Boolean(
    evidence.settings &&
      evidence.settings.name.trim() &&
      evidence.settings.email.trim() &&
      evidence.settings.name !== "John Developer" &&
      evidence.settings.email !== "johndev@worktrace.app",
  );
  const projectsComplete =
    activeProjects.length > 0 || activeWorkspaces.length > 0 || persistedSteps.has("projects");
  const syncComplete = commitCount > 0 || persistedSteps.has("sync");
  const captureComplete =
    manualLogCount > 0 || evidence.tasks.length > 0 || persistedSteps.has("capture");
  const reportComplete = evidence.reports.length > 0 || persistedSteps.has("report");
  const reportReadyCount =
    evidence.activityItems.filter((item) => item.includedInReport).length +
    evidence.tasks.filter((task) => task.includedInReport).length +
    reportIncludedManualLogCount;

  const steps: OnboardingStep[] = [
    {
      id: "profile",
      title: "Profile basics",
      detail: "Set the name and email that make reports read cleanly.",
      action: "Set profile",
      done: profileComplete || persistedSteps.has("profile"),
    },
    {
      id: "projects",
      title: "Work source",
      detail: "Add a workspace or repository so WorkTrace can read local Git evidence.",
      action: "Add workspace",
      done: projectsComplete,
    },
    {
      id: "sync",
      title: "Sync activity",
      detail: hasSyncableProjects
        ? "Pull local commits into this week."
        : "Add a repository path before syncing commits.",
      action: "Sync activity",
      done: syncComplete,
      disabled: !hasSyncableProjects,
    },
    {
      id: "capture",
      title: "Missing context",
      detail: "Add one meeting, support, planning, QA, or research item Git cannot see.",
      action: "Add quick log",
      done: captureComplete,
    },
    {
      id: "report",
      title: "Report preview",
      detail: "Open the report flow and confirm the trail can become a weekly update.",
      action: "Preview report",
      done: reportComplete,
      disabled: reportReadyCount === 0,
    },
  ];

  const completedCount = steps.filter((step) => step.done).length;
  const isComplete = steps.every((step) => step.done);

  return {
    steps,
    completedCount,
    isComplete,
    profileComplete,
    projectsComplete,
    syncComplete,
    captureComplete,
    reportComplete,
    hasMeaningfulSetup:
      profileComplete || projectsComplete || syncComplete || captureComplete || reportComplete,
    reportReadyCount,
    commitCount,
    manualLogCount,
    hasSyncableProjects,
    nextStep: steps.find((step) => !step.done) ?? null,
  };
}
