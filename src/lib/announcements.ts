import type { CreateManualLogInput, ManualLog } from "../types/manualLog";
import type {
  CreateWeeklyTaskInput,
  UpdateWeeklyTaskInput,
  WeeklyTask,
  WeeklyTaskPriority,
  WeeklyTaskStatus,
  WeeklyTaskType,
} from "../types/weeklyTask";

type TaskLike = Partial<CreateWeeklyTaskInput> & Pick<WeeklyTask, "title">;

const taskTypeLabels: Record<WeeklyTaskType, string> = {
  planned_work: "Planned work",
  blocker: "Blocker",
  carryover: "Carryover",
  completed_checklist: "Completed checklist",
  follow_up: "Follow-up",
};

const statusLabels: Record<WeeklyTaskStatus, string> = {
  todo: "Todo",
  in_progress: "In progress",
  blocked: "Blocked",
  completed: "Completed",
  dropped: "Dropped",
};

const priorityLabels: Record<WeeklyTaskPriority, string> = {
  low: "Low priority",
  normal: "Normal priority",
  high: "High priority",
};

export function taskAnnouncement(
  action: string,
  task: TaskLike,
  options: {
    projectName?: string | null;
    statusOverride?: WeeklyTaskStatus | null;
    taskTypeOverride?: WeeklyTaskType | null;
    maxDetails?: number;
  } = {},
) {
  const details = taskDetails(task, options).slice(0, options.maxDetails ?? 5);
  return [entityLine(action, task.title), ...details].join(" ");
}

export function taskUpdateAnnouncement(
  task: WeeklyTask,
  input: UpdateWeeklyTaskInput,
  options: { projectName?: string | null } = {},
) {
  if (input.status === "completed") {
    return taskAnnouncement("Task completed", { ...task, ...input }, options);
  }
  if (input.status === "dropped") {
    return taskAnnouncement("Task dropped", { ...task, ...input }, options);
  }
  if (input.status === "in_progress") {
    return taskAnnouncement("Task started", { ...task, ...input }, options);
  }
  if (input.status === "blocked") {
    return taskAnnouncement("Task blocked", { ...task, ...input }, options);
  }
  if (input.taskType === "carryover") {
    return taskAnnouncement("Task carried forward", { ...task, ...input }, options);
  }
  if (input.includedInReport) {
    return taskAnnouncement("Task added to report", { ...task, ...input }, options);
  }
  return taskAnnouncement("Task updated", { ...task, ...input }, options);
}

export function todoAnnouncement(
  action: string,
  task: TaskLike,
  options: {
    projectName?: string | null;
    statusOverride?: WeeklyTaskStatus | null;
    maxDetails?: number;
  } = {},
) {
  const details = taskDetails(task, options).slice(0, options.maxDetails ?? 4);
  return [entityLine(action, task.title), ...details].join(" ");
}

export function syncAnnouncement(result: {
  newCommits: number;
  updatedCommits: number;
  scannedProjects?: number;
  skippedProjects?: number;
}) {
  const details = [
    typeof result.scannedProjects === "number" ? `Scanned ${result.scannedProjects} projects.` : null,
    `Added ${result.newCommits} commits.`,
    `Updated ${result.updatedCommits} commits.`,
    result.skippedProjects ? `Skipped ${result.skippedProjects} manual-only projects.` : null,
  ].filter(Boolean);

  return `Sync complete. ${details.join(" ")}`;
}

export function syncStartedAnnouncement(scope = "activity") {
  return `Syncing ${scope}.`;
}

export function manualLogAnnouncement(
  action: string,
  log: ManualLog | CreateManualLogInput,
  projectName?: string | null,
) {
  const details = [
    formatActivityType(log.activityType),
    projectName ? `Project ${projectName}.` : null,
    log.date ? `Date ${formatDate(log.date)}.` : null,
    log.durationMinutes ? `Duration ${formatMinutes(log.durationMinutes)}.` : null,
    log.includedInReport ? "Included in weekly report." : null,
  ].filter(Boolean);

  return [entityLine(action, log.summary), ...details].join(" ");
}

function taskDetails(
  task: TaskLike,
  options: {
    projectName?: string | null;
    statusOverride?: WeeklyTaskStatus | null;
    taskTypeOverride?: WeeklyTaskType | null;
  },
) {
  const status = options.statusOverride ?? task.status;
  const taskType = options.taskTypeOverride ?? task.taskType;

  return [
    options.projectName ? `Project ${options.projectName}.` : null,
    task.priority ? priorityLabels[task.priority] + "." : null,
    status ? `Status ${statusLabels[status]}.` : null,
    taskType && taskType !== "planned_work" ? `Type ${taskTypeLabels[taskType]}.` : null,
    task.targetDate ? `Target ${formatDate(task.targetDate)}.` : null,
    task.estimatedMinutes ? `Estimate ${formatMinutes(task.estimatedMinutes)}.` : null,
    typeof task.progressPercent === "number" && Number.isFinite(task.progressPercent)
      ? `Progress ${task.progressPercent} percent.`
      : null,
    task.includedInReport ? "Included in weekly report." : null,
  ].filter(Boolean);
}

function entityLine(action: string, title: string) {
  return `${action}: ${title}.`;
}

function formatActivityType(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2") + ".";
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} minutes`;
  if (!remainder) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `${hours} ${hours === 1 ? "hour" : "hours"} ${remainder} minutes`;
}
