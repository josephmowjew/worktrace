import { CalendarDays, Flag, FolderKanban, Plus } from "lucide-react";
import { useState } from "react";
import type { Project } from "../../types/project";
import type { WeeklyTaskPriority } from "../../types/weeklyTask";
import { Button } from "./Button";
import { Panel } from "./Panel";
import { Select } from "./Select";

type QuickAddValues = {
  title: string;
  projectId?: string | null;
  priority: WeeklyTaskPriority;
  targetDate: string;
};

type TodayQuickAddBarProps = {
  projects: Project[];
  todayDate: string;
  onAdd: (values: QuickAddValues) => void;
  isPending?: boolean;
};

const priorityOptions = [
  { value: "low", label: "Low", icon: Flag },
  { value: "normal", label: "Normal", icon: Flag },
  { value: "high", label: "High", icon: Flag },
];

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

  const projectOptions = [
    { value: "general", label: "General", icon: FolderKanban },
    ...projects.map((project) => ({
      value: project.id,
      label: project.name,
      icon: FolderKanban,
    })),
  ];

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;

    onAdd({
      title: trimmed,
      projectId: projectId === "general" ? null : projectId,
      priority,
      targetDate: targetDate || todayDate,
    });
    setTitle("");
  }

  return (
    <Panel className="border-white/10 bg-gradient-to-r from-[#050f24]/92 to-[#06142d]/92 p-3">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/55 px-3">
          <Plus className="h-4 w-4 shrink-0 text-cyan-200" />
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Add a task for today..."
            className="h-11 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px_150px_auto] xl:flex xl:items-center">
          <Select
            value={projectId}
            onChange={setProjectId}
            options={projectOptions}
            size="sm"
            className="min-w-0"
          />
          <Select
            value={priority}
            onChange={(value) => setPriority(value as WeeklyTaskPriority)}
            options={priorityOptions}
            size="sm"
          />
          <label className="flex h-8 items-center gap-2 rounded-xl border border-blue-300/20 bg-slate-950/60 px-2.5 text-xs font-medium text-white">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              type="date"
              value={targetDate}
              onChange={(event) => setTargetDate(event.target.value)}
              className="min-w-0 bg-transparent text-xs outline-none"
            />
          </label>
          <Button onClick={submit} disabled={isPending || !title.trim()} className="h-8 px-3 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </div>
    </Panel>
  );
}
