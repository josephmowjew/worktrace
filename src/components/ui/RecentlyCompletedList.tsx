import { CheckCircle2 } from "lucide-react";

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 60) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function RecentlyCompletedList({
  tasks,
}: {
  tasks: { id: string; title: string; completedAt: string }[];
}) {
  if (tasks.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center text-xs text-slate-500">
        No completed items yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.slice(0, 5).map((task) => (
        <div key={task.id} className="flex items-center gap-2 text-xs">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
          <span className="truncate text-slate-300">{task.title}</span>
          <span className="ml-auto shrink-0 text-slate-500">
            {formatTimeAgo(task.completedAt)}
          </span>
        </div>
      ))}
    </div>
  );
}
