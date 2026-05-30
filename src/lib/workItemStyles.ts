import type { ActivityType } from "../types/manualLog";
import type { WeeklyTaskPriority, WeeklyTaskStatus, WeeklyTaskType } from "../types/weeklyTask";

export type WorkTone = "blue" | "cyan" | "green" | "purple" | "orange" | "amber" | "rose" | "slate";

export const manualLogToneByType: Record<ActivityType, WorkTone> = {
  Meeting: "purple",
  Development: "blue",
  BugFix: "rose",
  Testing: "amber",
  Deployment: "green",
  Research: "cyan",
  Documentation: "blue",
  Planning: "purple",
  Support: "orange",
  CodeReview: "cyan",
  ClientFeedback: "green",
  Debugging: "orange",
  ClientCall: "purple",
  AdminTask: "slate",
};

export const taskToneByType: Record<WeeklyTaskType, WorkTone> = {
  planned_work: "blue",
  blocker: "rose",
  carryover: "orange",
  completed_checklist: "green",
  follow_up: "cyan",
};

export const priorityToneByPriority: Record<WeeklyTaskPriority, WorkTone> = {
  low: "slate",
  normal: "blue",
  high: "rose",
};

export const taskStatusMuted: Record<WeeklyTaskStatus, boolean> = {
  todo: false,
  in_progress: false,
  blocked: false,
  completed: true,
  dropped: true,
};

export function toneBadgeClass(tone: WorkTone) {
  return {
    blue: "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-200",
    cyan: "border-cyan-500/20 bg-cyan-500/10 text-cyan-600 dark:text-cyan-200",
    green: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200",
    purple: "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-purple-200",
    orange: "border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-200",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-200",
    rose: "border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-200",
    slate: "border-[var(--wt-border)] bg-[var(--wt-surface-muted)] text-[var(--wt-text-muted)]",
  }[tone];
}

export function toneCardClass(tone: WorkTone, muted = false) {
  if (muted) {
    return "border-[var(--wt-border)] bg-[var(--wt-surface)] opacity-80 hover:bg-[var(--wt-surface-muted)]";
  }
  return {
    blue: "border-blue-500/18 bg-blue-500/[0.045] hover:border-blue-500/28 hover:bg-blue-500/[0.075]",
    cyan: "border-cyan-500/18 bg-cyan-500/[0.045] hover:border-cyan-500/28 hover:bg-cyan-500/[0.075]",
    green: "border-emerald-500/18 bg-emerald-500/[0.045] hover:border-emerald-500/28 hover:bg-emerald-500/[0.075]",
    purple: "border-violet-500/18 bg-violet-500/[0.045] hover:border-violet-500/28 hover:bg-violet-500/[0.075]",
    orange: "border-orange-500/20 bg-orange-500/[0.055] hover:border-orange-500/30 hover:bg-orange-500/[0.085]",
    amber: "border-amber-500/20 bg-amber-500/[0.055] hover:border-amber-500/30 hover:bg-amber-500/[0.085]",
    rose: "border-rose-500/28 bg-rose-500/[0.075] shadow-rose-950/10 hover:border-rose-400/40 hover:bg-rose-500/[0.11]",
    slate: "border-[var(--wt-border)] bg-[var(--wt-surface)] hover:bg-[var(--wt-surface-muted)]",
  }[tone];
}
