import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ClipboardList,
  FolderKanban,
  GitCommit,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { AreaChart } from "../components/ui/AreaChart";
import { Badge } from "../components/ui/Badge";
import { BlockersPanel } from "../components/ui/BlockersPanel";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { ProjectBreakdownPanel } from "../components/ui/ProjectBreakdownPanel";
import { RecentActivityItem } from "../components/ui/RecentActivityItem";
import { StatCardWithDelta } from "../components/ui/StatCardWithDelta";
import { UpcomingWorkPanel } from "../components/ui/UpcomingWorkPanel";
import { WeekRangePicker } from "../components/ui/WeekRangePicker";
import { getDashboardStats, getProjectBreakdown, getWeeklyActivityHours } from "../lib/api/dashboard";
import { listActivity } from "../lib/api/activity";
import { syncCommits } from "../lib/api/gitSync";
import { listWeeklyTasks } from "../lib/api/weeklyTasks";
import { getSettings } from "../lib/api/settings";
import { currentWeekRange, shiftWeek } from "../lib/dates";

export function DashboardPage() {
  const queryClient = useQueryClient();
  const [anchorDate, setAnchorDate] = useState(new Date());
  const weekRange = currentWeekRange(anchorDate);

  const statsQuery = useQuery({
    queryKey: ["dashboard-stats", weekRange.from, weekRange.to],
    queryFn: getDashboardStats,
  });

  const activityHoursQuery = useQuery({
    queryKey: ["dashboard-activity-hours", weekRange.from, weekRange.to],
    queryFn: getWeeklyActivityHours,
  });

  const breakdownQuery = useQuery({
    queryKey: ["dashboard-breakdown", weekRange.from, weekRange.to],
    queryFn: getProjectBreakdown,
  });

  const activityQuery = useQuery({
    queryKey: ["activity", weekRange.from, weekRange.to],
    queryFn: () =>
      listActivity({
        from: weekRange.from,
        to: weekRange.to,
      }),
  });

  const tasksQuery = useQuery({
    queryKey: ["weekly-tasks", weekRange.from, weekRange.to],
    queryFn: () =>
      listWeeklyTasks({
        weekStartDate: weekRange.from,
        weekEndDate: weekRange.to,
      }),
  });

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      syncCommits({
        from: null,
        to: null,
        authorEmail: settingsQuery.data?.gitAuthorEmail || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      queryClient.invalidateQueries({ queryKey: ["weekly-tasks"] });
    },
  });

  const activityItems = (activityQuery.data ?? []).flatMap((day) => day.items);
  const recentItems = activityItems.slice(0, 5);
  const allTasks = tasksQuery.data ?? [];
  const upcomingTasks = allTasks.filter(
    (t) => t.status === "todo" || t.status === "in_progress"
  );
  const totalHours = (breakdownQuery.data ?? []).reduce((sum, p) => sum + p.hours, 0);

  const stats = statsQuery.data;
  const isLoading =
    statsQuery.isLoading ||
    activityHoursQuery.isLoading ||
    breakdownQuery.isLoading ||
    activityQuery.isLoading ||
    tasksQuery.isLoading;

  return (
    <div className="space-y-4">
      <Panel className="relative overflow-hidden p-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_25%,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_78%_8%,rgba(20,184,166,0.14),transparent_24%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
                <Sparkles className="h-3.5 w-3.5" />
                Weekly work command center
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Dashboard</h1>
            </div>
            <WeekRangePicker
              label={weekRange.label}
              onPrev={() => setAnchorDate(shiftWeek(anchorDate, -1))}
              onNext={() => setAnchorDate(shiftWeek(anchorDate, 1))}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                className="bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
              />
            </div>
            <Button
              variant="primary"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              <RefreshCw
                className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`}
              />
              {syncMutation.isPending ? "Syncing..." : "Sync"}
            </Button>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCardWithDelta
          icon={FolderKanban}
          label="Projects Worked On"
          value={isLoading ? "..." : (stats?.projectsWorkedOn ?? 0)}
          delta={stats?.projectsDelta ?? 0}
          deltaType="count"
          tone="blue"
        />
        <StatCardWithDelta
          icon={GitCommit}
          label="Commits This Week"
          value={isLoading ? "..." : (stats?.commitsThisWeek ?? 0)}
          delta={stats?.commitsDeltaPercent ?? 0}
          deltaType="percent"
          tone="purple"
        />
        <StatCardWithDelta
          icon={ClipboardList}
          label="Meetings Logged"
          value={isLoading ? "..." : (stats?.meetingsLogged ?? 0)}
          delta={stats?.meetingsDelta ?? 0}
          deltaType="count"
          tone="cyan"
        />
        <StatCardWithDelta
          icon={BarChart3}
          label="Reports Generated"
          value={isLoading ? "..." : (stats?.reportsGenerated ?? 0)}
          delta={stats?.reportsDelta ?? 0}
          deltaType="count"
          tone="green"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">
                Weekly Activity Overview
              </h2>
              <p className="text-xs text-slate-400">
                Hours tracked across commits and manual logs.
              </p>
            </div>
            <Badge tone="blue">
              {activityHoursQuery.data?.reduce((s, d) => s + d.hours, 0).toFixed(1)}h total
            </Badge>
          </div>
          {activityHoursQuery.isLoading ? (
            <div className="h-52 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]" />
          ) : (
            <AreaChart data={activityHoursQuery.data ?? []} height={240} />
          )}
        </Panel>

        <Panel>
          <h2 className="mb-3 text-base font-semibold text-white">Recent Activity</h2>
          {syncMutation.data ? (
            <div className="mb-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-100">
              Synced {syncMutation.data.scannedProjects} projects. Added{" "}
              {syncMutation.data.newCommits} commits and updated{" "}
              {syncMutation.data.updatedCommits}.
            </div>
          ) : null}
          {syncMutation.isError ? (
            <div className="mb-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
              {syncMutation.error instanceof Error
                ? syncMutation.error.message
                : "Sync failed."}
            </div>
          ) : null}
          <div className="grid gap-2">
            {recentItems.length > 0 ? (
              recentItems.map((item) => (
                <RecentActivityItem key={item.id} item={item} />
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-white/8 bg-white/[0.02] p-4 text-xs leading-5 text-slate-400">
                No activity yet. Sync repositories or add manual logs to see your week at a
                glance.
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">
                Project Breakdown
              </h2>
              <p className="text-xs text-slate-400">
                Hours spent per project this week.
              </p>
            </div>
          </div>
          {breakdownQuery.isLoading ? (
            <div className="h-40 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]" />
          ) : (
            <ProjectBreakdownPanel
              breakdown={breakdownQuery.data ?? []}
              totalHours={totalHours}
            />
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel>
            <h2 className="mb-3 text-base font-semibold text-white">
              Upcoming / Planned Work
            </h2>
            {tasksQuery.isLoading ? (
              <div className="h-32 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]" />
            ) : (
              <UpcomingWorkPanel tasks={upcomingTasks} />
            )}
          </Panel>

          <Panel>
            <h2 className="mb-3 text-base font-semibold text-white">
              Blockers / Pending Items
            </h2>
            {tasksQuery.isLoading ? (
              <div className="h-32 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]" />
            ) : (
              <BlockersPanel tasks={allTasks} />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
