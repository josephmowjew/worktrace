import { Flag, FolderKanban, Plus } from "lucide-react";
import { useState } from "react";
import type { Project } from "../../types/project";
import type { WeeklyTaskPriority } from "../../types/weeklyTask";

export function QuickAddBar({
  onAdd,
  projects,
  onOpenFullForm,
}: {
  onAdd: (title: string, priority: WeeklyTaskPriority, projectId?: string) => void;
  projects: Project[];
  onOpenFullForm: (title: string, priority: WeeklyTaskPriority, projectId?: string) => void;
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
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add plan item..."
          className="flex-1 rounded-lg border border-white/10 bg-slate-950/70 px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
        />
        <button
          onClick={() => {
            if (title.trim()) {
              onOpenFullForm(title.trim(), priority, projectId || undefined);
              setTitle("");
            }
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-300 transition-colors hover:bg-blue-500/25"
          title="Open full form"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as WeeklyTaskPriority)}
            className="w-full appearance-none rounded-lg border border-white/8 bg-slate-900/50 py-1.5 pl-6 pr-5 text-[10px] text-slate-300 focus:outline-none"
          >
            <option value="high">P High</option>
            <option value="normal">P Normal</option>
            <option value="low">P Low</option>
          </select>
          <Flag className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
        </div>

        <div className="relative flex-1">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full appearance-none rounded-lg border border-white/8 bg-slate-900/50 py-1.5 pl-6 pr-5 text-[10px] text-slate-300 focus:outline-none"
          >
            <option value="">Select project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <FolderKanban className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
        </div>
      </div>
    </div>
  );
}
