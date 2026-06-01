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

type WavRecordingResult = {
  bytes: number[];
  mimeType: string;
  durationMs: number;
  peak: number;
};

type VoiceCommandOptions = {
  localOnly?: boolean;
};

type AnnounceOptions = {
  category?: "focus" | "nudge" | "sync" | "task" | "general";
  interrupt?: boolean;
};

type SpeechContextValue = {
  announce: (text: string, options?: AnnounceOptions) => void;
  startVoiceCommand: (options?: VoiceCommandOptions) => Promise<VoiceCommandResult | null>;
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
  const stopAudioCaptureRef = useRef<(() => void) | null>(null);

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
    stopAudioCaptureRef.current?.();
    recorderRef.current?.stop();
  }, []);

  const startVoiceCommand = useCallback(async (options: VoiceCommandOptions = {}): Promise<VoiceCommandResult | null> => {
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
      if (options.localOnly) {
        const recording = await recordWavFromStream(stream, MAX_RECORDING_MS, (stop) => {
          stopAudioCaptureRef.current = stop;
        });
        if (recording.peak < 0.002) {
          setStatus("idle");
          setError("WorkTrace captured silence from the selected microphone. Check the app microphone permission or selected input device.");
          return null;
        }
        setStatus("transcribing");
        const result = await transcribeVoiceCommand({
          audioBytes: recording.bytes,
          mimeType: recording.mimeType,
          localOnly: true,
        });
        const transcript = result.transcript;
        setStatus("idle");
        if (transcript.trim()) {
          return { transcript };
        }
        setError("No speech was transcribed. Try again a little closer to the microphone.");
        return null;
      }

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
              localOnly: options.localOnly,
            });
            resolve(result.transcript);
          } catch (innerError) {
            reject(innerError);
          }
        };

        recorder.start();
      });

      setStatus("idle");
      if (transcript.trim()) {
        return { transcript };
      }
      setError("No speech was transcribed. Try again a little closer to the microphone.");
      return null;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Voice command failed.";
      setError(message);
      setStatus("error");
      return null;
    } finally {
      recorderRef.current = null;
      stopAudioCaptureRef.current = null;
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

async function recordWavFromStream(
  stream: MediaStream,
  maxRecordingMs: number,
  onStopReady: (stop: () => void) => void,
): Promise<WavRecordingResult> {
  const AudioContextClass =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const audioContext = new AudioContextClass();
  await audioContext.resume();
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  const startedAt = performance.now();
  let peak = 0;
  let stopped = false;

  const stop = () => {
    stopped = true;
  };
  onStopReady(stop);

  processor.onaudioprocess = (event) => {
    if (stopped) return;
    const input = new Float32Array(event.inputBuffer.getChannelData(0));
    for (const sample of input) {
      peak = Math.max(peak, Math.abs(sample));
    }
    chunks.push(input);
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => {
      stopped = true;
      resolve();
    }, maxRecordingMs);

    const interval = window.setInterval(() => {
      if (!stopped) return;
      window.clearTimeout(timeout);
      window.clearInterval(interval);
      resolve();
    }, 50);
  });

  processor.disconnect();
  source.disconnect();
  await audioContext.close();

  return {
    bytes: Array.from(encodeWav(chunks, audioContext.sampleRate)),
    mimeType: "audio/wav",
    durationMs: Math.round(performance.now() - startedAt),
    peak,
  };
}

function encodeWav(chunks: Float32Array[], sampleRate: number) {
  const samples = mergeAudioChunks(chunks);
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function mergeAudioChunks(chunks: Float32Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
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
