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
import { TimelineDay } from "../components/timeline/TimelineDay";
import { listActivity, getActivityHeatmap, getWeekSummary, getKeyHighlights } from "../lib/api/activity";
import { syncCommits } from "../lib/api/gitSync";
import { listProjects } from "../lib/api/projects";
import { syncAnnouncement, syncStartedAnnouncement } from "../lib/announcements";
import { currentWeekRange, shiftWeek } from "../lib/dates";

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
    let days = activityQuery.data ?? [];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      days = days
        .map((day) => ({
          ...day,
          items: day.items.filter(
            (item) =>
              item.summary.toLowerCase().includes(query) ||
              item.projectName?.toLowerCase().includes(query) ||
              item.activityType.toLowerCase().includes(query)
          ),
        }))
        .filter((day) => day.items.length > 0);
    }

    return days;
  }, [activityQuery.data, searchQuery]);

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
            {activityQuery.isLoading ? (
              <TimelineSkeleton />
            ) : activityQuery.isError ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
                {activityQuery.error instanceof Error
                  ? activityQuery.error.message
                  : "Activity could not be loaded."}
              </div>
            ) : filteredDays.length > 0 ? (
              <div className="space-y-7">
                {filteredDays.map((day) => (
                  <TimelineDay key={day.date} day={day} />
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
    </div>
  );
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
