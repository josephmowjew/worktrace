export type ThemePreference = "dark" | "light" | "system";

export type Settings = {
  name: string;
  email: string;
  useGravatarProfileImage: boolean;
  defaultManagerName: string;
  gitAuthorEmail: string;
  defaultReportTemplate: string;
  workingDays: string[];
  dailyWorkMinutes: number;
  theme: ThemePreference | string;
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
  reportAiNvidiaModel: string;
  embeddingsEnabled: boolean;
  embeddingProvider: "native_local" | "local_endpoint" | "openai_compatible" | string;
  embeddingLocalEndpoint: string;
  embeddingOnlineEndpoint: string;
  embeddingModel: string;
  embeddingOnlineAllowed: boolean;
  embeddingPrivacyAcknowledged: boolean;
  quickCaptureEnabled: boolean;
  quickCaptureShortcut: string;
  quickCaptureIncludeInReport: boolean;
  startupEnabled: boolean;
  startMinimizedToTray: boolean;
  minimizeToTrayOnClose: boolean;
  priorityRemindersEnabled: boolean;
  priorityReminderDesktopEnabled: boolean;
  priorityReminderCheckpoints: string[];
  priorityReminderSnoozeMinutes: number;
  priorityReminderQuietStart: string;
  priorityReminderQuietEnd: string;
  sparcForceAddonEnabled: boolean;
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
