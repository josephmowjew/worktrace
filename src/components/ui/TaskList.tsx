import { AlertCircle, CheckCircle2, Clock, ListTodo } from "lucide-react";
import type { WeeklyTask } from "../../types/weeklyTask";
import { Badge } from "./Badge";
import { Panel } from "./Panel";

const statusIcons: Record<string, typeof ListTodo> = {
  todo: ListTodo,
  in_progress: Clock,
  blocked: AlertCircle,
  completed: CheckCircle2,
  dropped: ListTodo,
};

const statusColors: Record<string, "slate" | "blue" | "orange" | "green"> = {
  todo: "slate",
  in_progress: "blue",
  blocked: "orange",
  completed: "green",
  dropped: "slate",
};

const priorityColors: Record<string, "slate" | "blue" | "orange"> = {
  low: "slate",
  normal: "blue",
  high: "orange",
};

export function TaskList({
  tasks,
  isLoading,
}: {
  tasks: WeeklyTask[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Panel>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      </Panel>
    );
  }

  if (tasks.length === 0) {
    return (
      <Panel>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-300/20 bg-blue-500/10 text-blue-200">
            <ListTodo className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-slate-200">No tasks this week</p>
          <p className="mt-1 text-xs text-slate-500">Tasks for this project will appear here.</p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="p-0">
      <div className="divide-y divide-white/8">
        {tasks.map((task) => {
          const StatusIcon = statusIcons[task.status] || ListTodo;
          return (
            <div key={task.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/5">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${getStatusBorder(task.status)} ${getStatusBg(task.status)} ${getStatusText(task.status)}`}>
                <StatusIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-slate-100">{task.title}</p>
                  <Badge tone={statusColors[task.status] || "slate"}>{task.status.replace("_", " ")}</Badge>
                  <Badge tone={priorityColors[task.priority] || "slate"}>{task.priority}</Badge>
                </div>
                {task.details && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{task.details}</p>
                )}
                <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                  {task.targetDate && <span>Due: {formatDate(task.targetDate)}</span>}
                  {task.progressPercent !== undefined && task.progressPercent !== null && (
                    <span>{task.progressPercent}% complete</span>
                  )}
                </div>
                {task.progressPercent !== undefined && task.progressPercent !== null && (
                  <div className="mt-2 h-1.5 w-full rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${task.progressPercent}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function getStatusBorder(status: string): string {
  switch (status) {
    case "todo": return "border-slate-300/20";
    case "in_progress": return "border-blue-300/20";
    case "blocked": return "border-orange-300/20";
    case "completed": return "border-emerald-300/20";
    default: return "border-white/10";
  }
}

function getStatusBg(status: string): string {
  switch (status) {
    case "todo": return "bg-slate-500/10";
    case "in_progress": return "bg-blue-500/10";
    case "blocked": return "bg-orange-500/10";
    case "completed": return "bg-emerald-500/10";
    default: return "bg-white/5";
  }
}

function getStatusText(status: string): string {
  switch (status) {
    case "todo": return "text-slate-300";
    case "in_progress": return "text-blue-200";
    case "blocked": return "text-orange-200";
    case "completed": return "text-emerald-200";
    default: return "text-slate-400";
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
