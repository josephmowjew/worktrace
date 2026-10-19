import { useMutation, useQueryClient } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";
import { ListTodo, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/Button";
import { useExperience } from "../features/experience/useExperience";
import { localWorkError } from "../features/experience/errors";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { normalizeWeekStartsOn } from "../hooks/useWeekRange";
import { createWeeklyTask } from "../lib/api/weeklyTasks";
import { quickCaptureLog } from "../lib/api/manualLogs";
import { invalidateWorkEvidence } from "../lib/api/queryKeys";
import { currentWeekRange } from "../lib/dates";
import { hideQuickCapture } from "../lib/api/windows";

export function EssentialsCaptureWindow() {
  const experience = useExperience();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"task" | "journal">("task");
  const save = useMutation({
    mutationFn: async () => {
      if (kind === "journal" && experience.hasFeature("journal")) return quickCaptureLog({ summary: title.trim(), activityType: "AdminTask", includedInReport: experience.hasFeature("reports") });
      return createWeeklyTask({ title: title.trim(), taskType: "planned_work", status: "todo", weekStartDate: currentWeekRange(new Date(), normalizeWeekStartsOn(experience.settings?.weekStartsOn)).from, includedInReport: experience.hasFeature("reports") });
    },
    onSuccess: async () => {
      setTitle("");
      await invalidateWorkEvidence(queryClient);
      if ("__TAURI_INTERNALS__" in window) { await emit("quick-capture://created"); await hideQuickCapture(); }
    },
  });
  function close() { if (!save.isPending && "__TAURI_INTERNALS__" in window) void hideQuickCapture(); }
  useEscapeKey(close, !save.isPending);
  useEffect(() => {
    document.documentElement.classList.add("quick-capture-window");
    inputRef.current?.focus();
    return () => document.documentElement.classList.remove("quick-capture-window");
  }, []);
  useEffect(() => { if (!experience.hasFeature("journal")) setKind("task"); }, [experience.mode, experience.settings?.enabledFeatures]);
  return <main className="flex h-screen flex-col bg-[var(--wt-bg)] p-4 text-[var(--wt-text)]">
    <header data-tauri-drag-region className="mb-5 flex items-center justify-between gap-3"><span data-tauri-drag-region className="flex items-center gap-2 text-sm font-medium"><ListTodo size={15} />Quick capture</span><button type="button" className="wt-shell-icon" aria-label="Close quick capture" onClick={close} disabled={save.isPending}><X size={15} /></button></header>
    {experience.hasFeature("journal") ? <div className="mb-3 flex gap-1"><button type="button" className={`wt-task-filter ${kind === "task" ? "is-active" : ""}`} aria-pressed={kind === "task"} onClick={() => setKind("task")}>Task</button><button type="button" className={`wt-task-filter ${kind === "journal" ? "is-active" : ""}`} aria-pressed={kind === "journal"} onClick={() => setKind("journal")}>Work journal</button></div> : null}
    <form className="flex min-h-0 flex-1 flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (title.trim() && !save.isPending) save.mutate(); }}>
      <label className="wt-field-label min-h-0 flex-1">{kind === "task" ? "What needs to get done?" : "What happened?"}<textarea ref={inputRef} value={title} onChange={(event) => setTitle(event.target.value)} disabled={save.isPending} className="wt-input min-h-20 flex-1 resize-none rounded-md p-3 text-sm" placeholder={kind === "task" ? "Add a task..." : "Write a quick note..."} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (title.trim() && !save.isPending) save.mutate(); } }} /></label>
      {save.error ? <p role="alert" className="text-xs text-[var(--wt-danger)]">{localWorkError(save.error)}</p> : null}
      <footer className="flex items-center justify-between gap-3"><span className="text-[11px] text-[var(--wt-text-muted)]">Enter to save. Escape to close.</span><Button type="submit" size="sm" variant="primary" disabled={!title.trim() || save.isPending}>{save.isPending ? "Saving..." : kind === "task" ? "Add task" : "Save note"}</Button></footer>
    </form>
  </main>;
}
