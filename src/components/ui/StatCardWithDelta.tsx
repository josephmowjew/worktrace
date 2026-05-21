import { ArrowDown, ArrowUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Panel } from "./Panel";

export function StatCardWithDelta({
  icon: Icon,
  label,
  value,
  delta,
  deltaType = "count",
  tone = "blue",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  delta: number;
  deltaType?: "count" | "percent";
  tone?: "blue" | "cyan" | "purple" | "green" | "orange";
}) {
  const iconTone = {
    blue: "bg-blue-500/15 text-blue-200",
    cyan: "bg-cyan-500/15 text-cyan-200",
    purple: "bg-violet-500/15 text-violet-200",
    green: "bg-emerald-500/15 text-emerald-200",
    orange: "bg-orange-500/15 text-orange-200",
  }[tone];

  const isPositive = delta >= 0;
  const deltaLabel =
    deltaType === "percent"
      ? `${isPositive ? "+" : ""}${delta}%`
      : `${isPositive ? "+" : ""}${delta}`;

  return (
    <Panel className="flex items-center gap-3">
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${iconTone}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tracking-tight text-white">
          {value}
        </p>
        <div className="mt-0.5 flex items-center gap-1">
          {isPositive ? (
            <ArrowUp className="h-3 w-3 text-emerald-400" />
          ) : (
            <ArrowDown className="h-3 w-3 text-red-400" />
          )}
          <span
            className={`text-[10px] font-medium ${
              isPositive ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {deltaLabel} vs last week
          </span>
        </div>
      </div>
    </Panel>
  );
}
