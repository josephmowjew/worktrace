export type AppVersionInfo = {
  version: string;
};

export type ReleaseNoteItem = {
  version: string;
  publishedAt: string | null;
  notes: string;
};

export type ReleaseNotesPayload = {
  source: string;
  releases: ReleaseNoteItem[];
};

export type UpdateCheckResult = {
  status: "available" | "up_to_date" | "error";
  currentVersion: string;
  latestVersion: string | null;
  body: string | null;
  pubDate: string | null;
};
