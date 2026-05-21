import { Code, Rocket, Users, Clock } from "lucide-react";
import type { WeekSummary } from "../../types/activity";

interface WeekSummaryProps {
  summary: WeekSummary;
}

export function WeekSummary({ summary }: WeekSummaryProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-200">This Week Summary</h3>

      <div className="grid grid-cols-2 gap-2">
        <StatCard
          icon={Code}
          label="Total Activities"
          value={summary.totalActivities.toString()}
          trend={summary.totalActivitiesTrend}
          color="blue"
        />
        <StatCard
          icon={Clock}
          label="Coding Time"
          value={formatMinutes(summary.codingTimeMinutes)}
          trend={summary.codingTimeTrend}
          color="cyan"
        />
        <StatCard
          icon={Users}
          label="Meetings"
          value={summary.meetingCount.toString()}
          trend={summary.meetingTrend}
          color="green"
        />
        <StatCard
          icon={Rocket}
          label="Deployments"
          value={summary.deploymentCount.toString()}
          trend={summary.deploymentTrend}
          color="teal"
        />
      </div>

      <div className="rounded-xl border border-white/8 bg-slate-950/45 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
              <Code className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs text-slate-400">Top Project</span>
          </div>
          <span className="text-xs font-semibold text-slate-200">{summary.topProject.name}</span>
        </div>
      </div>

      <div className="rounded-xl border border-white/8 bg-slate-950/45 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Focus Time</span>
          <span className="text-xs font-semibold text-slate-200">
            {formatMinutes(summary.focusTimeMinutes)} (56%)
          </span>
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  trend: number;
  color: string;
}

function StatCard({ icon: Icon, label, value, trend, color }: StatCardProps) {
  const colorClasses: Record<string, { bg: string; text: string; trendUp: string; trendDown: string }> = {
    blue: {
      bg: "bg-blue-500/10",
      text: "text-blue-300",
      trendUp: "text-emerald-400",
      trendDown: "text-red-400",
    },
    cyan: {
      bg: "bg-cyan-500/10",
      text: "text-cyan-300",
      trendUp: "text-emerald-400",
      trendDown: "text-red-400",
    },
    green: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-300",
      trendUp: "text-emerald-400",
      trendDown: "text-red-400",
    },
    teal: {
      bg: "bg-teal-500/10",
      text: "text-teal-300",
      trendUp: "text-emerald-400",
      trendDown: "text-red-400",
    },
  };

  const colors = colorClasses[color] ?? colorClasses.blue;
  const isPositive = trend >= 0;

  return (
    <div className="rounded-xl border border-white/8 bg-slate-950/45 p-3">
      <div className="flex items-center gap-2">
        <div className={`flex h-6 w-6 items-center justify-center rounded-lg ${colors.bg} ${colors.text}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[10px] text-slate-400">{label}</span>
      </div>
      <div className="mt-1.5">
        <span className="text-lg font-semibold text-slate-100">{value}</span>
      </div>
      <div className={`mt-0.5 text-[10px] ${isPositive ? colors.trendUp : colors.trendDown}`}>
        {isPositive ? "+" : ""}{trend.toFixed(0)}% vs last week
      </div>
    </div>
  );
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}
