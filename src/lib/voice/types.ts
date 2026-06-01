import type { ActivityType } from "../../types/manualLog";
import type { VoiceCaptureDraft } from "../../types/voiceCapture";
import type { WeeklyTaskPriority, WeeklyTaskType } from "../../types/weeklyTask";

export type VoiceIntentKind =
  | "create_task"
  | "create_manual_log"
  | "start_focus"
  | "sync_repositories"
  | "sync_sparc_force"
  | "prepare_report"
  | "navigate"
  | "unknown_capture";

export type VoiceParseStatus = "actionable" | "review" | "ambiguous" | "unknown_review";

export type VoiceSpan = {
  start: number;
  end: number;
  text: string;
  normalized: string;
};

export type VoiceCorrection = {
  original: string;
  corrected: string;
  kind: "asr_confusion" | "product_term" | "project_alias" | "command_phrase";
  confidence: number;
  appliedTo: "scoring" | "slot" | "content";
};

export type VoiceSlotSource = "explicit" | "keyword" | "context" | "default" | "fuzzy";

export type VoiceSlot<T> = {
  value: T;
  rawText: string;
  normalizedText: string;
  confidence: number;
  source: VoiceSlotSource;
  span?: VoiceSpan;
  alternatives?: Array<{ value: T; confidence: number; reason: string }>;
};

export type ProjectMatch = {
  projectId: string;
  name: string;
  matchKind: "exact" | "alias" | "contains" | "fuzzy" | "recent_context";
};

export type VoiceTaskSlots = {
  title?: VoiceSlot<string>;
  details?: VoiceSlot<string>;
  taskType?: VoiceSlot<WeeklyTaskType>;
  priority?: VoiceSlot<WeeklyTaskPriority>;
  project?: VoiceSlot<ProjectMatch | null>;
  targetDate?: VoiceSlot<string | null>;
  estimatedMinutes?: VoiceSlot<number | null>;
};

export type VoiceManualLogSlots = {
  summary?: VoiceSlot<string>;
  activityType?: VoiceSlot<ActivityType>;
  project?: VoiceSlot<ProjectMatch | null>;
  durationMinutes?: VoiceSlot<number | null>;
  date?: VoiceSlot<string>;
  outcome?: VoiceSlot<string | null>;
  followUp?: VoiceSlot<string | null>;
};

export type VoiceParseIssue = {
  code:
    | "ambiguous_intent"
    | "missing_content"
    | "multiple_commands"
    | "low_confidence"
    | "project_unmatched"
    | "project_ambiguous"
    | "trigger_removed";
  message: string;
  severity: "info" | "warning" | "error";
};

export type IntentScoreBreakdown = {
  commandPhrase: number;
  targetPhrase: number;
  slotEvidence: number;
  contentQuality: number;
  contextPrior: number;
  correctionPenalty: number;
  conflictPenalty: number;
};

export type VoiceIntentCandidate = {
  id: string;
  kind: VoiceIntentKind;
  score: number;
  scoreBreakdown: IntentScoreBreakdown;
  label: string;
  command?: string;
  path?: string;
  captureDraft?: VoiceCaptureDraft;
  requiresConfirmation: boolean;
  missingSlots: string[];
  evidence: string[];
  issues: VoiceParseIssue[];
};

export type VoiceProjectContext = {
  id: string;
  name: string;
  aliases?: string[];
};

export type VoiceParseContext = {
  projects?: VoiceProjectContext[];
};

export type VoiceParseResult = {
  rawTranscript: string;
  normalizedTranscript: string;
  status: VoiceParseStatus;
  topCandidate?: VoiceIntentCandidate;
  candidates: VoiceIntentCandidate[];
  corrections: VoiceCorrection[];
  issues: VoiceParseIssue[];
};
