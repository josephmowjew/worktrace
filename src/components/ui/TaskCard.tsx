import { CalendarDays, Check, Clock3, Edit3, GripVertical, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { WeeklyTask } from "../../types/weeklyTask";

function getPriorityColor(priority: string): string {
  switch (priority) {
    case "high":
      return "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300";
    case "normal":
      return "border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-300";
    case "low":
      return "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-300";
    default:
      return "border-[var(--wt-border)] bg-[var(--wt-surface-muted)] text-[var(--wt-text-muted)]";
  }
}

function getPriorityLabel(priority: string): string {
  switch (priority) {
    case "high":
      return "P High";
    case "normal":
      return "P Normal";
    case "low":
      return "P Low";
    default:
      return "P Normal";
  }
}

function getInitials(title: string): string {
  return title.charAt(0).toUpperCase();
}

export function TaskCard({
  task,
  onToggleComplete,
  onView,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  task: WeeklyTask;
  onToggleComplete: () => void;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
}) {
  const isCompleted = task.status === "completed";
  const isInProgress = task.status === "in_progress";
  const priorityColor = getPriorityColor(task.priority);
  const priorityLabel = getPriorityLabel(task.priority);
  const cardRef = useRef<HTMLDivElement>(null);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const originalRect = useRef<DOMRect | null>(null);
  const hasMoved = useRef(false);
  const suppressClick = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    hasMoved.current = false;
    originalRect.current = cardRef.current?.getBoundingClientRect() || null;
    setIsDragging(true);
    onDragStart(task.id);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        hasMoved.current = true;
      }

      if (cardRef.current && originalRect.current) {
        if (hasMoved.current && !placeholderRef.current) {
          const placeholder = document.createElement("div");
          placeholder.style.height = originalRect.current.height + "px";
          placeholder.style.minHeight = originalRect.current.height + "px";
          placeholder.style.marginBottom = "8px";
          placeholder.style.flexShrink = "0";
          cardRef.current.parentNode?.insertBefore(placeholder, cardRef.current);
          placeholderRef.current = placeholder;
        }

        if (hasMoved.current) {
          cardRef.current.style.position = "fixed";
          cardRef.current.style.left = originalRect.current.left + "px";
          cardRef.current.style.top = originalRect.current.top + "px";
          cardRef.current.style.width = originalRect.current.width + "px";
          cardRef.current.style.opacity = "0.85";
          cardRef.current.style.zIndex = "1000";
          cardRef.current.style.pointerEvents = "none";
          cardRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
          cardRef.current.style.transition = "none";
          cardRef.current.style.boxShadow = "0 20px 40px rgba(0,0,0,0.4)";
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      setIsDragging(false);
      if (cardRef.current) {
        cardRef.current.style.position = "";
        cardRef.current.style.left = "";
        cardRef.current.style.top = "";
        cardRef.current.style.width = "";
        cardRef.current.style.opacity = "";
        cardRef.current.style.zIndex = "";
        cardRef.current.style.pointerEvents = "";
        cardRef.current.style.transform = "";
        cardRef.current.style.transition = "";
        cardRef.current.style.boxShadow = "";
      }
      if (placeholderRef.current) {
        placeholderRef.current.remove();
        placeholderRef.current = null;
      }
      if (hasMoved.current) {
        suppressClick.current = true;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const column = el?.closest("[data-column-id]");
        if (column) {
          (column as HTMLElement).click();
        }
        onDragEnd();
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
      }
      hasMoved.current = false;
      originalRect.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (placeholderRef.current) {
        placeholderRef.current.remove();
        placeholderRef.current = null;
      }
    };
  }, [isDragging, onDragEnd]);

  return (
    <div
      ref={cardRef}
      onClick={(e) => {
        e.stopPropagation();
        if (!isDragging && !hasMoved.current && !suppressClick.current) {
          onView();
        }
      }}
      className={`group rounded-xl border border-[var(--wt-border)] bg-[var(--wt-surface)] p-3 shadow-[0_1px_2px_rgb(var(--wt-shadow)/0.06)] transition-colors hover:bg-[var(--wt-surface-muted)] ${
        isDragging ? "cursor-grabbing" : "cursor-pointer"
      }`}
      style={{ transition: isDragging ? "none" : "background-color 0.15s, border-color 0.15s, transform 0.15s" }}
    >
      <div className="flex items-start gap-2.5">
        <div
          onMouseDown={handleMouseDown}
          className="mt-0.5 cursor-grab text-[var(--wt-text-faint)] transition-colors hover:text-[var(--wt-text-muted)] active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleComplete();
          }}
          aria-label={isCompleted ? "Mark task as incomplete" : "Mark task as complete"}
          title={isCompleted ? "Mark as incomplete" : "Mark as complete"}
          className="mt-0.5 -m-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
        >
          <span
            className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
              isCompleted
                ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-400"
                : "border-[var(--wt-border-strong)] bg-transparent text-transparent hover:border-[var(--wt-text-faint)]"
            }`}
          >
            <Check className="h-3 w-3" />
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={`text-xs font-medium leading-5 ${
              isCompleted ? "line-through text-[var(--wt-text-faint)]" : "text-[var(--wt-text-strong)]"
            }`}
          >
            {task.title}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${priorityColor}`}
            >
              {priorityLabel}
            </span>
            {task.projectName && (
              <span className="rounded-md bg-[var(--wt-surface-muted)] px-1.5 py-0.5 text-[10px] text-[var(--wt-text-muted)]">
                {task.projectName}
              </span>
            )}
            {task.targetDate ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--wt-surface-muted)] px-1.5 py-0.5 text-[10px] text-[var(--wt-text-muted)]">
                <CalendarDays className="h-3 w-3" />
                {task.targetDate.slice(5)}
              </span>
            ) : null}
            {task.estimatedMinutes ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] text-blue-600 dark:text-cyan-200">
                <Clock3 className="h-3 w-3" />
                {formatMinutes(task.estimatedMinutes)}
              </span>
            ) : null}
          </div>

          {isInProgress && task.progressPercent !== undefined && task.progressPercent !== null && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[10px] text-[var(--wt-text-muted)]">
                <span>Progress</span>
                <span>{task.progressPercent}%</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--wt-surface-muted)]">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${task.progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <div
            className="hidden h-6 w-6 items-center justify-center rounded-full bg-[var(--wt-surface-muted)] text-[10px] font-medium text-[var(--wt-text-muted)] 2xl:flex"
          >
            {getInitials(task.title)}
          </div>

          <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="rounded-lg p-1 text-[var(--wt-text-muted)] transition-colors hover:bg-[var(--wt-surface-hover)] hover:text-[var(--wt-text-strong)]"
              title="Edit"
            >
              <Edit3 className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="rounded-lg p-1 text-[var(--wt-text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-500"
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (!hours) return `${remaining}m`;
  if (!remaining) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}
