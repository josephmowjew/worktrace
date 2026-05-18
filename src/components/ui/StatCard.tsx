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
    <Panel className="flex items-center gap-4">
      <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${iconTone}`}>
        <Icon className="h-7 w-7" />
      </div>
      <div>
        <p className="text-sm text-slate-300">{label}</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      </div>
    </Panel>
  );
}
