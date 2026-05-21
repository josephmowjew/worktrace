import { Calendar, Flag, FolderKanban, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import type { Project } from "../../types/project";
import type { WeeklyTaskPriority } from "../../types/weeklyTask";
import { Button } from "./Button";

export function AddItemBar({
  onAdd,
  projects,
  weekRange,
}: {
  onAdd: (title: string, priority: WeeklyTaskPriority, projectId?: string) => void;
  projects: Project[];
  weekRange: { label: string };
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<WeeklyTaskPriority>("normal");
  const [projectId, setProjectId] = useState("");

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd(title.trim(), priority, projectId || undefined);
    setTitle("");
    setPriority("normal");
    setProjectId("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 p-2">
      <button
        onClick={handleSubmit}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-300 transition-colors hover:bg-blue-500/25"
      >
        <Plus className="h-4 w-4" />
      </button>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a plan item... e.g. Finalize report export polish"
        className="min-w-48 flex-1 bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
      />

      <div className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-slate-900/50 px-2 py-1.5 text-xs text-slate-400">
        <Calendar className="h-3.5 w-3.5" />
        <span>{weekRange.label}</span>
      </div>

      <div className="relative">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as WeeklyTaskPriority)}
          className="appearance-none rounded-lg border border-white/8 bg-slate-900/50 py-1.5 pl-7 pr-6 text-xs text-slate-300 focus:outline-none"
        >
          <option value="high">P High</option>
          <option value="normal">P Normal</option>
          <option value="low">P Low</option>
        </select>
        <Flag className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
      </div>

      <div className="relative">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="appearance-none rounded-lg border border-white/8 bg-slate-900/50 py-1.5 pl-7 pr-6 text-xs text-slate-300 focus:outline-none"
        >
          <option value="">Select project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <FolderKanban className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
      </div>

      <Button variant="primary" onClick={handleSubmit} disabled={!title.trim()}>
        <Sparkles className="h-3.5 w-3.5" />
        Add Item
      </Button>
    </div>
  );
}
