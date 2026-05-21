export type NudgeDismissal = {
  id: string;
  nudgeKey: string;
  scope?: string | null;
  dismissedForDate: string;
  createdAt: string;
};

export type ListNudgeDismissalsInput = {
  dismissedForDate: string;
  scope?: string | null;
};

export type DismissNudgeInput = {
  nudgeKey: string;
  scope?: string | null;
  dismissedForDate: string;
};
