export type ActivityType =
  | "Meeting"
  | "Development"
  | "BugFix"
  | "Testing"
  | "Deployment"
  | "Research"
  | "Documentation"
  | "Planning"
  | "Support"
  | "CodeReview"
  | "ClientFeedback"
  | "Debugging"
  | "ClientCall"
  | "AdminTask";

export type ManualLog = {
  id: string;
  projectId?: string | null;
  date: string;
  activityType: ActivityType;
  summary: string;
  outcome?: string | null;
  durationMinutes?: number | null;
  followUp?: string | null;
  includedInReport: boolean;
};

export type ListManualLogsInput = {
  from: string;
  to: string;
  projectIds?: string[] | null;
};

export type CreateManualLogInput = {
  projectId?: string | null;
  date: string;
  activityType: ActivityType;
  summary: string;
  outcome?: string | null;
  durationMinutes?: number | null;
  followUp?: string | null;
  includedInReport?: boolean | null;
};

export type QuickCaptureLogInput = {
  projectId?: string | null;
  activityType: ActivityType;
  summary: string;
  durationMinutes?: number | null;
  includedInReport?: boolean | null;
};

export type UpdateManualLogInput = Partial<CreateManualLogInput>;
