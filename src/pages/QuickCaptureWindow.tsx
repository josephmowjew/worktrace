import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CheckCircle2, Clock3, FolderKanban, Loader2, Move, Paperclip, Sparkles, Trash2, X } from "lucide-react";
import { listActivity } from "../lib/api/activity";
import { getActiveFocusSession } from "../lib/api/focusSessions";
import { addManualLogAttachment } from "../lib/api/manualLogAttachments";
import { quickCaptureLog } from "../lib/api/manualLogs";
import { listProjects } from "../lib/api/projects";
import { getSettings } from "../lib/api/settings";
import { hideQuickCapture } from "../lib/api/windows";
import { todayRange } from "../lib/dates";
import { useWeekRange } from "../hooks/useWeekRange";
import { Select } from "../components/ui/Select";
import type { ActivityDay, ActivityItem } from "../types/activity";
import type { ActivityType } from "../types/manualLog";

const categories: Array<{ value: ActivityType; label: string }> = [
  { value: "Meeting", label: "Meeting" },
  { value: "Support", label: "Support" },
  { value: "CodeReview", label: "Code review" },
  { value: "Deployment", label: "Deployment" },
  { value: "Debugging", label: "Debugging" },
  { value: "Research", label: "Research" },
  { value: "ClientCall", label: "Client call" },
  { value: "AdminTask", label: "Admin task" },
];

const durationOptions = [15, 30, 60];

export function QuickCaptureWindow() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const today = useMemo(() => todayRange(), []);
  const week = useWeekRange();
  const [summary, setSummary] = useState("");
  const [activityType, setActivityType] = useState<ActivityType>("Meeting");
  const [projectId, setProjectId] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [customDuration, setCustomDuration] = useState("");
  const [attachmentPaths, setAttachmentPaths] = useState<string[]>([]);
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

  const captureMutation = useMutation({
    mutationFn: async () => {
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
      setSummary("");
      setAttachmentPaths([]);
      window.setTimeout(() => {
        setCaptured(false);
        hideQuickCapture().catch(() => getCurrentWindow().hide());
      }, 650);
    },
  });

  function save() {
    if (!summary.trim() || captureMutation.isPending) return;
    captureMutation.mutate();
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

  return (
    <main className="flex h-screen min-h-0 overflow-hidden bg-slate-950/95 p-1.5 text-slate-100 sm:p-3">
      <section className="flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-cyan-200/15 bg-[#071122]/95 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <div data-tauri-drag-region className="flex shrink-0 items-center justify-between border-b border-white/8 px-4 py-3">
          <div data-tauri-drag-region className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-500/10 text-cyan-200">
              <Move className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Quick Capture</p>
              <p className="text-[11px] text-slate-500">Ctrl + Shift + Space</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => hideQuickCapture().catch(() => getCurrentWindow().hide())}
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:bg-white/5 hover:text-white"
            aria-label="Close quick capture"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-semibold text-slate-400">
              <FolderKanban className="h-3.5 w-3.5 text-slate-500" />
              {projectId ? projects.find((project) => project.id === projectId)?.name ?? "Selected project" : "No project"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-semibold text-slate-400">
              <Clock3 className="h-3.5 w-3.5 text-slate-500" />
              {durationMinutes ? `${durationMinutes}m` : "No time"}
            </span>
            {suggestedProject && !projectId ? (
              <button
                type="button"
                onClick={() => setProjectId(suggestedProject.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/20 bg-cyan-500/10 px-2.5 py-1.5 font-semibold text-cyan-100 transition hover:border-cyan-200/40 hover:bg-cyan-500/15"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Use {suggestedProject.name}
              </button>
            ) : null}
          </div>

          <textarea
            ref={inputRef}
            value={summary}
            onChange={(event) => setSummary(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                hideQuickCapture().catch(() => getCurrentWindow().hide());
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                save();
              }
            }}
            placeholder="What did you just work on?"
            className="min-h-16 w-full resize-none rounded-xl border border-white/10 bg-slate-950/75 px-3 py-2.5 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-500/15"
          />

          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category.value}
                type="button"
                onClick={() => setActivityType(category.value)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
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
                  className={`rounded-md px-2 py-1 text-xs font-semibold ${
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
                  className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-white/5 hover:text-slate-300"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

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
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-slate-100 disabled:opacity-50"
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
                        className="grid h-7 w-7 place-items-center rounded-md text-slate-500 transition hover:bg-red-500/10 hover:text-red-200"
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

        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/8 bg-[#071122]/98 px-4 py-3">
          <p className="min-w-0 text-[11px] leading-4 text-slate-500">
            {projectId ? "Saved to the selected project." : "Saved without a project unless you choose one."}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={!summary.trim() || captureMutation.isPending || captured}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {captured ? <CheckCircle2 className="h-4 w-4" /> : captureMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {captured ? "Captured" : captureMutation.isPending ? "Saving" : "Capture"}
          </button>
        </div>
      </section>
    </main>
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
