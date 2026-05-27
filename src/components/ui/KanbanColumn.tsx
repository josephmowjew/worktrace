import { Plus } from "lucide-react";
import type { WeeklyTask } from "../../types/weeklyTask";
import { TaskCard } from "./TaskCard";

export function KanbanColumn({
  title,
  color,
  tasks,
  count,
  onAdd,
  onToggleComplete,
  onView,
  onEdit,
  onDelete,
  columnId,
  onDragOverColumn,
  onDrop,
  onDragStart,
  activeColumnId,
}: {
  title: string;
  color: string;
  tasks: WeeklyTask[];
  count: number;
  onAdd: () => void;
  onToggleComplete: (task: WeeklyTask) => void;
  onView: (task: WeeklyTask) => void;
  onEdit: (task: WeeklyTask) => void;
  onDelete: (task: WeeklyTask) => void;
  columnId: string;
  onDragOverColumn: (columnId: string | null) => void;
  onDrop: () => void;
  onDragStart: (taskId: string) => void;
  activeColumnId: string | null;
}) {
  const isDragOver = activeColumnId === columnId;

  return (
    <div
      data-column-id={columnId}
      className={`flex flex-col rounded-2xl border transition-colors ${
        isDragOver ? "border-blue-400/50 bg-blue-500/10" : "border-white/10 bg-slate-950/55"
      }`}
      onMouseEnter={() => onDragOverColumn(columnId)}
      onMouseLeave={() => onDragOverColumn(null)}
      onClick={onDrop}
    >
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${color}`} />
          <span className="text-sm font-semibold text-slate-200">{title}</span>
        </div>
        <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-medium text-slate-400">
          {count}
        </span>
      </div>

      <div className="flex min-h-[200px] flex-1 flex-col gap-2 overflow-y-auto p-3">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onToggleComplete={() => onToggleComplete(task)}
            onView={() => onView(task)}
            onEdit={() => onEdit(task)}
            onDelete={() => onDelete(task)}
            onDragStart={onDragStart}
            onDragEnd={onDrop}
          />
        ))}

        <button
          onClick={onAdd}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/10 py-2.5 text-xs text-slate-500 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-slate-300"
        >
          <Plus className="h-3.5 w-3.5" />
          Add item
        </button>
      </div>
    </div>
  );
}
