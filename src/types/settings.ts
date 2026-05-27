export type Settings = {
  name: string;
  email: string;
  defaultManagerName: string;
  gitAuthorEmail: string;
  defaultReportTemplate: string;
  workingDays: string[];
  dailyWorkMinutes: number;
  theme: string;
  backupEnabled: boolean;
  backupSchedule: string;
  backupTime: string;
  backupDay: string;
  backupStorageMode: string;
  backupStorageLocation: string;
  onlineBackupStatus: string;
  onlineBackupProvider: string;
  githubConnected: boolean;
  githubUsername: string;
  githubConnectedAt: string;
  githubLastValidatedAt: string;
  announcementsEnabled: boolean;
  announcementVolume: number;
  announcementVoice: string;
  announceFocusEvents: boolean;
  announceNudges: boolean;
  announceSyncResults: boolean;
  announceTaskChanges: boolean;
  voiceCommandsEnabled: boolean;
  voiceCommandMode: string;
  voiceCommandConfirmBeforeAction: boolean;
  voiceTranscriptionProvider: string;
  voiceOnlineAllowed: boolean;
  voicePrivacyAcknowledged: boolean;
  voiceGroqModel: string;
  voiceOpenrouterModel: string;
  reportAiEnabled: boolean;
  reportAiProvider: string;
  reportAiOnlineAllowed: boolean;
  reportAiPrivacyAcknowledged: boolean;
  reportAiLocalModelPath: string;
  reportAiGroqModel: string;
  onboardingCompleted: boolean;
  onboardingDismissedWelcome: boolean;
  onboardingDismissedChecklist: boolean;
  onboardingCompletedSteps: string[];
  onboardingCompletedAt: string;
};

export type UpdateSettingsInput = Partial<Settings>;

export type BackupLocationValidation = {
  status: "needs_location" | "ready" | "unavailable" | "not_writable";
  message: string;
};

export type SettingsExport = {
  app: "WorkTrace";
  version: number;
  exportedAt: string;
  settings: Settings;
};

export type SettingsImportResult = {
  settings: Settings;
  warnings: string[];
};
