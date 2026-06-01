import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { listen, emit } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  CheckCircle2,
  Clock3,
  FileQuestion,
  FolderKanban,
  ListChecks,
  Loader2,
  Mic,
  Move,
  Paperclip,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { listActivity } from "../lib/api/activity";
import { getActiveFocusSession } from "../lib/api/focusSessions";
import { addManualLogAttachment } from "../lib/api/manualLogAttachments";
import { quickCaptureLog } from "../lib/api/manualLogs";
import { listProjects } from "../lib/api/projects";
import { getSettings } from "../lib/api/settings";
import { addTaskAttachment } from "../lib/api/taskAttachments";
import { createWeeklyTask } from "../lib/api/weeklyTasks";
import { hideQuickCapture } from "../lib/api/windows";
import { extractVoiceCaptureContent } from "../lib/voiceCommands";
import { todayRange } from "../lib/dates";
import { useWeekRange } from "../hooks/useWeekRange";
import { Select } from "../components/ui/Select";
import type { ActivityDay, ActivityItem } from "../types/activity";
import type { ActivityType } from "../types/manualLog";
import type { VoiceCaptureDraft, VoiceCaptureKind } from "../types/voiceCapture";
import type { WeeklyTaskPriority, WeeklyTaskType } from "../types/weeklyTask";

type CaptureMode = "manual_log" | "task";

const categories: Array<{ value: ActivityType; label: string }> = [
  { value: "Meeting", label: "Meeting" },
  { value: "Development", label: "Development" },
  { value: "BugFix", label: "Bug fix" },
  { value: "Testing", label: "Testing" },
  { value: "Deployment", label: "Deployment" },
  { value: "Research", label: "Research" },
  { value: "Documentation", label: "Docs" },
  { value: "Planning", label: "Planning" },
  { value: "Support", label: "Support" },
  { value: "CodeReview", label: "Code review" },
  { value: "ClientFeedback", label: "Client feedback" },
  { value: "Debugging", label: "Debugging" },
  { value: "ClientCall", label: "Client call" },
  { value: "AdminTask", label: "Admin task" },
];

const taskTypes: Array<{ value: WeeklyTaskType; label: string }> = [
  { value: "planned_work", label: "Planned" },
  { value: "blocker", label: "Blocker" },
  { value: "carryover", label: "Carryover" },
  { value: "completed_checklist", label: "Checklist" },
  { value: "follow_up", label: "Follow up" },
];

const priorities: Array<{ value: WeeklyTaskPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

const durationOptions = [15, 30, 60];

export function QuickCaptureWindow() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const today = useMemo(() => todayRange(), []);
  const week = useWeekRange();
  const [mode, setMode] = useState<CaptureMode>("manual_log");
  const [summary, setSummary] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("Meeting");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState<WeeklyTaskType>("planned_work");
  const [taskPriority, setTaskPriority] = useState<WeeklyTaskPriority>("normal");
  const [taskDetails, setTaskDetails] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projectHint, setProjectHint] = useState<string | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [customDuration, setCustomDuration] = useState("");
  const [attachmentPaths, setAttachmentPaths] = useState<string[]>([]);
  const [voiceDraft, setVoiceDraft] = useState<VoiceCaptureDraft | null>(null);
  const [voiceKindResolved, setVoiceKindResolved] = useState(true);
  const [captured, setCaptured] = useState(false);

  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: listProjects });
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const activeFocusQuery = useQuery({ queryKey: ["activeFocusSession"], queryFn: getActiveFocusSession });
  const todayActivityQuery = useQuery({
    queryKey: ["activity", "quickCapture", today.from, today.to],
    queryFn: () => listActivity({ from: today.from, to: today.to }),
  });
  const weekActivityQuery = useQuery({
    queryKey: ["activity", "quickCapture", week.from, week.to],
    queryFn: () => listActivity({ from: week.from, to: week.to }),
  });

  const projects = useMemo(
    () => (projectsQuery.data ?? []).filter((project) => project.status === "active"),
    [projectsQuery.data],
  );

  const suggestedProjectId = useMemo(() => {
    if (activeFocusQuery.data?.projectId) return activeFocusQuery.data.projectId;
    const todayProject = mostRecentProjectId(flattenActivity(todayActivityQuery.data ?? []));
    if (todayProject) return todayProject;
    return mostRecentProjectId(flattenActivity(weekActivityQuery.data ?? [])) ?? "";
  }, [activeFocusQuery.data?.projectId, todayActivityQuery.data, weekActivityQuery.data]);

  const suggestedProject = useMemo(
    () => projects.find((project) => project.id === suggestedProjectId),
    [projects, suggestedProjectId],
  );
  const projectOptions = useMemo(
    () => [
      { value: "", label: "General / no project", icon: FolderKanban },
      ...projects.map((project) => ({
        value: project.id,
        label: project.name,
        icon: FolderKanban,
      })),
    ],
    [projects],
  );

  useEffect(() => {
    document.documentElement.classList.add("quick-capture-window");
    document.body.classList.add("quick-capture-window");
    window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      document.documentElement.classList.remove("quick-capture-window");
      document.body.classList.remove("quick-capture-window");
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<VoiceCaptureDraft>("quick-capture://voice-draft", (event) => {
      applyVoiceDraft(event.payload);
    }).then((dispose) => {
      unlisten = dispose;
    }).catch(() => {});

    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!projectHint || projectId || !projects.length) return;
    const normalizedHint = normalizeName(projectHint);
    const match = projects.find((project) => {
      const normalizedName = normalizeName(project.name);
      if (voiceDraft) return normalizedName === normalizedHint;
      return normalizedName === normalizedHint || normalizedName.includes(normalizedHint);
    });
    if (match) {
      setProjectId(match.id);
      setProjectHint(null);
    }
  }, [projectHint, projectId, projects, voiceDraft]);

  const captureMutation = useMutation({
    mutationFn: async () => {
      if (mode === "task") {
        const task = await createWeeklyTask({
          title: taskTitle.trim(),
          details: taskDetails.trim() || null,
          taskType,
          status: "todo",
          priority: taskPriority,
          projectId: projectId || null,
          weekStartDate: week.from,
          targetDate: today.from,
          includedInReport: false,
        });
        for (const path of attachmentPaths) {
          await addTaskAttachment(task.id, path);
        }
        await emit("quick-capture://created", task);
        return task;
      }

      const log = await quickCaptureLog({
        summary: summary.trim(),
        activityType,
        projectId: projectId || null,
        durationMinutes,
        includedInReport: settingsQuery.data?.quickCaptureIncludeInReport ?? true,
      });
      for (const path of attachmentPaths) {
        await addManualLogAttachment(log.id, path);
      }
      return log;
    },
    onSuccess: () => {
      setCaptured(true);
      window.setTimeout(() => {
        resetDraft();
        hideQuickCapture().catch(() => getCurrentWindow().hide());
      }, 650);
    },
  });

  const canSave = (mode === "task" ? Boolean(taskTitle.trim()) : Boolean(summary.trim()))
    && (!voiceDraft || voiceKindResolved);
  const draftKind: VoiceCaptureKind | null = voiceDraft?.kind ?? null;

  function save() {
    if (!canSave || captureMutation.isPending) return;
    captureMutation.mutate();
  }

  function applyVoiceDraft(draft: VoiceCaptureDraft) {
    resetDraft({ keepMode: false });
    setVoiceDraft(draft);
    if (draft.kind === "task") {
      setVoiceKindResolved(true);
      setMode("task");
      setTaskTitle(draft.task?.title ?? "");
      setTaskType(draft.task?.taskType ?? "planned_work");
      setTaskPriority(draft.task?.priority ?? "normal");
      setProjectHint(draft.task?.projectHint ?? null);
    } else if (draft.kind === "manual_log") {
      setVoiceKindResolved(true);
      setMode("manual_log");
      setSummary(draft.manualLog?.summary ?? "");
      setActivityType(draft.manualLog?.activityType ?? "Development");
      setDurationMinutes(draft.manualLog?.durationMinutes ?? null);
      setCustomDuration(draft.manualLog?.durationMinutes ? String(draft.manualLog.durationMinutes) : "");
      setProjectHint(draft.manualLog?.projectHint ?? null);
    } else {
      setVoiceKindResolved(false);
      setMode("manual_log");
      setSummary(extractVoiceCaptureContent("manual_log", draft.transcript));
      setTaskTitle(extractVoiceCaptureContent("task", draft.transcript));
      setProjectHint(null);
    }
    window.setTimeout(() => inputRef.current?.focus(), 80);
  }

  function resetDraft({ keepMode = true }: { keepMode?: boolean } = {}) {
    if (!keepMode) {
      setMode("manual_log");
    }
    setSummary("");
    setActivityType("Meeting");
    setTaskTitle("");
    setTaskType("planned_work");
    setTaskPriority("normal");
    setTaskDetails("");
    setProjectId("");
    setProjectHint(null);
    setDurationMinutes(null);
    setCustomDuration("");
    setAttachmentPaths([]);
    setVoiceDraft(null);
    setVoiceKindResolved(true);
    setCaptured(false);
  }

  async function closeWindow() {
    await hideQuickCapture().catch(() => getCurrentWindow().hide());
  }

  async function pickAttachments() {
    const selected = await open({
      multiple: true,
      directory: false,
      filters: [
        {
          name: "Images and PDFs",
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "pdf"],
        },
      ],
    });
    const selectedPaths = Array.isArray(selected) ? selected : typeof selected === "string" ? [selected] : [];
    if (!selectedPaths.length) return;
    setAttachmentPaths((current) => {
      const next = [...current];
      for (const path of selectedPaths) {
        if (!next.includes(path) && next.length < 20) {
          next.push(path);
        }
      }
      return next;
    });
  }

  function handleDuration(value: number | "custom") {
    if (value === "custom") {
      setDurationMinutes(null);
      setCustomDuration("");
      return;
    }
    setCustomDuration("");
    setDurationMinutes(value);
  }

  function switchMode(nextMode: CaptureMode) {
    setMode(nextMode);
    if (voiceDraft) {
      setVoiceKindResolved(true);
    }
    if (nextMode === "task" && !taskTitle.trim()) {
      setTaskTitle(
        voiceDraft
          ? extractVoiceCaptureContent("task", voiceDraft.transcript)
          : summary.trim(),
      );
    }
    if (nextMode === "manual_log" && !summary.trim()) {
      setSummary(
        voiceDraft
          ? extractVoiceCaptureContent("manual_log", voiceDraft.transcript)
          : taskTitle.trim(),
      );
    }
    window.setTimeout(() => inputRef.current?.focus(), 40);
  }

  function useHeardText() {
    if (!voiceDraft) return;
    if (mode === "task") {
      setTaskTitle(voiceDraft.transcript);
    } else {
      setSummary(voiceDraft.transcript);
    }
    setVoiceKindResolved(true);
  }

  function clearTriggerWords() {
    if (!voiceDraft) return;
    if (mode === "task") {
      setTaskTitle(extractVoiceCaptureContent("task", voiceDraft.transcript));
    } else {
      setSummary(extractVoiceCaptureContent("manual_log", voiceDraft.transcript));
    }
    setVoiceKindResolved(true);
  }

  return (
    <main className="flex h-screen min-h-0 overflow-hidden bg-slate-950/95 p-1.5 text-slate-100 sm:p-3">
      <section className="flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-cyan-200/15 bg-[#071122]/95 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div data-tauri-drag-region className="flex shrink-0 items-center justify-between border-b border-white/8 px-4 py-3">
          <div data-tauri-drag-region className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-500/10 text-cyan-200">
              <Move className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">
                {voiceDraft ? "Voice Capture" : "Quick Capture"}
              </p>
              <p className="text-[11px] text-slate-500">
                {voiceDraft ? "Review before saving" : "Ctrl + Shift + Space"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void closeWindow()}
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 transition-[background-color,color,transform] duration-150 hover:bg-white/5 hover:text-white active:scale-[0.96]"
            aria-label="Close quick capture"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {voiceDraft ? (
            <div className="space-y-2 rounded-xl border border-blue-300/15 bg-blue-500/10 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-100">
                  {draftKind === "unknown" ? <FileQuestion className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  Heard
                </span>
                <span className="rounded-md bg-slate-950/45 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {voiceDraft.confidence} confidence
                </span>
              </div>
              <p className="rounded-lg border border-white/8 bg-slate-950/35 px-2.5 py-2 text-xs leading-5 text-slate-300">
                {voiceDraft.transcript}
              </p>
              <div className="rounded-lg border border-cyan-300/15 bg-cyan-500/10 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/80">Will save</p>
                <p className="mt-1 text-xs leading-5 text-cyan-50">
                  {mode === "task" ? taskTitle || "Choose Task and add a title." : summary || "Choose Manual log and add a summary."}
                </p>
              </div>
              {voiceDraft.reason ? (
                <p className="mt-1 text-[11px] text-slate-500">{voiceDraft.reason}</p>
              ) : null}
              {voiceDraft.issues?.length ? (
                <div className="space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Needs review</p>
                  {voiceDraft.issues.slice(0, 3).map((issue) => (
                    <p key={issue} className="text-[11px] leading-4 text-slate-400">{issue}</p>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={clearTriggerWords}
                  className="min-h-7 rounded-lg border border-cyan-300/20 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-100 transition-[background-color,transform] duration-150 hover:bg-cyan-500/15 active:scale-[0.96]"
                >
                  Clear trigger words
                </button>
                <button
                  type="button"
                  onClick={useHeardText}
                  className="min-h-7 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-slate-300 transition-[background-color,transform] duration-150 hover:bg-white/[0.06] active:scale-[0.96]"
                >
                  Use heard text
                </button>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-slate-950/55 p-1">
            <button
              type="button"
              onClick={() => switchMode("manual_log")}
              aria-pressed={mode === "manual_log"}
              className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.96] ${
                mode === "manual_log"
                  ? "bg-cyan-500/15 text-cyan-100 shadow-[0_10px_28px_rgba(8,145,178,0.12)]"
                  : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200"
              }`}
            >
              <Mic className="h-3.5 w-3.5" />
              Manual log
            </button>
            <button
              type="button"
              onClick={() => switchMode("task")}
              aria-pressed={mode === "task"}
              className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.96] ${
                mode === "task"
                  ? "bg-blue-500/15 text-blue-100 shadow-[0_10px_28px_rgba(37,99,235,0.12)]"
                  : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200"
              }`}
            >
              <ListChecks className="h-3.5 w-3.5" />
              Task
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-semibold text-slate-400">
              <FolderKanban className="h-3.5 w-3.5 text-slate-500" />
              {projectId ? projects.find((project) => project.id === projectId)?.name ?? "Selected project" : projectHint ? `Project hint: ${projectHint}` : "No project"}
            </span>
            {mode === "manual_log" ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-semibold text-slate-400">
                <Clock3 className="h-3.5 w-3.5 text-slate-500" />
                {durationMinutes ? `${durationMinutes}m` : "No time"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-semibold text-slate-400">
                <ListChecks className="h-3.5 w-3.5 text-slate-500" />
                {taskPriority === "high" ? "High priority" : taskTypeLabel(taskType)}
              </span>
            )}
            {suggestedProject && !projectId && (!voiceDraft || Boolean(projectHint)) ? (
              <button
                type="button"
                onClick={() => setProjectId(suggestedProject.id)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-500/10 px-2.5 py-1.5 font-semibold text-cyan-100 transition-[background-color,border-color,transform] duration-150 hover:border-cyan-200/40 hover:bg-cyan-500/15 active:scale-[0.96]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Use {suggestedProject.name}
              </button>
            ) : null}
          </div>

          {mode === "manual_log" ? (
            <ManualLogFields
              inputRef={inputRef}
              summary={summary}
              setSummary={setSummary}
              activityType={activityType}
              setActivityType={setActivityType}
              projectId={projectId}
              setProjectId={setProjectId}
              projectOptions={projectOptions}
              durationMinutes={durationMinutes}
              setDurationMinutes={setDurationMinutes}
              customDuration={customDuration}
              setCustomDuration={setCustomDuration}
              handleDuration={handleDuration}
              save={save}
              closeWindow={closeWindow}
            />
          ) : (
            <TaskFields
              inputRef={inputRef}
              taskTitle={taskTitle}
              setTaskTitle={setTaskTitle}
              taskDetails={taskDetails}
              setTaskDetails={setTaskDetails}
              taskType={taskType}
              setTaskType={setTaskType}
              taskPriority={taskPriority}
              setTaskPriority={setTaskPriority}
              projectId={projectId}
              setProjectId={setProjectId}
              projectOptions={projectOptions}
              save={save}
              closeWindow={closeWindow}
            />
          )}

          <div className="rounded-xl border border-white/10 bg-slate-950/55 p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Paperclip className="h-3.5 w-3.5 text-cyan-200" />
                Attachments
                {attachmentPaths.length ? (
                  <span className="tabular-nums text-slate-500">{attachmentPaths.length}</span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => void pickAttachments()}
                disabled={attachmentPaths.length >= 20}
                className="min-h-8 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition-[background-color,color,transform] duration-150 hover:bg-white/[0.06] hover:text-slate-100 active:scale-[0.96] disabled:scale-100 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            {attachmentPaths.length ? (
              <div className="space-y-1.5">
                {attachmentPaths.map((path) => {
                  const name = path.split(/[\\/]/).pop() || "Attachment";
                  return (
                    <div key={path} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{name}</span>
                      <button
                        type="button"
                        onClick={() => setAttachmentPaths((current) => current.filter((item) => item !== path))}
                        className="grid h-7 w-7 place-items-center rounded-md text-slate-500 transition-[background-color,color,transform] duration-150 hover:bg-red-500/10 hover:text-red-200 active:scale-[0.96]"
                        aria-label={`Remove ${name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-600">Add screenshots or PDFs if this capture needs evidence.</p>
            )}
          </div>

          {captureMutation.error ? (
            <p className="rounded-lg border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
              {captureMutation.error instanceof Error ? captureMutation.error.message : "Capture failed."}
            </p>
          ) : null}
          {voiceDraft && !voiceKindResolved ? (
            <p className="rounded-lg border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Choose Task or Manual log before saving this voice capture.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/8 bg-[#071122]/98 px-4 py-3">
          <p className="min-w-0 text-[11px] leading-4 text-slate-500">
            {mode === "task"
              ? projectId
                ? `Create task in ${projects.find((project) => project.id === projectId)?.name ?? "selected project"}.`
                : "Create task without project."
              : projectId
                ? `Capture log in ${projects.find((project) => project.id === projectId)?.name ?? "selected project"}.`
                : "Capture log without project."}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={!canSave || captureMutation.isPending || captured}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition-[background-color,transform] duration-150 hover:bg-blue-500 active:scale-[0.96] disabled:cursor-not-allowed disabled:scale-100 disabled:opacity-50"
          >
            {captured ? <CheckCircle2 className="h-4 w-4" /> : captureMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {captured ? "Captured" : captureMutation.isPending ? "Saving" : mode === "task" ? "Create task" : "Capture log"}
          </button>
        </div>
      </section>
    </main>
  );
}

function ManualLogFields({
  inputRef,
  summary,
  setSummary,
  activityType,
  setActivityType,
  projectId,
  setProjectId,
  projectOptions,
  durationMinutes,
  setDurationMinutes,
  customDuration,
  setCustomDuration,
  handleDuration,
  save,
  closeWindow,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  summary: string;
  setSummary: (value: string) => void;
  activityType: ActivityType;
  setActivityType: (value: ActivityType) => void;
  projectId: string;
  setProjectId: (value: string) => void;
  projectOptions: Array<{ value: string; label: string; icon: typeof FolderKanban }>;
  durationMinutes: number | null;
  setDurationMinutes: (value: number | null) => void;
  customDuration: string;
  setCustomDuration: (value: string) => void;
  handleDuration: (value: number | "custom") => void;
  save: () => void;
  closeWindow: () => Promise<void>;
}) {
  return (
    <>
      <textarea
        ref={inputRef}
        value={summary}
        onChange={(event) => setSummary(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            void closeWindow();
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            save();
          }
        }}
        placeholder="What did you just work on?"
        className="min-h-16 w-full resize-none rounded-xl border border-white/10 bg-slate-950/75 px-3 py-2.5 text-sm leading-6 text-slate-100 outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-slate-600 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-500/15"
      />

      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category.value}
            type="button"
            onClick={() => setActivityType(category.value)}
            className={`min-h-8 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96] ${
              activityType === category.value
                ? "border-cyan-300/40 bg-cyan-500/15 text-cyan-100"
                : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Select
          value={projectId}
          onChange={setProjectId}
          options={projectOptions}
          size="md"
          className="min-w-0 [&>button]:w-full [&>button]:min-w-0 [&>button]:bg-slate-950/55"
        />

        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950/55 px-2 py-2">
          <Clock3 className="h-4 w-4 text-slate-500" />
          {durationOptions.map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => handleDuration(minutes)}
              className={`min-h-7 rounded-md px-2 py-1 text-xs font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.96] ${
                durationMinutes === minutes
                  ? "bg-blue-500/20 text-blue-100"
                  : "text-slate-500 hover:bg-white/5 hover:text-slate-300"
              }`}
            >
              {minutes}m
            </button>
          ))}
          <input
            value={customDuration}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setCustomDuration(value);
              setDurationMinutes(value ? Number(value) : null);
            }}
            placeholder="min"
            inputMode="numeric"
            className="h-7 w-12 rounded-md border border-white/10 bg-slate-950/70 px-2 text-xs text-slate-100 outline-none focus:border-blue-300/40"
          />
          {durationMinutes ? (
            <button
              type="button"
              onClick={() => {
                setDurationMinutes(null);
                setCustomDuration("");
              }}
              className="min-h-7 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition-[background-color,color,transform] duration-150 hover:bg-white/5 hover:text-slate-300 active:scale-[0.96]"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}

function TaskFields({
  inputRef,
  taskTitle,
  setTaskTitle,
  taskDetails,
  setTaskDetails,
  taskType,
  setTaskType,
  taskPriority,
  setTaskPriority,
  projectId,
  setProjectId,
  projectOptions,
  save,
  closeWindow,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  taskTitle: string;
  setTaskTitle: (value: string) => void;
  taskDetails: string;
  setTaskDetails: (value: string) => void;
  taskType: WeeklyTaskType;
  setTaskType: (value: WeeklyTaskType) => void;
  taskPriority: WeeklyTaskPriority;
  setTaskPriority: (value: WeeklyTaskPriority) => void;
  projectId: string;
  setProjectId: (value: string) => void;
  projectOptions: Array<{ value: string; label: string; icon: typeof FolderKanban }>;
  save: () => void;
  closeWindow: () => Promise<void>;
}) {
  return (
    <>
      <textarea
        ref={inputRef}
        value={taskTitle}
        onChange={(event) => setTaskTitle(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            void closeWindow();
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            save();
          }
        }}
        placeholder="What task should be added?"
        className="min-h-16 w-full resize-none rounded-xl border border-white/10 bg-slate-950/75 px-3 py-2.5 text-sm leading-6 text-slate-100 outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-slate-600 focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15"
      />

      <textarea
        value={taskDetails}
        onChange={(event) => setTaskDetails(event.currentTarget.value)}
        placeholder="Details, notes, or acceptance criteria"
        className="min-h-12 w-full resize-none rounded-xl border border-white/10 bg-slate-950/55 px-3 py-2 text-xs leading-5 text-slate-200 outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-slate-600 focus:border-blue-300/40 focus:ring-2 focus:ring-blue-500/10"
      />

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Select
          value={projectId}
          onChange={setProjectId}
          options={projectOptions}
          size="md"
          className="min-w-0 [&>button]:w-full [&>button]:min-w-0 [&>button]:bg-slate-950/55"
        />
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-slate-950/55 p-1">
          {priorities.map((priority) => (
            <button
              key={priority.value}
              type="button"
              onClick={() => setTaskPriority(priority.value)}
              className={`min-h-8 rounded-lg px-2 text-xs font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.96] ${
                taskPriority === priority.value
                  ? priority.value === "high"
                    ? "bg-amber-500/20 text-amber-100"
                    : "bg-blue-500/20 text-blue-100"
                  : "text-slate-500 hover:bg-white/5 hover:text-slate-300"
              }`}
            >
              {priority.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {taskTypes.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => setTaskType(type.value)}
            className={`min-h-8 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.96] ${
              taskType === type.value
                ? "border-blue-300/40 bg-blue-500/15 text-blue-100"
                : "border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>
    </>
  );
}

function flattenActivity(days: ActivityDay[]): ActivityItem[] {
  return days.flatMap((day) => day.items);
}

function mostRecentProjectId(items: { projectId?: string | null; occurredAt?: string }[]) {
  return [...items]
    .filter((item) => item.projectId)
    .sort((left, right) => (right.occurredAt ?? "").localeCompare(left.occurredAt ?? ""))[0]?.projectId ?? "";
}

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function taskTypeLabel(value: WeeklyTaskType) {
  return taskTypes.find((type) => type.value === value)?.label ?? "Task";
}
