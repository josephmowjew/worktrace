import { CalendarDays, Code, Rocket, FlaskConical, Users, ChevronRight } from "lucide-react";
import type { KeyHighlight } from "../../types/activity";

interface KeyHighlightsProps {
  highlights: KeyHighlight[];
}

const iconMap: Record<string, React.ElementType> = {
  code: Code,
  rocket: Rocket,
  flask: FlaskConical,
  users: Users,
};

export function KeyHighlights({ highlights }: KeyHighlightsProps) {
  if (highlights.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
              <CalendarDays className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-semibold text-slate-100">Key Highlights</h3>
          </div>
        </div>
        <p className="text-xs text-slate-500">No highlights available for this period.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
            <CalendarDays className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold text-slate-100">Key Highlights</h3>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          {highlights.length} signals
        </span>
      </div>

      <div className="space-y-2">
        {highlights.map((highlight, index) => {
          const Icon = iconMap[highlight.icon] ?? Code;
          const isPositive = highlight.trend >= 0;

          return (
            <div
              key={index}
              className="flex items-center gap-3 rounded-xl border border-blue-100/8 bg-slate-950/36 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[background-color,border-color] duration-150 hover:border-blue-200/14 hover:bg-slate-950/48"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-100">{highlight.title}</p>
                <p className="mt-0.5 truncate text-[10px] text-slate-500">{highlight.description}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className={`text-xs font-semibold tabular-nums ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                  {isPositive ? "+" : ""}{highlight.trend.toFixed(0)}%
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
