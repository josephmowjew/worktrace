export type FocusSessionStatus = "active" | "completed" | "cancelled";

export type FocusSession = {
  id: string;
  projectId?: string | null;
  projectName?: string | null;
  taskId?: string | null;
  taskTitle?: string | null;
  title: string;
  notes?: string | null;
  status: FocusSessionStatus;
  startedAt: string;
  endedAt?: string | null;
  durationMinutes?: number | null;
  manualLogId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateFocusSessionInput = {
  projectId?: string | null;
  taskId?: string | null;
  title?: string | null;
  notes?: string | null;
};

export type StopFocusSessionInput = {
  notes?: string | null;
  createManualLog?: boolean | null;
  manualLogSummary?: string | null;
  completeTask?: boolean | null;
  progressPercent?: number | null;
};

export type ListFocusSessionsInput = {
  from?: string | null;
  to?: string | null;
  status?: FocusSessionStatus | null;
  projectIds?: string[] | null;
};
