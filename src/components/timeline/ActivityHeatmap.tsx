import { Boxes } from "lucide-react";
import type { HeatmapData } from "../../types/activity";

interface ActivityHeatmapProps {
  data: HeatmapData;
  weekLabel: string;
}

const timeLabels = [12, 6, 12, 6];
const timeSuffixes = ["AM", "AM", "PM", "PM"];
const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function ActivityHeatmap({ data, weekLabel }: ActivityHeatmapProps) {
  const cellMap = new Map<string, number>();
  for (const cell of data.cells) {
    cellMap.set(`${cell.day}-${cell.hour}`, cell.count);
  }

  const getColor = (count: number): string => {
    if (count === 0) return "bg-white/[0.02]";
    const intensity = data.maxCount > 0 ? count / data.maxCount : 0;
    if (intensity < 0.25) return "bg-blue-500/20";
    if (intensity < 0.5) return "bg-blue-500/40";
    if (intensity < 0.75) return "bg-blue-500/60";
    return "bg-blue-500";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-500/10 text-blue-300">
            <Boxes className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold text-slate-100">Activity Heatmap</h3>
        </div>
        <span className="text-xs text-slate-500">{weekLabel}</span>
      </div>

      <div className="space-y-1.5">
        <div className="flex gap-1">
          <div className="w-10" />
          {dayLabels.map((day) => (
            <div key={day} className="flex-1 text-center text-[10px] font-medium text-slate-500">
              {day}
            </div>
          ))}
        </div>

        {timeLabels.map((time, timeIndex) => (
          <div key={timeIndex} className="flex gap-1">
            <div className="w-10 text-right text-[10px] tabular-nums text-slate-500">
              {time} {timeSuffixes[timeIndex]}
            </div>
            {dayLabels.map((_, dayIndex) => {
              const day = dayIndex + 1;
              const hourStart = timeIndex * 6;
              let totalCount = 0;
              for (let h = hourStart; h < hourStart + 6 && h < 24; h++) {
                totalCount += cellMap.get(`${day}-${h}`) ?? 0;
              }
              return (
                <div
                  key={dayIndex}
                  className={`flex-1 rounded-md ${getColor(totalCount)} shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors duration-150`}
                  style={{ minHeight: "16px" }}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-1.5">
        <span className="text-[10px] text-slate-500">Less</span>
        <div className="flex gap-0.5">
          <div className="h-3 w-3 rounded-md bg-white/[0.02]" />
          <div className="h-3 w-3 rounded-md bg-blue-500/20" />
          <div className="h-3 w-3 rounded-md bg-blue-500/40" />
          <div className="h-3 w-3 rounded-md bg-blue-500/60" />
          <div className="h-3 w-3 rounded-md bg-blue-500" />
        </div>
        <span className="text-[10px] text-slate-500">More</span>
      </div>
    </div>
  );
}
