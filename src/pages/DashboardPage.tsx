import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Code2,
  Command,
  FileText,
  FolderKanban,
  ListChecks,
  RefreshCw,
  Search,
  Users,
  Zap,
} from "lucide-react";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AreaChart } from "../components/ui/AreaChart";
import { Badge } from "../components/ui/Badge";
import { BlockersPanel } from "../components/ui/BlockersPanel";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { PageHeader } from "../components/ui/PageHeader";
import { ProjectBreakdownPanel } from "../components/ui/ProjectBreakdownPanel";
import { RecentActivityItem } from "../components/ui/RecentActivityItem";
import { UpcomingWorkPanel } from "../components/ui/UpcomingWorkPanel";
import { WeekRangePicker } from "../components/ui/WeekRangePicker";
import { useSpeech } from "../components/ui/SpeechProvider";
import { useToast } from "../components/ui/ToastProvider";
import { getDashboardStats, getProjectBreakdown, getWeeklyActivityHours } from "../lib/api/dashboard";
import { listActivity } from "../lib/api/activity";
import { syncCommits } from "../lib/api/gitSync";
import { listProjects } from "../lib/api/projects";
import { listWeeklyTasks } from "../lib/api/weeklyTasks";
import { getSettings } from "../lib/api/settings";
import { syncAnnouncement, syncStartedAnnouncement } from "../lib/announcements";
import { currentWeekRange, shiftWeek } from "../lib/dates";

type StatTone = "blue" | "purple" | "cyan" | "violet";

const statToneClasses: Record<
  StatTone,
  { icon: string; border: string }
> = {
  blue: {
    icon: "border-blue-500/18 bg-blue-500/10 text-blue-600",
    border: "hover:border-blue-500/28",
  },
  purple: {
    icon: "border-violet-500/18 bg-violet-500/10 text-violet-600",
    border: "hover:border-violet-500/28",
  },
  cyan: {
    icon: "border-cyan-500/18 bg-cyan-500/10 text-cyan-600",
    border: "hover:border-cyan-500/28",
  },
  violet: {
    icon: "border-fuchsia-500/18 bg-fuchsia-500/10 text-fuchsia-600",
    border: "hover:border-fuchsia-500/28",
  },
};

function DashboardStatCard({
  icon: Icon,
  label,
  value,
  delta,
  deltaLabel,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  delta: number;
  deltaLabel: string;
  tone: StatTone;
}) {
  const toneClasses = statToneClasses[tone];
  const isPositive = delta >= 0;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-[var(--wt-border)] bg-[var(--wt-surface)] p-5 shadow-[var(--wt-panel-shadow)] transition-[border-color,background-color,box-shadow] duration-150 ${toneClasses.border}`}
    >
      <div className="relative flex items-center gap-4">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border ${toneClasses.icon}`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--wt-text-strong)]">{label}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-[var(--wt-text-strong)] tabular-nums">
            {value}
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-[var(--wt-text-muted)] tabular-nums">
            <span className={isPositive ? "text-[var(--wt-success)]" : "text-[var(--wt-danger)]"}>
              {isPositive ? "+" : "-"}{Math.abs(delta)}
            </span>
            {deltaLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

function DashboardSectionHeader({
  icon: Icon,
  title,
  subtitle,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="wt-icon-chip flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-[var(--wt-text-strong)]">{title}</h2>
          {subtitle ? <p className="mt-1 text-xs text-[var(--wt-text-muted)]">{subtitle}</p> : null}
        </div>
      </div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--wt-accent-text)] transition hover:bg-[var(--wt-accent-soft)]"
        >
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function DashboardPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const speech = useSpeech();
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
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

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
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
    queryKey: ["weeklyTasks", weekRange.from, weekRange.to],
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
    onMutate: () => {
      speech.announce(syncStartedAnnouncement("dashboard activity"), { category: "sync" });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-activity-hours"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-breakdown"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      queryClient.invalidateQueries({ queryKey: ["weeklyTasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(
        "Sync complete",
        `Scanned ${result.scannedProjects} projects. Added ${result.newCommits} commits and updated ${result.updatedCommits}.`,
      );
      speech.announce(syncAnnouncement(result), { category: "sync" });
    },
    onError: (error) => {
      toast.error("Sync failed", error instanceof Error ? error.message : "Repository sync could not be completed.");
    },
  });

  const activityItems = (activityQuery.data ?? []).flatMap((day) => day.items);
  const allTasks = tasksQuery.data ?? [];
  const filteredActivityItems = activityItems.filter((item) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      item.summary.toLowerCase().includes(query) ||
      item.projectName?.toLowerCase().includes(query) ||
      item.activityType.toLowerCase().includes(query)
    );
  });
  const filteredTasks = allTasks.filter((task) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      task.title.toLowerCase().includes(query) ||
      task.details?.toLowerCase().includes(query) ||
      task.projectName?.toLowerCase().includes(query) ||
      task.taskType.toLowerCase().includes(query)
    );
  });
  const recentItems = filteredActivityItems.slice(0, 5);
  const upcomingTasks = filteredTasks.filter(
    (t) => t.status === "todo" || t.status === "in_progress",
  );
  const blockers = filteredTasks.filter((t) => t.status === "blocked");
  const totalHours = (breakdownQuery.data ?? []).reduce((sum, p) => sum + p.hours, 0);
  const totalActivityHours =
    activityHoursQuery.data?.reduce((sum, day) => sum + day.hours, 0) ?? 0;
  const stats = statsQuery.data;
  const reportReadyItems =
    (stats?.commitsThisWeek ?? 0) +
    filteredActivityItems.filter((item) => item.activityType !== "commit").length +
    filteredTasks.filter((task) => task.includedInReport).length;
  const searchActive = searchQuery.trim().length > 0;

  const isLoading =
    statsQuery.isLoading ||
    projectsQuery.isLoading ||
    activityHoursQuery.isLoading ||
    breakdownQuery.isLoading ||
    activityQuery.isLoading ||
    tasksQuery.isLoading;

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        icon={BarChart3}
        eyebrow="Work intelligence"
        title="Dashboard"
        description="Scan weekly project activity, blockers, and report readiness."
        meta={
          <WeekRangePicker
            label={weekRange.label}
            onPrev={() => setAnchorDate(shiftWeek(anchorDate, -1))}
            onNext={() => setAnchorDate(shiftWeek(anchorDate, 1))}
          />
        }
        actions={
          <>
          <div className="wt-control flex min-h-10 min-w-[260px] max-w-md flex-1 items-center gap-2 rounded-2xl px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-[var(--wt-text-muted)]" />
            <input
              type="text"
              placeholder="Search projects, tasks, commits..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--wt-text-strong)] placeholder:text-[var(--wt-text-faint)] focus:outline-none"
            />
            <span className="hidden items-center gap-1 rounded-md border border-[var(--wt-border)] bg-[var(--wt-surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--wt-text-muted)] sm:inline-flex">
              <Command className="h-3 w-3" /> K
            </span>
          </div>
          <Button
            variant="primary"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="shadow-blue-500/30"
          >
            <RefreshCw
              className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`}
            />
            {syncMutation.isPending ? "Syncing..." : "Sync Now"}
          </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <DashboardStatCard
          icon={FolderKanban}
          label="Active Projects"
          value={
            isLoading
              ? "..."
              : (projectsQuery.data ?? []).filter((project) => project.status === "active").length
          }
          delta={stats?.projectsWorkedOn ?? 0}
          deltaLabel="worked this week"
          tone="blue"
        />
        <DashboardStatCard
          icon={Code2}
          label="Commits This Week"
          value={isLoading ? "..." : (stats?.commitsThisWeek ?? 0)}
          delta={stats?.commitsDeltaPercent ?? 0}
          deltaLabel="% vs last week"
          tone="purple"
        />
        <DashboardStatCard
          icon={Users}
          label="Meetings Logged"
          value={isLoading ? "..." : (stats?.meetingsLogged ?? 0)}
          delta={stats?.meetingsDelta ?? 0}
          deltaLabel="vs last week"
          tone="cyan"
        />
        <DashboardStatCard
          icon={FileText}
          label="Reports Generated"
          value={isLoading ? "..." : (stats?.reportsGenerated ?? 0)}
          delta={stats?.reportsDelta ?? 0}
          deltaLabel="vs last week"
          tone="violet"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <Panel className="relative overflow-hidden">
          <DashboardSectionHeader
            icon={Activity}
            title="Weekly Activity Overview"
            subtitle="Hours tracked across commits, manual logs, and planned work."
          />
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Badge tone="blue">{totalActivityHours.toFixed(1)}h total</Badge>
            <div className="wt-control rounded-xl px-3 py-1.5 text-xs font-semibold">
              Activity (hrs)
            </div>
          </div>
          {activityHoursQuery.isLoading ? (
            <div className="h-64 animate-pulse rounded-xl border border-[var(--wt-border)] bg-[var(--wt-surface-muted)]" />
          ) : (
            <AreaChart data={activityHoursQuery.data ?? []} height={270} />
          )}
        </Panel>

        <Panel className="relative overflow-hidden">
          <DashboardSectionHeader
            icon={Zap}
            title="Recent Activity"
            subtitle={searchActive ? "Filtered by your dashboard search." : "Latest synced commits and manual logs."}
            actionLabel="View all"
            onAction={() => navigate("/activity")}
          />
          {syncMutation.data ? (
            <div className="mb-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-[var(--wt-text-strong)]">
              Synced {syncMutation.data.scannedProjects} projects. Added{" "}
              {syncMutation.data.newCommits} commits and updated{" "}
              {syncMutation.data.updatedCommits}.
            </div>
          ) : null}
          {syncMutation.isError ? (
            <div className="mb-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-[var(--wt-text-strong)]">
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
              <div className="rounded-xl border border-dashed border-[var(--wt-border-strong)] bg-[var(--wt-surface-muted)] p-4 text-xs leading-5 text-[var(--wt-text-muted)]">
                {searchQuery.trim()
                  ? "No matching activity for that search."
                  : "No activity yet. Sync repositories or add manual logs to see your week at a glance."}
              </div>
            )}
          </div>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
        <Panel className="relative overflow-hidden">
          <DashboardSectionHeader
            icon={FolderKanban}
            title="Project Breakdown"
            subtitle="Hours spent per active project this week."
            actionLabel="View all"
            onAction={() => navigate("/projects")}
          />
          {breakdownQuery.isLoading ? (
            <div className="h-40 animate-pulse rounded-xl border border-[var(--wt-border)] bg-[var(--wt-surface-muted)]" />
          ) : (
            <ProjectBreakdownPanel
              breakdown={breakdownQuery.data ?? []}
              totalHours={totalHours}
            />
          )}
        </Panel>

        <Panel className="relative overflow-hidden">
          <DashboardSectionHeader
            icon={CalendarDays}
            title="Upcoming / Planned Work"
            subtitle={`${upcomingTasks.length} open item${upcomingTasks.length === 1 ? "" : "s"} ready to track.`}
            actionLabel="Plan week"
            onAction={() => navigate("/weekly-plan")}
          />
          {tasksQuery.isLoading ? (
            <div className="h-40 animate-pulse rounded-xl border border-[var(--wt-border)] bg-[var(--wt-surface-muted)]" />
          ) : (
            <UpcomingWorkPanel tasks={upcomingTasks.slice(0, 5)} />
          )}
        </Panel>

        <Panel className="relative overflow-hidden">
          <DashboardSectionHeader
            icon={AlertTriangle}
            title="Blockers / Pending Items"
            subtitle={`${blockers.length} blocker${blockers.length === 1 ? "" : "s"} need attention.`}
            actionLabel="Review"
            onAction={() => navigate("/weekly-plan")}
          />
          {tasksQuery.isLoading ? (
            <div className="h-40 animate-pulse rounded-xl border border-[var(--wt-border)] bg-[var(--wt-surface-muted)]" />
          ) : (
            <BlockersPanel tasks={filteredTasks} />
          )}
        </Panel>
      </div>

      <Panel className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="flex items-center gap-2 text-sm text-[var(--wt-text-muted)]">
          <ListChecks className="h-4 w-4 text-[var(--wt-accent-text)]" />
          <span>Report-ready items</span>
          <span className="font-semibold text-[var(--wt-text-strong)]">{reportReadyItems}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={() => navigate("/manual-log")}>
            Add manual log
          </Button>
          <Button variant="ghost" onClick={() => navigate("/weekly-plan")}>
            Add weekly task
          </Button>
          <Button variant="primary" onClick={() => navigate("/reports")}>
            Generate report
          </Button>
        </div>
      </Panel>
    </div>
  );
}
