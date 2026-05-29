export type CalendarSource = {
  id: string;
  provider: string;
  accountEmail: string;
  accountName?: string | null;
  syncStatus:
    | "not_configured"
    | "oauth_pending"
    | "connected"
    | "syncing"
    | "error"
    | "disconnected";
  lastSyncedAt?: string | null;
  tokenRef?: string | null;
  accessTokenRef?: string | null;
  refreshTokenRef?: string | null;
  accessExpiresAt?: string | null;
  calendarId?: string | null;
  googleClientId?: string | null;
  syncToken?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CalendarEvent = {
  id: string;
  sourceId: string;
  externalId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  timezone?: string | null;
  allDay: boolean;
  busyStatus: string;
  isCancelled: boolean;
  projectId?: string | null;
  taskId?: string | null;
  createdAt: string;
  updatedAt: string;
  importedAt: string;
};

export type ConnectGoogleCalendarInput = {
  clientId: string;
};

export type DisconnectCalendarSourceInput = {
  sourceId: string;
};

export type SetCalendarSourceEnabledInput = {
  sourceId: string;
  enabled: boolean;
};

export type ListCalendarEventsInput = {
  from: string;
  to: string;
  sourceId?: string | null;
};

export type SyncCalendarEventsInput = {
  sourceId?: string | null;
  from: string;
  to: string;
};

export type SyncCalendarEventsResult = {
  sourceId?: string | null;
  imported: number;
  updated: number;
  cancelled: number;
  message: string;
};
