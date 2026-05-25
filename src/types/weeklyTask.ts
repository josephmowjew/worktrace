export type WeeklyTaskType =
  | "planned_work"
  | "blocker"
  | "carryover"
  | "completed_checklist"
  | "follow_up";

export type WeeklyTaskStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "completed"
  | "dropped";

export type WeeklyTaskPriority = "low" | "normal" | "high";

export type WeeklyTask = {
  id: string;
  projectId?: string | null;
  projectName?: string | null;
  taskType: WeeklyTaskType;
  status: WeeklyTaskStatus;
  title: string;
  details?: string | null;
  weekStartDate: string;
  targetDate?: string | null;
  completedAt?: string | null;
  priority: WeeklyTaskPriority;
  includedInReport: boolean;
  progressPercent?: number | null;
  estimatedMinutes?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ListWeeklyTasksInput = {
  weekStartDate: string;
  weekEndDate: string;
  projectIds?: string[] | null;
  taskType?: WeeklyTaskType | null;
  status?: WeeklyTaskStatus | null;
  includedInReport?: boolean | null;
};

export type CreateWeeklyTaskInput = {
  projectId?: string | null;
  taskType: WeeklyTaskType;
  status?: WeeklyTaskStatus | null;
  title: string;
  details?: string | null;
  weekStartDate: string;
  targetDate?: string | null;
  completedAt?: string | null;
  priority?: WeeklyTaskPriority | null;
  includedInReport?: boolean | null;
  progressPercent?: number | null;
  estimatedMinutes?: number | null;
};

export type UpdateWeeklyTaskInput = Partial<CreateWeeklyTaskInput>;
