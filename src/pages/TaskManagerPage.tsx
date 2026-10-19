import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, ListTodo, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { TaskAttachmentsSection } from "../components/ui/TaskDetailModal";
import { FocusSessionPanel } from "../components/ui/FocusSessionPanel";
import { useToast } from "../components/ui/ToastProvider";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { normalizeWeekStartsOn } from "../hooks/useWeekRange";
import { useExperience } from "../features/experience/useExperience";
import { localWorkError } from "../features/experience/errors";
import { visibleTasks, type TaskView } from "../features/experience/taskViews";
import { createWeeklyTask, deleteWeeklyTask, listTasks, updateWeeklyTask } from "../lib/api/weeklyTasks";
import { cancelFocusSession, getActiveFocusSession, startFocusSession, stopFocusSession } from "../lib/api/focusSessions";
import { invalidateWorkEvidence } from "../lib/api/queryKeys";
import { currentWeekRange, todayRange } from "../lib/dates";
import type { UpdateWeeklyTaskInput, WeeklyTask } from "../types/weeklyTask";

const inputClass = "wt-input w-full rounded-md px-3 py-2 text-sm";

export function TaskManagerPage({ todayOnly = false }: { todayOnly?: boolean }) {
  const experience = useExperience();
  const queryClient = useQueryClient();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [today, setToday] = useState(() => todayRange());
  const [view, setView] = useState<TaskView>("open");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<WeeklyTask["priority"]>("normal");
  const [more, setMore] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const tasksQuery = useQuery({ queryKey: ["weeklyTasks", "all"], queryFn: listTasks });
  const focusQuery = useQuery({ queryKey: ["focusSession", "active"], queryFn: getActiveFocusSession, enabled: experience.hasFeature("focus"), refetchInterval: 5000 });
  useEscapeKey(() => setMore(false), more);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(todayRange()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function invalidateTasks() {
    await invalidateWorkEvidence(queryClient, { extraQueryKeys: [["todayCommandCenter"], ["priorityReminders"]] });
  }
  const create = useMutation({
    mutationFn: () => createWeeklyTask({ title: title.trim(), taskType: "planned_work", status: "todo", weekStartDate: currentWeekRange(new Date(), normalizeWeekStartsOn(experience.settings?.weekStartsOn)).from, targetDate: date || null, details: notes.trim() || null, priority, includedInReport: !experience.isDeveloper && experience.hasFeature("reports") }),
    onSuccess: async () => {
      setTitle(""); setDate(""); setNotes(""); setPriority("normal"); setMore(false);
      await invalidateTasks();
      titleRef.current?.focus();
      toast.success("Task added");
    },
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateWeeklyTaskInput }) => updateWeeklyTask(id, input),
    onSuccess: async () => { await invalidateTasks(); },
  });
  const remove = useMutation({
    mutationFn: deleteWeeklyTask,
    onSuccess: async () => { setEditingId(null); await invalidateTasks(); toast.success("Task deleted"); },
  });
  const focus = useMutation({
    mutationFn: startFocusSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["focusSession"] }),
  });
  const finishFocus = useMutation({
    mutationFn: ({ id, cancel }: { id: string; cancel?: boolean }) => cancel ? cancelFocusSession(id) : stopFocusSession(id, { createManualLog: false }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["focusSession"] }),
  });

  useEffect(() => {
    const state = location.state as { openTask?: boolean; powerCommand?: string; openFocus?: boolean } | null;
    if (state?.openTask || state?.powerCommand?.toLowerCase().startsWith("task:")) {
      if (state.powerCommand) setTitle(state.powerCommand.slice(5).trim());
      titleRef.current?.focus();
      navigate(location.pathname, { replace: true, state: null });
    } else if (state?.openFocus) {
      document.getElementById("essentials-focus")?.scrollIntoView({ block: "center" });
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  const tasks = tasksQuery.data ?? [];
  const filtered = visibleTasks(tasks, view, today.date, search, todayOnly);
  const overdue = view === "open" ? filtered.filter((task) => task.targetDate && task.targetDate < today.date) : [];
  const remaining = view === "open" ? filtered.filter((task) => !task.targetDate || task.targetDate >= today.date) : filtered;
  const completedToday = todayOnly ? visibleTasks(tasks, "completed", today.date, search, true) : [];
  const mutationError = create.error ?? update.error ?? remove.error ?? focus.error ?? finishFocus.error;

  function renderRows(items: WeeklyTask[]) {
    return <div className="divide-y divide-[var(--wt-border)]">{items.map((task) => <div key={task.id}>
      <div className="wt-task-row">
        <button type="button" className={`wt-task-check ${task.status === "completed" ? "is-complete" : ""}`} aria-label={task.status === "completed" ? `Reopen ${task.title}` : task.status === "dropped" ? `Restore ${task.title}` : `Complete ${task.title}`} aria-pressed={task.status === "completed"} disabled={update.isPending} onClick={() => update.mutate({ id: task.id, input: { status: task.status === "completed" || task.status === "dropped" ? "todo" : "completed", completedAt: task.status === "completed" || task.status === "dropped" ? "" : today.date } })}>{task.status === "completed" ? <Check size={12} /> : null}</button>
        <button type="button" className="min-w-0 flex-1 py-3 text-left" aria-expanded={editingId === task.id} onClick={() => setEditingId(editingId === task.id ? null : task.id)}>
          <span className={`block break-words text-sm font-medium ${task.status === "completed" ? "text-[var(--wt-text-muted)] line-through" : "text-[var(--wt-text-strong)]"}`}>{task.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--wt-text-muted)]">
            {task.targetDate ? <span className={task.targetDate < today.date && task.status !== "completed" ? "text-[var(--wt-warning)]" : ""}>{task.targetDate === today.date ? "Today" : formatDate(task.targetDate)}</span> : null}
            {task.status === "blocked" ? <span className="text-[var(--wt-warning)]">Blocked</span> : task.status === "in_progress" ? <span>In progress</span> : task.status === "dropped" ? <span>Archived</span> : null}
            {task.priority === "high" ? <span>High priority</span> : null}
            {task.projectName ? <span>{task.projectName}</span> : null}
          </span>
        </button>
        <button type="button" className="wt-shell-icon" aria-label={`Edit ${task.title}`} onClick={() => setEditingId(editingId === task.id ? null : task.id)}>{editingId === task.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
      </div>
      {editingId === task.id ? <TaskEditor key={task.id + task.updatedAt} task={task} isPending={update.isPending || remove.isPending} onCancel={() => setEditingId(null)} onSave={async (input) => { await update.mutateAsync({ id: task.id, input }); setEditingId(null); }} onDelete={() => remove.mutate(task.id)} /> : null}
    </div>)}</div>;
  }

  return <div className="mx-auto max-w-4xl space-y-7 pb-8">
    <header className="wt-page-header flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 text-xs text-[var(--wt-text-muted)]">{todayOnly ? today.label : "Your work, at your pace"}</p><h1>{todayOnly ? "Today" : "Tasks"}</h1><p className="mt-2 text-sm text-[var(--wt-text-muted)]">{todayOnly ? "A little clarity for the day ahead." : "Everything you need to do, in one place."}</p></div>
      {todayOnly ? <Link className="wt-text-link" to="/tasks">All tasks <ChevronRight size={14} /></Link> : experience.isDeveloper ? <Link className="wt-text-link" to="/weekly-plan">Weekly board <ChevronRight size={14} /></Link> : null}
    </header>

    <form className="wt-task-composer" onSubmit={(event) => { event.preventDefault(); if (title.trim() && !create.isPending) create.mutate(); }}>
      <div className="flex items-center gap-3"><Plus size={18} className="shrink-0 text-[var(--wt-text-muted)]" /><input ref={titleRef} aria-label="New task" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={tasks.length ? "What needs to get done?" : "Add your first task..."} className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none" disabled={create.isPending} maxLength={1000} /><Button type="submit" variant="primary" size="sm" disabled={!title.trim() || create.isPending}>{create.isPending ? "Adding..." : "Add task"}</Button></div>
      <button type="button" className="mt-2 flex items-center gap-1 text-xs text-[var(--wt-text-muted)] hover:text-[var(--wt-text-strong)]" aria-expanded={more} onClick={() => setMore(!more)}><ChevronDown size={12} />{more ? "Fewer details" : "Add details"}</button>
      {more ? <div className="mt-4 grid gap-4 border-t border-[var(--wt-border)] pt-4 sm:grid-cols-2"><label className="wt-field-label">Due date <input type="date" className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="wt-field-label">Priority <select className={inputClass} value={priority} onChange={(event) => setPriority(event.target.value as WeeklyTask["priority"])}><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label><label className="wt-field-label sm:col-span-2">Notes <textarea className={inputClass} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div> : null}
    </form>
    {mutationError ? <p role="alert" className="text-sm text-[var(--wt-danger)]">{localWorkError(mutationError)}</p> : null}
    {!todayOnly ? <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--wt-border)] pb-3"><div className="flex flex-wrap gap-1">{([['open', 'To do'], ['upcoming', 'Upcoming'], ['completed', 'Completed'], ['all', 'All']] as const).map(([id, label]) => <button key={id} type="button" className={`wt-task-filter ${view === id ? "is-active" : ""}`} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}</div><label className="flex items-center gap-2 text-[var(--wt-text-muted)]"><Search size={14} /><input type="search" aria-label="Search tasks" placeholder="Search tasks" className="h-8 w-40 bg-transparent text-xs outline-none" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div> : null}
    {tasksQuery.isLoading ? <div aria-label="Loading tasks" className="space-y-3">{[0, 1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded-md bg-[var(--wt-surface-muted)]" />)}</div> : tasksQuery.isError ? <div role="alert" className="rounded-lg border border-[var(--wt-border)] p-5"><h2 className="text-sm font-medium">Tasks couldn't be loaded</h2><p className="mt-2 max-w-xl text-xs leading-5 text-[var(--wt-text-muted)]">{localWorkError(tasksQuery.error, "Please try again.")}</p><Button className="mt-3" size="sm" onClick={() => void tasksQuery.refetch()}>Try again</Button></div> : <>
      {overdue.length ? <section><h2 className="wt-task-section-title text-[var(--wt-warning)]">Overdue <span>{overdue.length}</span></h2>{renderRows(overdue)}</section> : null}
      {remaining.length ? <section><h2 className="wt-task-section-title">{todayOnly ? "To do" : view === "completed" ? "Completed" : view === "upcoming" ? "Upcoming" : view === "all" ? "All tasks" : "To do"}<span>{remaining.length}</span></h2>{renderRows(remaining)}</section> : filtered.length === 0 ? <div className="py-8 text-center"><ListTodo className="mx-auto mb-3 h-6 w-6 text-[var(--wt-text-muted)]" /><h2 className="text-sm font-medium">{search ? "No matching tasks" : !tasks.length ? "Start with one thing." : view === "completed" ? "Completed tasks will appear here." : todayOnly ? "Nothing else needs your attention today." : "You're all caught up."}</h2><p className="mt-2 text-xs text-[var(--wt-text-muted)]">{!tasks.length ? "Add a task above. A title is all you need." : todayOnly ? "You can find future and completed work in Tasks." : "Change the view or add something new."}</p></div> : null}
      {completedToday.length ? <section><h2 className="wt-task-section-title">Completed today <span>{completedToday.length}</span></h2>{renderRows(completedToday)}</section> : null}
    </>}
    {experience.hasFeature("focus") ? <section id="essentials-focus"><FocusSessionPanel activeSession={focusQuery.data} groups={[{ id: "tasks", label: "Tasks", options: tasks.filter((task) => task.status !== "completed" && task.status !== "dropped").map((task) => ({ kind: "task", id: task.id, title: task.title, projectId: task.projectId })) }]} onStart={(input) => focus.mutate(input)} onStop={() => focusQuery.data && finishFocus.mutate({ id: focusQuery.data.id })} onCancel={() => focusQuery.data && finishFocus.mutate({ id: focusQuery.data.id, cancel: true })} isPending={focus.isPending || finishFocus.isPending} /></section> : null}
    {!experience.isDeveloper && !experience.hasFeature("focus") ? <p className="pt-4 text-xs text-[var(--wt-text-muted)]">Keep it simple, or add tools when you need them. <Link className="underline underline-offset-4" to="/settings">Customize your workspace</Link></p> : null}
  </div>;
}

function TaskEditor({ task, isPending, onSave, onCancel, onDelete }: { task: WeeklyTask; isPending: boolean; onSave: (input: UpdateWeeklyTaskInput) => Promise<void>; onCancel: () => void; onDelete: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [date, setDate] = useState(task.targetDate ?? "");
  const [notes, setNotes] = useState(task.details ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [status, setStatus] = useState(task.status);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [attachments, setAttachments] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();
  useEscapeKey(() => { if (confirmDelete) setConfirmDelete(false); else onCancel(); });
  return <form className="wt-task-editor" onSubmit={(event) => { event.preventDefault(); if (title.trim()) void onSave({ title: title.trim(), targetDate: date, details: notes, priority, status, ...(status !== task.status ? { completedAt: status === "completed" || status === "dropped" ? todayRange().date : "" } : {}) }).catch(() => {}); }}>
    <label className="wt-field-label">Task <input autoFocus className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
    <div className="grid gap-4 sm:grid-cols-3"><label className="wt-field-label">Due date <input type="date" className={inputClass} value={date} onChange={(event) => setDate(event.target.value)} /></label><label className="wt-field-label">Priority <select className={inputClass} value={priority} onChange={(event) => setPriority(event.target.value as WeeklyTask["priority"])}><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label><label className="wt-field-label">Status <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value as WeeklyTask["status"])}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option><option value="dropped">Archived</option></select></label></div>
    <label className="wt-field-label">Notes <textarea rows={3} className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
    <button type="button" className="wt-text-link justify-self-start" aria-expanded={attachments} onClick={() => setAttachments(!attachments)}>Attachments {attachments ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>
    {attachments ? <TaskAttachmentsSection taskId={task.id} queryKey={["taskAttachments", task.id]} onChanged={() => queryClient.invalidateQueries({ queryKey: ["taskAttachments", task.id] })} onError={(title, message) => toast.error(title, message)} onSuccess={(title, message) => toast.success(title, message)} /> : null}
    <div className="flex flex-wrap items-center gap-2"><Button type="submit" size="sm" variant="primary" disabled={isPending || !title.trim()}>Save changes</Button><Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>Cancel</Button><button type="button" className="wt-shell-icon ml-auto" aria-label="Delete task" onClick={() => setConfirmDelete(true)} disabled={isPending}><Trash2 size={14} /></button></div>
    {confirmDelete ? <div className="flex flex-wrap items-center gap-3 text-xs"><p>Delete this task? This cannot be undone.</p><Button type="button" size="sm" className="wt-action-danger" onClick={onDelete} disabled={isPending}>Delete task permanently</Button><Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Keep task</Button></div> : null}
  </form>;
}

function formatDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: parsed.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}
