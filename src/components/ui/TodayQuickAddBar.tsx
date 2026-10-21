import { Plus } from "lucide-react";
import { useState } from "react";
import type { Project } from "../../types/project";
import type { WeeklyTaskPriority } from "../../types/weeklyTask";
import { Button } from "./Button";
import { Disclosure } from "./Disclosure";

type QuickAddValues = {
  title: string;
  projectId?: string | null;
  priority: WeeklyTaskPriority;
  targetDate: string;
};

type TodayQuickAddBarProps = {
  projects: Project[];
  todayDate: string;
  onAdd: (values: QuickAddValues) => void | Promise<unknown>;
  isPending?: boolean;
};

export function TodayQuickAddBar({
  projects,
  todayDate,
  onAdd,
  isPending = false,
}: TodayQuickAddBarProps) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("general");
  const [priority, setPriority] = useState<WeeklyTaskPriority>("normal");
  const [targetDate, setTargetDate] = useState(todayDate);

  const [error, setError] = useState(false);
  async function submit() {
    if (!title.trim() || isPending) return;
    setError(false);
    try {
      await onAdd({ title: title.trim(), projectId: projectId === "general" ? null : projectId, priority, targetDate: targetDate || todayDate });
      setTitle("");
    } catch { setError(true); }
  }
  return <form className="wt-task-composer space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
    <div className="flex items-center gap-3"><Plus size={16} className="text-[var(--wt-text-muted)]" /><input id="today-task-title" aria-label="New task for today" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to get done?" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" disabled={isPending} /><Button type="submit" variant="primary" size="sm" disabled={isPending || !title.trim()}>{isPending ? "Adding..." : "Add task"}</Button></div>
    <Disclosure title="Task details"><div className="grid gap-3 sm:grid-cols-3">
      <label className="wt-field-label">Project<select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="wt-input rounded-md px-3 py-2"><option value="general">General</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <label className="wt-field-label">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as WeeklyTaskPriority)} className="wt-input rounded-md px-3 py-2"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label>
      <label className="wt-field-label">Due date<input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} className="wt-input rounded-md px-3 py-2" /></label>
    </div></Disclosure>
    {error ? <p role="alert" className="text-xs text-[var(--wt-danger)]">Task could not be saved. Your title is ready to try again.</p> : null}
  </form>;
}
