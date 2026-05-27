import { listen } from "@tauri-apps/api/event";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import { currentWeekRange } from "../lib/dates";
import type {
  GeneratedReport,
  ReportAiProvider,
  ReportAiStreamPayload,
  ReportReadinessAnalysis,
} from "../types/report";
import type { GitRefFilter } from "../types/project";

type ReportsWorkspaceState = {
  startDate: string;
  setStartDate: (value: string) => void;
  endDate: string;
  setEndDate: (value: string) => void;
  recipientName: string;
  setRecipientName: (value: string) => void;
  selectedProjectId: string;
  setSelectedProjectId: (value: string) => void;
  selectedGitRefs: GitRefFilter[];
  setSelectedGitRefs: (value: GitRefFilter[] | ((current: GitRefFilter[]) => GitRefFilter[])) => void;
  selectedWorktreePaths: string[];
  setSelectedWorktreePaths: (value: string[] | ((current: string[]) => string[])) => void;
  useProjectGitFocus: boolean;
  setUseProjectGitFocus: (value: boolean) => void;
  includeCommits: boolean;
  setIncludeCommits: (value: boolean) => void;
  includeManualLogs: boolean;
  setIncludeManualLogs: (value: boolean) => void;
  includeWeeklyTasks: boolean;
  setIncludeWeeklyTasks: (value: boolean) => void;
  includeHidden: boolean;
  setIncludeHidden: (value: boolean) => void;
  report: GeneratedReport | null;
  setReport: (value: GeneratedReport | null) => void;
  content: string;
  setContent: (value: string | ((current: string) => string)) => void;
  copied: boolean;
  setCopied: (value: boolean) => void;
  reportAiProvider: ReportAiProvider;
  setReportAiProvider: (value: ReportAiProvider) => void;
  openRouterKey: string;
  setOpenRouterKey: (value: string) => void;
  groqKey: string;
  setGroqKey: (value: string) => void;
  nvidiaBuildKey: string;
  setNvidiaBuildKey: (value: string) => void;
  readiness: ReportReadinessAnalysis | null;
  setReadiness: (value: ReportReadinessAnalysis | null) => void;
  polishStreamStatus: string | null;
  setPolishStreamStatus: (value: string | null) => void;
  activePolishStreamId: string | null;
  polishCancelled: boolean;
  beginPolishStream: () => string;
  finishPolishStream: () => void;
  markPolishStreamCancelled: () => void;
};

const ReportsWorkspaceContext = createContext<ReportsWorkspaceState | null>(null);

export function ReportsWorkspaceProvider({ children }: PropsWithChildren) {
  const weekRange = currentWeekRange();
  const [startDate, setStartDate] = useState(weekRange.from);
  const [endDate, setEndDate] = useState(weekRange.to);
  const [recipientName, setRecipientName] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [selectedGitRefs, setSelectedGitRefs] = useState<GitRefFilter[]>([]);
  const [selectedWorktreePaths, setSelectedWorktreePaths] = useState<string[]>([]);
  const [useProjectGitFocus, setUseProjectGitFocus] = useState(true);
  const [includeCommits, setIncludeCommits] = useState(true);
  const [includeManualLogs, setIncludeManualLogs] = useState(true);
  const [includeWeeklyTasks, setIncludeWeeklyTasks] = useState(true);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [reportAiProvider, setReportAiProvider] =
    useState<ReportAiProvider>("local_llama_cpp");
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [nvidiaBuildKey, setNvidiaBuildKey] = useState("");
  const [readiness, setReadiness] = useState<ReportReadinessAnalysis | null>(null);
  const [polishStreamStatus, setPolishStreamStatus] = useState<string | null>(null);
  const [activePolishStreamId, setActivePolishStreamId] = useState<string | null>(null);
  const [polishCancelled, setPolishCancelled] = useState(false);
  const activePolishStreamIdRef = useRef<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<ReportAiStreamPayload>("report_ai_stream", (event) => {
      const payload = event.payload;
      if (payload.streamId !== activePolishStreamIdRef.current) {
        return;
      }

      if (payload.eventType === "start") {
        setContent("");
        setPolishStreamStatus("Connecting to AI provider...");
        return;
      }

      if (payload.eventType === "delta") {
        setPolishStreamStatus("Writing polished report...");
        setContent((current) => `${current}${payload.content}`);
      }

      if (payload.eventType === "reasoning") {
        setPolishStreamStatus("AI is reasoning...");
      }

      if (payload.eventType === "done") {
        setPolishStreamStatus("Finalizing report...");
        setPolishCancelled(false);
        activePolishStreamIdRef.current = null;
        setActivePolishStreamId(null);
      }

      if (payload.eventType === "error") {
        setPolishStreamStatus(payload.message ?? "AI stream ended with an error.");
        setPolishCancelled(false);
        activePolishStreamIdRef.current = null;
        setActivePolishStreamId(null);
      }

      if (payload.eventType === "cancelled") {
        setPolishCancelled(true);
        setPolishStreamStatus(payload.message ?? "Report polish was cancelled.");
        activePolishStreamIdRef.current = null;
        setActivePolishStreamId(null);
      }
    }).then((cleanup) => {
      unlisten = cleanup;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  const value = useMemo<ReportsWorkspaceState>(
    () => ({
      startDate,
      setStartDate,
      endDate,
      setEndDate,
      recipientName,
      setRecipientName,
      selectedProjectId,
      setSelectedProjectId,
      selectedGitRefs,
      setSelectedGitRefs,
      selectedWorktreePaths,
      setSelectedWorktreePaths,
      useProjectGitFocus,
      setUseProjectGitFocus,
      includeCommits,
      setIncludeCommits,
      includeManualLogs,
      setIncludeManualLogs,
      includeWeeklyTasks,
      setIncludeWeeklyTasks,
      includeHidden,
      setIncludeHidden,
      report,
      setReport,
      content,
      setContent,
      copied,
      setCopied,
      reportAiProvider,
      setReportAiProvider,
      openRouterKey,
      setOpenRouterKey,
      groqKey,
      setGroqKey,
      nvidiaBuildKey,
      setNvidiaBuildKey,
      readiness,
      setReadiness,
      polishStreamStatus,
      setPolishStreamStatus,
      activePolishStreamId,
      polishCancelled,
      beginPolishStream: () => {
        const streamId = createStreamId();
        activePolishStreamIdRef.current = streamId;
        setActivePolishStreamId(streamId);
        setPolishCancelled(false);
        setPolishStreamStatus("Preparing report context...");
        return streamId;
      },
      finishPolishStream: () => {
        activePolishStreamIdRef.current = null;
        setActivePolishStreamId(null);
        setPolishCancelled(false);
        setPolishStreamStatus(null);
      },
      markPolishStreamCancelled: () => {
        setPolishCancelled(true);
        setPolishStreamStatus("Cancelling report polish...");
      },
    }),
    [
      activePolishStreamId,
      content,
      copied,
      endDate,
      groqKey,
      includeCommits,
      includeHidden,
      includeManualLogs,
      includeWeeklyTasks,
      openRouterKey,
      polishStreamStatus,
      polishCancelled,
      nvidiaBuildKey,
      readiness,
      recipientName,
      report,
      reportAiProvider,
      selectedProjectId,
      selectedGitRefs,
      selectedWorktreePaths,
      startDate,
      useProjectGitFocus,
    ],
  );

  return (
    <ReportsWorkspaceContext.Provider value={value}>
      {children}
    </ReportsWorkspaceContext.Provider>
  );
}

export function useReportsWorkspace() {
  const context = useContext(ReportsWorkspaceContext);

  if (!context) {
    throw new Error("useReportsWorkspace must be used inside ReportsWorkspaceProvider");
  }

  return context;
}

function createStreamId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
