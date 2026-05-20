export type Settings = {
  name: string;
  email: string;
  defaultManagerName: string;
  gitAuthorEmail: string;
  defaultReportTemplate: string;
  workingDays: string[];
  theme: string;
};

export type UpdateSettingsInput = Partial<Settings>;
