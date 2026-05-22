export type Settings = {
  name: string;
  email: string;
  defaultManagerName: string;
  gitAuthorEmail: string;
  defaultReportTemplate: string;
  workingDays: string[];
  theme: string;
  backupEnabled: boolean;
  backupSchedule: string;
  backupTime: string;
  backupDay: string;
  backupStorageMode: string;
  backupStorageLocation: string;
  onlineBackupStatus: string;
  onlineBackupProvider: string;
};

export type UpdateSettingsInput = Partial<Settings>;

export type BackupLocationValidation = {
  status: "needs_location" | "ready" | "unavailable" | "not_writable";
  message: string;
};
