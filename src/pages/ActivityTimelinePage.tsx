import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Code,
  Eye,
  FlaskConical,
  RefreshCw,
  Rocket,
  Search,
  Users,
  FolderOpen,
  LayoutGrid,
  ListChecks,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { useSpeech } from "../components/ui/SpeechProvider";
import { useToast } from "../components/ui/ToastProvider";
import { ActivityHeatmap } from "../components/timeline/ActivityHeatmap";
import { WeekSummary } from "../components/timeline/WeekSummary";
import { KeyHighlights } from "../components/timeline/KeyHighlights";
import { TimelineItem } from "../components/timeline/TimelineItem";
import { TaskDetailModal } from "../components/ui/TaskDetailModal";
import { Badge } from "../components/ui/Badge";
import { listActivity, getActivityHeatmap, getWeekSummary, getKeyHighlights } from "../lib/api/activity";
import { syncCommits } from "../lib/api/gitSync";
import { listProjects } from "../lib/api/projects";
import { listWeeklyTasks } from "../lib/api/weeklyTasks";
import { syncAnnouncement, syncStartedAnnouncement } from "../lib/announcements";
import { currentWeekRange, shiftWeek } from "../lib/dates";
import type { ActivityItem } from "../types/activity";
import type { WeeklyTask } from "../types/weeklyTask";

const activityFilters = [
  { label: "All", value: "all", icon: BarChart3 },
  { label: "Commits", value: "commit", icon: Code },
  { label: "Meetings", value: "Meeting", icon: Users },
  { label: "Reviews", value: "Code Review", icon: Eye },
  { label: "Testing", value: "Testing", icon: FlaskConical },
  { label: "Deployments", value: "Deployment", icon: Rocket },
];

export function ActivityTimelinePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const speech = useSpeech();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activityType, setActivityType] = useState("all");
  const [projectId, setProjectId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewingTask, setViewingTask] = useState<WeeklyTask | null>(null);

  const weekRange = useMemo(() => currentWeekRange(currentDate), [currentDate]);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });
  const activeProjects = (projectsQuery.data ?? []).filter(
    (project) => project.status === "active",
  );

  const projectIds = projectId === "all" ? null : [projectId];

  const activityQuery = useQuery({
    queryKey: ["activity", weekRange.from, weekRange.to, activityType, projectId],
    queryFn: () =>
      listActivity({
        from: weekRange.from,
        to: weekRange.to,
        activityType: activityType === "all" ? null : activityType,
        projectIds,
      }),
  });

  const tasksQuery = useQuery({
    queryKey: ["weeklyTasks", "activityTimeline", weekRange.from, weekRange.to, projectId],
    queryFn: () =>
      listWeeklyTasks({
        weekStartDate: weekRange.from,
        weekEndDate: weekRange.to,
        projectIds,
      }),
  });

  const heatmapQuery = useQuery({
    queryKey: ["heatmap", weekRange.from, weekRange.to, projectId],
    queryFn: () =>
      getActivityHeatmap({
        from: weekRange.from,
        to: weekRange.to,
        projectIds,
      }),
  });

  const summaryQuery = useQuery({
    queryKey: ["weekSummary", weekRange.from, weekRange.to, projectId],
    queryFn: () =>
      getWeekSummary({
        from: weekRange.from,
        to: weekRange.to,
        projectIds,
      }),
  });

  const highlightsQuery = useQuery({
    queryKey: ["keyHighlights", weekRange.from, weekRange.to, projectId],
    queryFn: () =>
      getKeyHighlights({
        from: weekRange.from,
        to: weekRange.to,
        projectIds,
      }),
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      syncCommits({
        from: null,
        to: null,
        authorEmail: null,
        projectIds,
      }),
    onMutate: () => {
      speech.announce(syncStartedAnnouncement("activity timeline"), { category: "sync" });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      queryClient.invalidateQueries({ queryKey: ["heatmap"] });
      queryClient.invalidateQueries({ queryKey: ["weekSummary"] });
      queryClient.invalidateQueries({ queryKey: ["keyHighlights"] });
      toast.success(
        "Sync complete",
        `Added ${result.newCommits} commits and updated ${result.updatedCommits}.`,
      );
      speech.announce(syncAnnouncement(result), { category: "sync" });
      if (result.errors.length) {
        toast.error("Some repositories did not sync", result.errors.join(" "));
      }
    },
    onError: (error) => {
      toast.error("Sync failed", error instanceof Error ? error.message : "Repository sync could not be completed.");
    },
  });

  const filteredDays = useMemo(() => {
    let days = combineTimelineDays(activityQuery.data ?? [], activityType === "all" ? tasksQuery.data ?? [] : []);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      days = days
        .map((day) => ({
          ...day,
          items: day.items.filter(
            (entry) =>
              entryMatchesSearch(entry, query)
          ),
        }))
        .filter((day) => day.items.length > 0);
    }

    return days;
  }, [activityQuery.data, activityType, searchQuery, tasksQuery.data]);

  const handlePrevWeek = () => setCurrentDate((d) => shiftWeek(d, -1));
  const handleNextWeek = () => setCurrentDate((d) => shiftWeek(d, 1));

  return (
    <div className="-m-2 min-h-full space-y-4 rounded-[28px] bg-[radial-gradient(circle_at_8%_0%,rgba(59,130,246,0.18),transparent_26%),radial-gradient(circle_at_76%_10%,rgba(14,165,233,0.12),transparent_24%),linear-gradient(180deg,rgba(2,6,23,0.72),rgba(2,6,23,0.22))] p-2">
      <Panel className="relative overflow-hidden rounded-[18px] border-blue-200/10 bg-slate-950/45 p-0 shadow-[0_24px_80px_rgba(2,6,23,0.42),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(37,99,235,0.14),transparent_34%),radial-gradient(circle_at_88%_16%,rgba(45,212,191,0.1),transparent_24%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-5 px-6 py-5">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-blue-200/20 bg-blue-500 shadow-[0_14px_32px_rgba(37,99,235,0.36),inset_0_1px_0_rgba(255,255,255,0.32)]">
              <BarChart3 className="h-7 w-7 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-white [text-wrap:balance]">
                Activity Timeline
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300 [text-wrap:pretty]">
                Track commits, meetings, reviews, testing, and deployments across your projects.
              </p>
            </div>
          </div>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
            <div className="flex h-12 items-center rounded-xl border border-blue-200/10 bg-slate-950/42 px-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <button
                onClick={handlePrevWeek}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-[background-color,color,transform] duration-150 hover:bg-white/10 hover:text-slate-200 active:scale-[0.96]"
                aria-label="Previous week"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex min-w-[168px] items-center justify-center gap-2 px-2">
                <CalendarDays className="h-4 w-4 text-blue-300" />
                <span className="text-sm font-medium text-slate-200">{weekRange.label}</span>
              </div>
              <button
                onClick={handleNextWeek}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 transition-[background-color,color,transform] duration-150 hover:bg-white/10 hover:text-slate-200 active:scale-[0.96]"
                aria-label="Next week"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="relative min-w-[260px] flex-1 sm:max-w-[420px]">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search projects, tasks, commits..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-12 w-full rounded-xl border border-blue-200/10 bg-slate-950/45 pl-11 pr-14 text-sm text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-slate-500 focus:border-blue-300/45 focus:bg-slate-950/60 focus:ring-2 focus:ring-blue-500/15"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-white/8 bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-500 sm:block">
                Cmd K
              </span>
            </div>

            <Button
              variant="primary"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="h-12 rounded-xl px-5 shadow-[0_16px_34px_rgba(37,99,235,0.32)] transition-[background-color,box-shadow,transform] active:scale-[0.96]"
            >
              <RefreshCw
                className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`}
              />
              {syncMutation.isPending ? "Syncing..." : "Sync Repositories"}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel className="rounded-[18px] border-blue-200/10 bg-slate-950/38 p-3 shadow-[0_16px_52px_rgba(2,6,23,0.28),inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {activityFilters.map((filter) => {
              const Icon = filter.icon;
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setActivityType(filter.value)}
                  className={[
                    "inline-flex min-h-10 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:scale-[0.96]",
                    activityType === filter.value
                      ? "border-blue-300/30 bg-blue-500 text-white shadow-[0_12px_28px_rgba(37,99,235,0.28),inset_0_1px_0_rgba(255,255,255,0.18)]"
                      : "border-white/10 bg-slate-950/35 text-slate-400 hover:border-blue-200/18 hover:bg-white/8 hover:text-slate-200",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4 shrink-0 stroke-[2.25]" />
                  {filter.label}
                </button>
              );
            })}
          </div>

          <Select
            value={projectId}
            onChange={setProjectId}
            options={[
              { value: "all", label: "All Projects", icon: LayoutGrid },
              ...activeProjects.map((project) => ({
                value: project.id,
                label: project.name,
                icon: FolderOpen,
              })),
            ]}
            size="sm"
          />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          {syncMutation.data ? (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-100">
              Synced {syncMutation.data.scannedProjects} projects. Added{" "}
              {syncMutation.data.newCommits} commits and updated{" "}
              {syncMutation.data.updatedCommits}.
              {syncMutation.data.skippedProjects > 0
                ? ` Skipped ${syncMutation.data.skippedProjects} manual-only projects.`
                : ""}
            </div>
          ) : null}

          {syncMutation.data?.errors.length ? (
            <div className="rounded-xl border border-orange-400/20 bg-orange-500/10 p-3 text-xs text-orange-100">
              {syncMutation.data.errors.join(" ")}
            </div>
          ) : null}

          {syncMutation.isError ? (
            <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
              {syncMutation.error instanceof Error
                ? syncMutation.error.message
                : "Sync failed."}
            </div>
          ) : null}

          <Panel className="min-h-[520px] overflow-hidden rounded-[18px] border-blue-200/10 bg-slate-950/36 p-5 shadow-[0_24px_70px_rgba(2,6,23,0.34),inset_0_1px_0_rgba(255,255,255,0.045)]">
            {activityQuery.isLoading || (activityType === "all" && tasksQuery.isLoading) ? (
              <TimelineSkeleton />
            ) : activityQuery.isError || tasksQuery.isError ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
                {activityQuery.error instanceof Error
                  ? activityQuery.error.message
                  : tasksQuery.error instanceof Error
                    ? tasksQuery.error.message
                    : "Activity could not be loaded."}
              </div>
            ) : filteredDays.length > 0 ? (
              <div className="space-y-7">
                {filteredDays.map((day) => (
                  <MixedTimelineDay key={day.date} day={day} onViewTask={setViewingTask} />
                ))}
              </div>
            ) : (
              <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-10 text-center text-xs text-slate-400">
                No activity found for this week. Sync Git commits or create manual logs.
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel className="rounded-[18px] border-blue-200/10 bg-slate-950/40 shadow-[0_18px_54px_rgba(2,6,23,0.28),inset_0_1px_0_rgba(255,255,255,0.04)]">
            {summaryQuery.isLoading ? (
              <SummarySkeleton />
            ) : summaryQuery.data ? (
              <WeekSummary summary={summaryQuery.data} />
            ) : null}
          </Panel>

          <Panel className="rounded-[18px] border-blue-200/10 bg-slate-950/40 shadow-[0_18px_54px_rgba(2,6,23,0.28),inset_0_1px_0_rgba(255,255,255,0.04)]">
            {heatmapQuery.isLoading ? (
              <HeatmapSkeleton />
            ) : heatmapQuery.data ? (
              <ActivityHeatmap data={heatmapQuery.data} weekLabel={weekRange.label} />
            ) : null}
          </Panel>

          <Panel className="rounded-[18px] border-blue-200/10 bg-slate-950/40 shadow-[0_18px_54px_rgba(2,6,23,0.28),inset_0_1px_0_rgba(255,255,255,0.04)]">
            {highlightsQuery.isLoading ? (
              <HighlightsSkeleton />
            ) : highlightsQuery.data ? (
              <KeyHighlights highlights={highlightsQuery.data} />
            ) : null}
          </Panel>
        </div>
      </div>
      <TaskDetailModal
        isOpen={Boolean(viewingTask)}
        task={viewingTask}
        onClose={() => setViewingTask(null)}
      />
    </div>
  );
}

type TimelineEntry =
  | { kind: "activity"; id: string; occurredAt: string; item: ActivityItem }
  | { kind: "task"; id: string; occurredAt: string; task: WeeklyTask };

type MixedTimelineDay = {
  date: string;
  items: TimelineEntry[];
};

function MixedTimelineDay({
  day,
  onViewTask,
}: {
  day: MixedTimelineDay;
  onViewTask: (task: WeeklyTask) => void;
}) {
  return (
    <section className="relative">
      <div className="mb-5 flex items-center gap-4">
        <div className="h-px flex-1 bg-blue-200/10" />
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg border border-blue-300/20 bg-blue-500/10 text-blue-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <CalendarDays className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-semibold text-slate-100">{formatDayLabel(day.date)}</span>
          <span className="text-xs tabular-nums text-slate-500">{day.items.length} items</span>
        </div>
        <div className="h-px flex-1 bg-blue-200/10" />
      </div>

      <div className="relative pl-[104px] max-sm:pl-0">
        <div className="pointer-events-none absolute bottom-0 left-8 top-2 z-0 w-px bg-gradient-to-b from-blue-300/35 via-blue-300/20 to-transparent max-sm:hidden" />

        <div className="space-y-3">
          {day.items.map((entry) => (
            <div key={`${entry.kind}-${entry.id}`} className="relative">
              <div className="pointer-events-none absolute -left-[72px] top-9 z-20 h-4 w-4 -translate-x-1/2 rounded-full border border-blue-100/40 bg-blue-500 shadow-[0_0_0_6px_rgba(15,23,42,0.92),0_0_26px_rgba(59,130,246,0.42)] max-sm:hidden" />
              {entry.kind === "activity" ? (
                <TimelineItem item={entry.item} />
              ) : (
                <TaskTimelineItem task={entry.task} occurredAt={entry.occurredAt} onView={() => onViewTask(entry.task)} />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TaskTimelineItem({
  task,
  occurredAt,
  onView,
}: {
  task: WeeklyTask;
  occurredAt: string;
  onView: () => void;
}) {
  return (
    <article className="group relative z-10 rounded-2xl border border-blue-100/8 bg-slate-950/36 shadow-[0_14px_40px_rgba(2,6,23,0.22),inset_0_1px_0_rgba(255,255,255,0.04)] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:border-blue-200/16 hover:bg-slate-950/48 hover:shadow-[0_18px_48px_rgba(2,6,23,0.3),inset_0_1px_0_rgba(255,255,255,0.055)]">
      <button type="button" onClick={onView} className="flex w-full items-start gap-4 p-4 text-left">
        <span className="absolute left-0 mt-1 w-16 -translate-x-[56px] text-left text-sm tabular-nums text-slate-400 max-sm:static max-sm:w-auto max-sm:translate-x-0 max-sm:text-xs">
          {formatActivityTime(occurredAt)}
        </span>

        <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-500/10 text-cyan-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <ListChecks className="h-5 w-5 shrink-0 stroke-[2.35]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-cyan-200/10 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-100">
              Task
            </span>
            <Badge tone={task.status === "blocked" ? "orange" : task.status === "completed" ? "green" : "blue"}>
              {task.status.replace("_", " ")}
            </Badge>
            {task.projectName ? (
              <span className="rounded-md border border-white/8 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                {task.projectName}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-[15px] font-semibold leading-6 text-slate-50 [text-wrap:pretty]">{task.title}</p>
          {task.details ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{task.details}</p> : null}
        </div>
      </button>
    </article>
  );
}

function combineTimelineDays(activityDays: Array<{ date: string; items: ActivityItem[] }>, tasks: WeeklyTask[]): MixedTimelineDay[] {
  const grouped = new Map<string, TimelineEntry[]>();

  for (const day of activityDays) {
    const entries = grouped.get(day.date) ?? [];
    entries.push(
      ...day.items.map((item) => ({
        kind: "activity" as const,
        id: item.id,
        occurredAt: item.occurredAt,
        item,
      })),
    );
    grouped.set(day.date, entries);
  }

  for (const task of tasks) {
    const occurredAt = task.completedAt ?? task.targetDate ?? task.weekStartDate;
    const date = occurredAt.slice(0, 10);
    const entries = grouped.get(date) ?? [];
    entries.push({ kind: "task", id: task.id, occurredAt, task });
    grouped.set(date, entries);
  }

  return Array.from(grouped.entries())
    .map(([date, items]) => ({
      date,
      items: items.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    }))
    .sort((left, right) => right.date.localeCompare(left.date));
}

function entryMatchesSearch(entry: TimelineEntry, query: string) {
  if (entry.kind === "activity") {
    return (
      entry.item.summary.toLowerCase().includes(query) ||
      Boolean(entry.item.projectName?.toLowerCase().includes(query)) ||
      entry.item.activityType.toLowerCase().includes(query)
    );
  }

  return (
    entry.task.title.toLowerCase().includes(query) ||
    Boolean(entry.task.details?.toLowerCase().includes(query)) ||
    Boolean(entry.task.projectName?.toLowerCase().includes(query)) ||
    entry.task.status.toLowerCase().includes(query) ||
    entry.task.taskType.toLowerCase().includes(query)
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

function formatActivityTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function TimelineSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
          {[0, 1, 2].map((j) => (
            <div key={j} className="ml-10 h-10 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ))}
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}

function HeatmapSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
      <div className="space-y-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex gap-1">
            <div className="w-10" />
            {[0, 1, 2, 3, 4].map((j) => (
              <div key={j} className="flex-1 animate-pulse rounded-sm bg-white/5" style={{ minHeight: "12px" }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function HighlightsSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />
      ))}
    </div>
  );
}
