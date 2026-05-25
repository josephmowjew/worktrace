import type { ActivityDay } from "../../types/activity";
import { TimelineItem } from "./TimelineItem";
import { CalendarDays } from "lucide-react";

interface TimelineDayProps {
  day: ActivityDay;
}

export function TimelineDay({ day }: TimelineDayProps) {
  const dateLabel = formatDayLabel(day.date);
  const activityCount = day.items.length;

  return (
    <section className="relative">
      <div className="mb-5 flex items-center gap-4">
        <div className="h-px flex-1 bg-blue-200/10" />
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-blue-300/20 bg-blue-500/10 text-blue-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <CalendarDays className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-semibold text-slate-100">{dateLabel}</span>
          <span className="text-xs tabular-nums text-slate-500">{activityCount} activities</span>
        </div>
        <div className="h-px flex-1 bg-blue-200/10" />
      </div>

      <div className="relative pl-[104px] max-sm:pl-0">
        <div className="pointer-events-none absolute bottom-0 left-8 top-2 z-0 w-px bg-gradient-to-b from-blue-300/35 via-blue-300/20 to-transparent max-sm:hidden" />

        <div className="space-y-3">
          {day.items.map((item) => (
            <div key={item.id} className="relative">
              <div className="pointer-events-none absolute -left-[72px] top-9 z-20 h-4 w-4 -translate-x-1/2 rounded-full border border-blue-100/40 bg-blue-500 shadow-[0_0_0_6px_rgba(15,23,42,0.92),0_0_26px_rgba(59,130,246,0.42)] max-sm:hidden" />
              <TimelineItem item={item} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function formatDayLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}
