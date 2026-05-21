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
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2">
      <Calendar className="h-4 w-4 text-slate-400" />
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onNext}
          className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
