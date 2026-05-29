export type QuickCaptureStatus = {
  enabled: boolean;
  shortcut: string;
  registered: boolean;
  lastError?: string | null;
};

export type DesktopLifecycleStatus = {
  startupEnabled: boolean;
  startMinimizedToTray: boolean;
  minimizeToTrayOnClose: boolean;
  autostartRegistered: boolean;
  lastError?: string | null;
};
