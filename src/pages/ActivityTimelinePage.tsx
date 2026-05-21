import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  FlaskConical,
  GitCommit,
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
import { useToast } from "../components/ui/ToastProvider";
import { ActivityHeatmap } from "../components/timeline/ActivityHeatmap";
import { WeekSummary } from "../components/timeline/WeekSummary";
import { KeyHighlights } from "../components/timeline/KeyHighlights";
import { TimelineDay } from "../components/timeline/TimelineDay";
import { listActivity, getActivityHeatmap, getWeekSummary, getKeyHighlights } from "../lib/api/activity";
import { syncCommits } from "../lib/api/gitSync";
import { listProjects } from "../lib/api/projects";
import { currentWeekRange, shiftWeek } from "../lib/dates";

const activityFilters = [
  { label: "All", value: "all", icon: BarChart3 },
  { label: "Commits", value: "commit", icon: GitCommit },
  { label: "Meetings", value: "Meeting", icon: Users },
  { label: "Reviews", value: "Code Review", icon: Eye },
  { label: "Testing", value: "Testing", icon: FlaskConical },
  { label: "Deployments", value: "Deployment", icon: Rocket },
];

export function ActivityTimelinePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
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
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["activity"] });
      queryClient.invalidateQueries({ queryKey: ["heatmap"] });
      queryClient.invalidateQueries({ queryKey: ["weekSummary"] });
      queryClient.invalidateQueries({ queryKey: ["keyHighlights"] });
      toast.success(
        "Sync complete",
        `Added ${result.newCommits} commits and updated ${result.updatedCommits}.`,
      );
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
    <div className="space-y-4">
      <Panel className="relative overflow-hidden p-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_28%,rgba(56,189,248,0.16),transparent_26%),radial-gradient(circle_at_76%_10%,rgba(37,99,235,0.16),transparent_24%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">
                Activity Timeline
              </h1>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevWeek}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-1.5">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-200">{weekRange.label}</span>
              </div>
              <button
                onClick={handleNextWeek}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-200"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search projects, tasks, commits..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-64 rounded-xl border border-white/10 bg-slate-950/50 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-500 outline-none transition focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15"
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
              {syncMutation.isPending ? "Syncing..." : "Sync Repositories"}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel className="space-y-3 p-3">
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
                    "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all duration-150",
                    activityType === filter.value
                      ? "border-blue-300/25 bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                      : "border-white/10 bg-slate-950/45 text-slate-400 hover:bg-white/10 hover:text-slate-200",
                  ].join(" ")}
                >
                  <Icon className="h-3.5 w-3.5" />
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

          <Panel className="min-h-[420px]">
            {activityQuery.isLoading ? (
              <TimelineSkeleton />
            ) : activityQuery.isError ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
                {activityQuery.error instanceof Error
                  ? activityQuery.error.message
                  : "Activity could not be loaded."}
              </div>
            ) : filteredDays.length > 0 ? (
              <div className="space-y-6">
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
          <Panel>
            {summaryQuery.isLoading ? (
              <SummarySkeleton />
            ) : summaryQuery.data ? (
              <WeekSummary summary={summaryQuery.data} />
            ) : null}
          </Panel>

          <Panel>
            {heatmapQuery.isLoading ? (
              <HeatmapSkeleton />
            ) : heatmapQuery.data ? (
              <ActivityHeatmap data={heatmapQuery.data} weekLabel={weekRange.label} />
            ) : null}
          </Panel>

          <Panel>
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
