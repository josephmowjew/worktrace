import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import { transcribeVoiceCommand } from "../../lib/api/voice";
import { getSettings } from "../../lib/api/settings";

type VoiceCommandStatus = "idle" | "listening" | "transcribing" | "error";

type VoiceCommandResult = {
  transcript: string;
};

type AnnounceOptions = {
  category?: "focus" | "nudge" | "sync" | "task" | "general";
  interrupt?: boolean;
};

type SpeechContextValue = {
  announce: (text: string, options?: AnnounceOptions) => void;
  startVoiceCommand: () => Promise<VoiceCommandResult | null>;
  stopVoiceCommand: () => void;
  voices: SpeechSynthesisVoice[];
  status: VoiceCommandStatus;
  error?: string | null;
  isSpeechSynthesisAvailable: boolean;
  isVoiceCommandAvailable: boolean;
};

const SpeechContext = createContext<SpeechContextValue | null>(null);

const MAX_RECORDING_MS = 12_000;

export function SpeechProvider({ children }: PropsWithChildren) {
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  const settings = settingsQuery.data;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [status, setStatus] = useState<VoiceCommandStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const isSpeechSynthesisAvailable =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const isVoiceCommandAvailable =
    Boolean(settings?.voiceCommandsEnabled) &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
    if (!isSpeechSynthesisAvailable) return;

    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [isSpeechSynthesisAvailable]);

  const announce = useCallback(
    (text: string, options: AnnounceOptions = {}) => {
      if (!settings?.announcementsEnabled || !isSpeechSynthesisAvailable) return;
      if (!shouldAnnounceCategory(settings, options.category ?? "general")) return;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.volume = clamp(settings.announcementVolume, 0, 1);
      const selectedVoice = voices.find((voice) => voice.name === settings.announcementVoice);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      if (options.interrupt) {
        window.speechSynthesis.cancel();
      }
      window.speechSynthesis.speak(utterance);
    },
    [isSpeechSynthesisAvailable, settings, voices],
  );

  const stopVoiceCommand = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const startVoiceCommand = useCallback(async (): Promise<VoiceCommandResult | null> => {
    if (!settings?.voiceCommandsEnabled) {
      setError("Voice commands are disabled in Settings.");
      setStatus("error");
      return null;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone capture is not available in this WebView.");
      setStatus("error");
      return null;
    }

    setError(null);
    setStatus("listening");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      const chunks: BlobPart[] = [];

      const transcript = await new Promise<string>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        }, MAX_RECORDING_MS);

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        recorder.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error("Microphone recording failed."));
        };
        recorder.onstop = async () => {
          window.clearTimeout(timeout);
          setStatus("transcribing");
          try {
            const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
            const buffer = await blob.arrayBuffer();
            const result = await transcribeVoiceCommand({
              audioBytes: Array.from(new Uint8Array(buffer)),
              mimeType: blob.type,
            });
            resolve(result.transcript);
          } catch (innerError) {
            reject(innerError);
          }
        };

        recorder.start();
      });

      setStatus("idle");
      return transcript.trim() ? { transcript } : null;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Voice command failed.";
      setError(message);
      setStatus("error");
      return null;
    } finally {
      recorderRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, [settings?.voiceCommandsEnabled]);

  const value = useMemo<SpeechContextValue>(
    () => ({
      announce,
      startVoiceCommand,
      stopVoiceCommand,
      voices,
      status,
      error,
      isSpeechSynthesisAvailable,
      isVoiceCommandAvailable,
    }),
    [
      announce,
      error,
      isSpeechSynthesisAvailable,
      isVoiceCommandAvailable,
      startVoiceCommand,
      status,
      stopVoiceCommand,
      voices,
    ],
  );

  return <SpeechContext.Provider value={value}>{children}</SpeechContext.Provider>;
}

export function useSpeech() {
  const context = useContext(SpeechContext);

  if (!context) {
    throw new Error("useSpeech must be used inside SpeechProvider");
  }

  return context;
}

function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function shouldAnnounceCategory(
  settings: {
    announceFocusEvents: boolean;
    announceNudges: boolean;
    announceSyncResults: boolean;
    announceTaskChanges: boolean;
  },
  category: NonNullable<AnnounceOptions["category"]>,
) {
  if (category === "focus") return settings.announceFocusEvents;
  if (category === "nudge") return settings.announceNudges;
  if (category === "sync") return settings.announceSyncResults;
  if (category === "task") return settings.announceTaskChanges;
  return true;
}
