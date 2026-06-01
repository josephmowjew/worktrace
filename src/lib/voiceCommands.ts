import type { VoiceCaptureDraft } from "../types/voiceCapture";
import {
  parseVoiceTranscript,
  toVoiceCaptureDraft,
} from "./voice";
import type { VoiceParseContext } from "./voice";

export type NormalizedVoiceCommand =
  | {
      kind: "power";
      command: string;
      label: string;
      requiresConfirmation: boolean;
    }
  | {
      kind: "navigation";
      path: string;
      label: string;
      requiresConfirmation: boolean;
    }
  | {
      kind: "capture";
      draft: VoiceCaptureDraft;
      label: string;
      requiresConfirmation: true;
    }
  | {
      kind: "unknown";
      transcript: string;
      label: string;
      requiresConfirmation: true;
    };

export { extractVoiceCaptureContent, inferVoiceCaptureKind, parseVoiceTranscript } from "./voice";
export type { VoiceParseResult, VoiceIntentCandidate, VoiceParseContext } from "./voice";

export function normalizeVoiceTranscript(
  transcript: string,
  context: VoiceParseContext = {},
): NormalizedVoiceCommand {
  const result = parseVoiceTranscript(transcript, context);
  const candidate = result.topCandidate;

  if (
    !candidate ||
    result.status === "unknown_review" ||
    (result.status === "ambiguous" && candidate.captureDraft)
  ) {
    return unknownCommand(result.rawTranscript);
  }

  if (candidate.kind === "navigate" && candidate.path) {
    return {
      kind: "navigation",
      path: candidate.path,
      label: candidate.label,
      requiresConfirmation: candidate.requiresConfirmation,
    };
  }

  if (
    candidate.kind === "sync_repositories" ||
    candidate.kind === "sync_sparc_force" ||
    candidate.kind === "prepare_report" ||
    candidate.kind === "start_focus"
  ) {
    return {
      kind: "power",
      command: candidate.command ?? "",
      label: candidate.label,
      requiresConfirmation: candidate.requiresConfirmation,
    };
  }

  if (candidate.captureDraft) {
    return {
      kind: "capture",
      draft: candidate.captureDraft,
      label: candidate.label,
      requiresConfirmation: true,
    };
  }

  return unknownCommand(result.rawTranscript);
}

export function parseVoiceCaptureDraft(
  transcript: string,
  context: VoiceParseContext = {},
): VoiceCaptureDraft {
  const result = parseVoiceTranscript(transcript, context);
  const candidate = result.topCandidate;
  if (
    candidate?.captureDraft &&
    (candidate.kind === "create_task" || candidate.kind === "create_manual_log") &&
    result.status !== "unknown_review" &&
    result.status !== "ambiguous"
  ) {
    return {
      ...candidate.captureDraft,
      reason: result.issues[0]?.message ?? candidate.captureDraft.reason ?? null,
      issues: result.issues.map((issue) => issue.message),
    } as VoiceCaptureDraft;
  }

  return toVoiceCaptureDraft({
    ...result,
    topCandidate: undefined,
  });
}

function unknownCommand(transcript: string): NormalizedVoiceCommand {
  const cleaned = transcript.trim();
  return {
    kind: "unknown",
    transcript: cleaned,
    label: cleaned ? `Unknown command: ${cleaned}` : "No command heard",
    requiresConfirmation: true,
  };
}
