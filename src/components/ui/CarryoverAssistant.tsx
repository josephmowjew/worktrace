import { CheckCircle2, ClipboardCheck, FileText, Forward, Trash2 } from "lucide-react";
import type { WeeklyTask } from "../../types/weeklyTask";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Panel } from "./Panel";

type CarryoverAssistantProps = {
  tasks: WeeklyTask[];
  isUpdating?: boolean;
  onCarry: (task: WeeklyTask) => void;
  onDrop: (task: WeeklyTask) => void;
  onDone: (task: WeeklyTask) => void;
  onInclude: (task: WeeklyTask) => void;
};

export function CarryoverAssistant({
  tasks,
  isUpdating = false,
  onCarry,
  onDrop,
  onDone,
  onInclude,
}: CarryoverAssistantProps) {
  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-cyan-200" />
          <h2 className="text-sm font-semibold text-white">Carryover Assistant</h2>
        </div>
        <Badge tone={tasks.length > 0 ? "orange" : "slate"}>{tasks.length} open</Badge>
      </div>

      <div className="space-y-2">
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <div key={task.id} className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-100">{task.title}</p>
                    <Badge tone={task.status === "blocked" ? "orange" : "blue"}>{task.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {task.projectName ?? "General"} / week of {task.weekStartDate}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button disabled={isUpdating} variant="ghost" onClick={() => onCarry(task)} className="h-8 px-2 text-xs">
                    <Forward className="h-3.5 w-3.5" />
                    Carry
                  </Button>
                  <Button disabled={isUpdating} variant="ghost" onClick={() => onDone(task)} className="h-8 px-2 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Done
                  </Button>
                  <Button disabled={isUpdating || task.includedInReport} variant="ghost" onClick={() => onInclude(task)} className="h-8 px-2 text-xs">
                    <FileText className="h-3.5 w-3.5" />
                    Report
                  </Button>
                  <Button disabled={isUpdating} variant="ghost" onClick={() => onDrop(task)} className="h-8 px-2 text-xs">
                    <Trash2 className="h-3.5 w-3.5" />
                    Drop
                  </Button>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs leading-5 text-slate-400">
            No unfinished work is waiting from previous weeks.
          </div>
        )}
      </div>
    </Panel>
  );
}
