import type { ActivityType } from "./manualLog";
import type { WeeklyTaskPriority, WeeklyTaskType } from "./weeklyTask";

export type VoiceCaptureKind = "manual_log" | "task" | "unknown";

export type VoiceCaptureConfidence = "high" | "medium" | "low";

export type VoiceTaskDraft = {
  title: string;
  taskType: WeeklyTaskType;
  priority: WeeklyTaskPriority;
  projectHint?: string | null;
};

export type VoiceManualLogDraft = {
  summary: string;
  activityType: ActivityType;
  durationMinutes?: number | null;
  projectHint?: string | null;
};

export type VoiceCaptureDraft =
  | {
      kind: "task";
      transcript: string;
      cleanedContent: string;
      confidence: VoiceCaptureConfidence;
      score?: number;
      reason?: string | null;
      issues?: string[];
      task: VoiceTaskDraft;
      manualLog?: null;
    }
  | {
      kind: "manual_log";
      transcript: string;
      cleanedContent: string;
      confidence: VoiceCaptureConfidence;
      score?: number;
      reason?: string | null;
      issues?: string[];
      task?: null;
      manualLog: VoiceManualLogDraft;
    }
  | {
      kind: "unknown";
      transcript: string;
      cleanedContent: string;
      confidence: "low";
      score?: number;
      reason?: string | null;
      issues?: string[];
      task?: null;
      manualLog?: null;
    };

export type VoiceCaptureDraftLegacyShape = {
  kind: VoiceCaptureKind;
  transcript: string;
  confidence: VoiceCaptureConfidence;
  reason?: string | null;
  task?: VoiceTaskDraft | null;
  manualLog?: VoiceManualLogDraft | null;
};
