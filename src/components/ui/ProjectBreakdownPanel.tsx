import { Code2, Globe, Package, PenTool, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ProjectBreakdown as ProjectBreakdownType } from "../../types/dashboard";

function formatHours(hours: number): string {
  if (hours === 0) return "0m";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function getProjectIcon(projectName: string): LucideIcon {
  const name = projectName.toLowerCase();
  if (name.includes("api") || name.includes("backend") || name.includes("service")) return Code2;
  if (name.includes("web") || name.includes("frontend") || name.includes("app")) return Globe;
  if (name.includes("tool") || name.includes("util")) return Wrench;
  if (name.includes("market") || name.includes("site")) return PenTool;
  return Package;
}

function getProjectColor(projectName: string): string {
  const name = projectName.toLowerCase();
  if (name.includes("api") || name.includes("backend")) return "bg-violet-500";
  if (name.includes("web") || name.includes("frontend")) return "bg-blue-500";
  if (name.includes("tool")) return "bg-cyan-500";
  if (name.includes("market") || name.includes("site")) return "bg-pink-500";
  return "bg-blue-500";
}

export function ProjectBreakdownPanel({
  breakdown,
  totalHours,
}: {
  breakdown: ProjectBreakdownType[];
  totalHours: number;
}) {
  if (breakdown.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-slate-500">
        No project activity this week
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {breakdown.map((item) => {
        const Icon = getProjectIcon(item.projectName);
        const colorClass = getProjectColor(item.projectName);

        return (
          <div key={item.projectId} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`flex h-5 w-5 items-center justify-center rounded ${colorClass} bg-opacity-20`}>
                  <Icon className="h-3 w-3 text-white" />
                </div>
                <span className="text-xs font-medium text-slate-200">
                  {item.projectName}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">
                  {item.percentage}%
                </span>
                <span className="text-[10px] text-slate-500">
                  {formatHours(item.hours)}
                </span>
              </div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full ${colorClass} transition-all duration-500`}
                style={{ width: `${item.percentage}%` }}
              />
            </div>
          </div>
        );
      })}

      <div className="border-t border-white/8 pt-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300">Total</span>
          <span className="font-semibold text-white">{formatHours(totalHours)}</span>
        </div>
      </div>
    </div>
  );
}
