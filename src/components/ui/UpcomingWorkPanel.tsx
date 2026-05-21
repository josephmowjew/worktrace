import { Calendar } from "lucide-react";
import type { WeeklyTask } from "../../types/weeklyTask";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getDayLabel(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

function getStatusColor(status: string): string {
  switch (status) {
    case "todo":
      return "bg-slate-400";
    case "in_progress":
      return "bg-blue-400";
    case "blocked":
      return "bg-orange-400";
    case "completed":
      return "bg-emerald-400";
    default:
      return "bg-slate-400";
  }
}

export function UpcomingWorkPanel({ tasks }: { tasks: WeeklyTask[] }) {
  if (tasks.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-slate-500">
        No upcoming work planned
      </div>
    );
  }

  const groupedByDate = tasks.reduce<Record<string, WeeklyTask[]>>((acc, task) => {
    const date = task.targetDate || task.weekStartDate;
    if (!acc[date]) acc[date] = [];
    acc[date].push(task);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedByDate).sort();

  return (
    <div className="space-y-3">
      {sortedDates.map((date) => (
        <div key={date} className="space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <Calendar className="h-3.5 w-3.5 text-slate-500" />
            <span className="font-medium text-slate-300">
              {getDayLabel(date)} {formatDate(date)}
            </span>
          </div>

          <div className="space-y-1.5">
            {groupedByDate[date].map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-2 rounded-lg border border-white/8 bg-slate-950/35 p-2"
              >
                <div
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${getStatusColor(task.status)}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-200">
                    {task.title}
                  </p>
                  {task.projectName && (
                    <p className="truncate text-[10px] text-slate-500">
                      {task.projectName}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
