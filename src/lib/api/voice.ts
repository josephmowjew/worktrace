import { callCommand } from "./client";

export type TranscribeVoiceCommandInput = {
  audioBytes: number[];
  mimeType: string;
};

export type TranscribeVoiceCommandResult = {
  transcript: string;
  engine: string;
  model: string;
  confidence?: number | null;
};

export function transcribeVoiceCommand(input: TranscribeVoiceCommandInput) {
  return callCommand<TranscribeVoiceCommandResult>("transcribe_voice_command", { input });
}
