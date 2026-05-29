import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

export function WeekRangePicker({
  label,
  onPrev,
  onNext,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="wt-control flex min-h-10 items-center gap-2 rounded-xl px-3 py-2">
      <Calendar className="h-4 w-4 text-[var(--wt-accent-text)]" />
      <span className="text-sm font-medium text-[var(--wt-text-strong)]">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous week"
          onClick={onPrev}
          className="grid h-7 w-7 place-items-center rounded-lg text-[var(--wt-text-muted)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--wt-surface-hover)] hover:text-[var(--wt-text-strong)] active:scale-[0.96]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Next week"
          onClick={onNext}
          className="grid h-7 w-7 place-items-center rounded-lg text-[var(--wt-text-muted)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--wt-surface-hover)] hover:text-[var(--wt-text-strong)] active:scale-[0.96]"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
