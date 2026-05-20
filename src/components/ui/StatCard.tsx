import type { LucideIcon } from "lucide-react";
import { Panel } from "./Panel";

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "blue",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tone?: "blue" | "cyan" | "purple" | "green";
}) {
  const iconTone = {
    blue: "bg-blue-500/15 text-blue-200",
    cyan: "bg-cyan-500/15 text-cyan-200",
    purple: "bg-violet-500/15 text-violet-200",
    green: "bg-emerald-500/15 text-emerald-200",
  }[tone];

  return (
    <Panel className="flex items-center gap-3">
      <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${iconTone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold tracking-tight">{value}</p>
        <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>
      </div>
    </Panel>
  );
}
