export type GeneratedReport = {
  title: string;
  startDate: string;
  endDate: string;
  recipientName?: string | null;
  content: string;
};

export type Report = GeneratedReport & {
  id: string;
  createdAt: string;
};

export type ReportSummary = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  recipientName?: string | null;
  createdAt: string;
};

export type GenerateReportInput = {
  startDate: string;
  endDate: string;
  recipientName?: string | null;
  projectIds?: string[] | null;
  includeCommits?: boolean | null;
  includeManualLogs?: boolean | null;
  includeWeeklyTasks?: boolean | null;
  includeHidden?: boolean | null;
};

export type SaveReportInput = {
  title: string;
  startDate: string;
  endDate: string;
  recipientName?: string | null;
  content: string;
};

export type ReportNote = {
  id: string;
  projectId?: string | null;
  noteType: string;
  date: string;
  content: string;
  includedInReport: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ListReportNotesInput = {
  from: string;
  to: string;
};

export type SaveDailyReviewNoteInput = {
  date: string;
  finished: string;
  blocked: string;
  carryIntoTomorrow: string;
  includedInReport?: boolean | null;
};
