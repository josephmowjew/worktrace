export type FrictionInsightSeverity = "high" | "medium" | "low";

export type FrictionInsightKind =
  | "project_switching"
  | "context_switching"
  | "support_mode"
  | "meeting_recovery_gap"
  | "stale_task"
  | "repeated_issue"
  | "late_report"
  | "focus_fragmentation";

export type FrictionInsightMetric = {
  key: string;
  label: string;
  value: string;
  unit?: string | null;
  threshold?: string | null;
  direction?: "above" | "below" | "equal" | string | null;
};

export type FrictionEvidenceSourceType =
  | "weekly_task"
  | "activity"
  | "manual_log"
  | "calendar_event"
  | "focus_session"
  | "report";

export type FrictionEvidenceItem = {
  evidenceId: string;
  sourceType: FrictionEvidenceSourceType;
  sourceId: string;
  title: string;
  date: string;
  occurredAt?: string | null;
  projectName?: string | null;
  detail?: string | null;
  route?: string | null;
  role?: "primary" | "supporting" | "counter" | string | null;
  observedValue?: string | null;
  routeState?: unknown;
};

export type FrictionInsightAction = {
  route: string;
  stateJson?: unknown;
  sourceId?: string | null;
};

export type FrictionInsightScope = {
  from: string;
  to: string;
  surface: string;
  projectIds?: string[] | null;
  classification?: string | null;
};

export type FrictionInsightClaim = {
  statement: string;
  impactLabel: FrictionInsightSeverity | string;
};

export type FrictionInsightDataHealth = {
  status: "complete" | "partial" | "limited" | string;
  notes: string[];
};

export type FrictionInsightReason = {
  id: string;
  label: string;
  detail: string;
  strength: "primary" | "supporting" | "limiting" | string;
  evidenceIds: string[];
};

export type FrictionInsight = {
  id: string;
  nudgeKey: string;
  ruleVersion: string;
  scope: FrictionInsightScope;
  claim: FrictionInsightClaim;
  kind: FrictionInsightKind;
  severity: FrictionInsightSeverity;
  confidence: number;
  confidenceLabel: "strong" | "likely" | "watch" | "needs_review" | string;
  verified: boolean;
  dataHealth: FrictionInsightDataHealth;
  title: string;
  detail: string;
  recommendation: string;
  evidence: string[];
  metrics: FrictionInsightMetric[];
  evidenceItems: FrictionEvidenceItem[];
  reasons: FrictionInsightReason[];
  actionLabel: string;
  actionTarget: string;
  primaryAction?: FrictionInsightAction | null;
  date?: string | null;
};

export type GetFrictionInsightsInput = {
  from: string;
  to: string;
  projectIds?: string[] | null;
  classification?: string | null;
  surface?: "today" | "dashboard" | "reports" | "weekly_plan" | "friction" | null;
};
