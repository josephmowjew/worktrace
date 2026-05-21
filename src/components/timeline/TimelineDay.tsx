import type { ActivityDay } from "../../types/activity";
import { TimelineItem } from "./TimelineItem";

interface TimelineDayProps {
  day: ActivityDay;
}

export function TimelineDay({ day }: TimelineDayProps) {
  const dateLabel = formatDayLabel(day.date);
  const activityCount = day.items.length;

  return (
    <section className="relative">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">{dateLabel}</span>
          <span className="text-xs text-slate-500">{activityCount} activities</span>
        </div>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <div className="relative ml-6 pl-4">
        <div className="absolute left-0 top-2 bottom-2 w-px bg-white/10" />

        <div className="space-y-3">
          {day.items.map((item) => (
            <div key={item.id} className="relative">
              <div className="absolute -left-4 top-5 h-3 w-3 -translate-x-1/2 rounded-full bg-blue-500 ring-4 ring-slate-950" />
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
