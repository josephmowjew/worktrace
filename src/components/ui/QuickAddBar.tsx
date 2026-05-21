import { Flag, FolderKanban, Plus } from "lucide-react";
import { useState } from "react";
import type { Project } from "../../types/project";
import type { WeeklyTaskPriority } from "../../types/weeklyTask";
import { Select } from "./Select";

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
        <Select
          value={priority}
          onChange={(value) => setPriority(value as WeeklyTaskPriority)}
          options={[
            { value: "high", label: "P High", icon: Flag },
            { value: "normal", label: "P Normal", icon: Flag },
            { value: "low", label: "P Low", icon: Flag },
          ]}
          className="flex-1"
          size="sm"
        />

        <Select
          value={projectId}
          onChange={setProjectId}
          options={[
            { value: "", label: "Select project", icon: FolderKanban },
            ...projects.map((p) => ({
              value: p.id,
              label: p.name,
              icon: FolderKanban,
            })),
          ]}
          className="flex-1"
          size="sm"
        />
      </div>
    </div>
  );
}
