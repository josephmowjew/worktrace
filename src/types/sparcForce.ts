import type { WeeklyTask, WeeklyTaskPriority, WeeklyTaskStatus } from "./weeklyTask";

export type SparcForceIntegrationStatus = {
  addonEnabled: boolean;
  connected: boolean;
  status: string;
  baseUrl?: string | null;
  accountEmail?: string | null;
  remoteUserId?: number | null;
  remoteUsername?: string | null;
  maskedEmail?: string | null;
  connectedAt?: string | null;
  lastValidatedAt?: string | null;
  lastSyncedAt?: string | null;
  accessExpiresAt?: string | null;
  otpExpiresAt?: string | null;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  importedCases: number;
  importedProjects: number;
  importedTasks: number;
  lastError?: string | null;
};

export type SparcForceLoginOutcome = {
  status: SparcForceIntegrationStatus;
  otpRequired: boolean;
  message: string;
};

export type SparcForceSyncResult = {
  casesImported: number;
  projectsImported: number;
  tasksImported: number;
  standaloneTasksEnabled: boolean;
  message: string;
};

export type SparcForceImportedItem = {
  kind: string;
  externalKind?: string | null;
  externalId: string;
  title: string;
  status?: string | null;
  priority?: string | null;
  source?: string | null;
  assignedTo?: number | null;
  ownership?: string | null;
  createdBy?: string | null;
  createdOwnership?: string | null;
  projectExternalId?: string | null;
  caseExternalId?: string | null;
  updatedAtRemote?: string | null;
  createdAtRemote?: string | null;
  importedAt: string;
  rawJson: string;
};

export type SparcForceImportedData = {
  cases: SparcForceImportedItem[];
  projects: SparcForceImportedItem[];
  tasks: SparcForceImportedItem[];
};

export type ListSparcForceRecordsInput = {
  kind?: string | null;
  search?: string | null;
  statuses?: string[] | null;
  priorities?: string[] | null;
  sources?: string[] | null;
  relationship?: string | null;
  ownership?: string | null;
  createdOwnership?: string | null;
  projectExternalId?: string | null;
  caseExternalId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  limit?: number | null;
  offset?: number | null;
  sortBy?: string | null;
  sortDirection?: string | null;
};

export type SparcForceRecordBucket = {
  label: string;
  count: number;
};

export type SparcForceRecordCounts = {
  total: number;
  cases: number;
  projects: number;
  tasks: number;
  statuses: SparcForceRecordBucket[];
  priorities: SparcForceRecordBucket[];
  sources: SparcForceRecordBucket[];
  relationships: SparcForceRecordBucket[];
  ownerships: SparcForceRecordBucket[];
  createdOwnerships: SparcForceRecordBucket[];
};

export type SparcForceRecordQueryResult = {
  records: SparcForceImportedItem[];
  total: number;
  limit: number;
  offset: number;
  counts: SparcForceRecordCounts;
};

export type ConnectSparcForceInput = {
  baseUrl: string;
  email: string;
  password: string;
};

export type VerifySparcForceOtpInput = {
  otpCode: string;
};

export type ImportSparcForceTaskInput = {
  source: string;
  externalKind?: string | null;
  externalId: string;
  weekStartDate: string;
  title?: string | null;
  details?: string | null;
  status?: WeeklyTaskStatus | null;
  priority?: WeeklyTaskPriority | null;
  targetDate?: string | null;
  completedAt?: string | null;
  includedInReport?: boolean | null;
  progressPercent?: number | null;
  estimatedMinutes?: number | null;
};

export type ImportSparcForceTaskOutcome = {
  task: WeeklyTask;
  alreadyImported: boolean;
};
