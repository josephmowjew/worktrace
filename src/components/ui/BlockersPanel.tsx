import { AlertTriangle } from "lucide-react";
import type { WeeklyTask } from "../../types/weeklyTask";

function getPriorityBadge(priority: string): { label: string; color: string } {
  switch (priority) {
    case "high":
      return { label: "High", color: "border-red-500/20 bg-red-500/10 text-red-600" };
    case "normal":
      return { label: "Medium", color: "border-orange-500/20 bg-orange-500/10 text-orange-600" };
    case "low":
      return { label: "Low", color: "border-blue-500/20 bg-blue-500/10 text-blue-600" };
    default:
      return { label: "Medium", color: "border-orange-500/20 bg-orange-500/10 text-orange-600" };
  }
}

export function BlockersPanel({ tasks }: { tasks: WeeklyTask[] }) {
  const blockers = tasks.filter((t) => t.status === "blocked");

  if (blockers.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-[var(--wt-text-muted)]">
        No blockers - keep shipping!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {blockers.map((task) => {
        const { label, color } = getPriorityBadge(task.priority);

        return (
          <div
            key={task.id}
            className="flex items-start gap-3 rounded-xl border border-[var(--wt-border)] bg-[var(--wt-surface-muted)] p-3"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[var(--wt-text-strong)]">
                {task.title}
              </p>
              {task.projectName && (
                <p className="truncate text-[10px] text-[var(--wt-text-muted)]">
                  {task.projectName}
                </p>
              )}
            </div>

            <span
              className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-medium ${color}`}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
