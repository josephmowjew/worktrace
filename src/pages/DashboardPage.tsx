import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ClipboardList,
  FolderKanban,
  GitCommit,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { StatCard } from "../components/ui/StatCard";
import { listActivity } from "../lib/api/activity";
import { syncCommits } from "../lib/api/gitSync";
import { listProjects } from "../lib/api/projects";
import { listReports } from "../lib/api/reports";
import { getSettings } from "../lib/api/settings";
import { currentWeekRange } from "../lib/dates";

export function DashboardPage() {
  const queryClient = useQueryClient();
  const weekRange = currentWeekRange();
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
  const reportsQuery = useQuery({
    queryKey: ["reports"],
    queryFn: listReports,
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
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  const projects = projectsQuery.data ?? [];
  const activityDays = activityQuery.data ?? [];
  const activityItems = activityDays.flatMap((day) => day.items);
  const commitCount = activityItems.filter((item) => item.activityType === "commit").length;
  const manualCount = activityItems.filter((item) => item.activityType !== "commit").length;
  const activeProjects = projects.filter((project) => project.status === "active").length;
  const recentItems = activityItems.slice(0, 5);
  const hasLoadError =
    projectsQuery.isError || activityQuery.isError || reportsQuery.isError;

  return (
    <div className="space-y-4">
      <Panel className="relative overflow-hidden p-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_25%,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_78%_8%,rgba(20,184,166,0.14),transparent_24%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <Sparkles className="h-3.5 w-3.5" />
              Current week command center
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Dashboard</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Your local work summary for {weekRange.label}, built from explicit Git
              syncs and manual logs.
            </p>
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
      </Panel>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCard
          icon={FolderKanban}
          label="Active Projects"
          value={projectsQuery.isLoading ? "..." : activeProjects.toString()}
          hint={
            projectsQuery.isLoading ? "Loading local registry" : `${projects.length} total registered`
          }
        />
        <StatCard
          icon={GitCommit}
          label="Commits This Week"
          value={activityQuery.isLoading ? "..." : commitCount.toString()}
          hint={activityQuery.isLoading ? "Loading activity" : "From local Git sync"}
          tone="purple"
        />
        <StatCard
          icon={ClipboardList}
          label="Manual Logs"
          value={activityQuery.isLoading ? "..." : manualCount.toString()}
          hint={activityQuery.isLoading ? "Loading activity" : "Meetings and non-code work"}
          tone="cyan"
        />
        <StatCard
          icon={BarChart3}
          label="Reports Saved"
          value={reportsQuery.isLoading ? "..." : (reportsQuery.data ?? []).length.toString()}
          hint={reportsQuery.isLoading ? "Loading report history" : "Local Markdown history"}
          tone="green"
        />
      </div>

      {hasLoadError ? (
        <Panel className="border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">
          {projectsQuery.error instanceof Error
            ? projectsQuery.error.message
            : activityQuery.error instanceof Error
              ? activityQuery.error.message
              : reportsQuery.error instanceof Error
                ? reportsQuery.error.message
                : "Dashboard data could not be loaded."}
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Panel className="min-h-[320px]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">
                Weekly Activity Overview
              </h2>
              <p className="text-xs text-slate-400">
                Daily volume across commits and manual logs.
              </p>
            </div>
            <Badge tone="blue">{activityItems.length} items</Badge>
          </div>
          {activityQuery.isLoading ? (
            <div className="h-52 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]" />
          ) : activityDays.length > 0 ? (
            <div className="grid h-56 grid-cols-7 items-end gap-2 rounded-xl border border-white/8 bg-slate-950/35 p-4">
              {activityDaysForWeek(weekRange.from).map((date) => {
                const day = activityDays.find((item) => item.date === date);
                const count = day?.items.length ?? 0;
                const height = Math.max(8, Math.min(100, count * 18));

                return (
                  <div key={date} className="flex h-full flex-col justify-end gap-2">
                    <div
                      className="rounded-t-lg border border-cyan-300/20 bg-gradient-to-t from-blue-600/40 to-cyan-300/70 shadow-lg shadow-cyan-500/10"
                      style={{ height: `${height}%` }}
                    />
                    <span className="text-center text-[10px] text-slate-500">
                      {formatDay(date)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-52 items-center justify-center rounded-xl border border-dashed border-white/8 bg-white/[0.02] px-4 text-center text-xs leading-5 text-slate-400">
              Add a project, sync commits, or create manual logs to see your week at a
              glance.
            </div>
          )}
        </Panel>

        <Panel>
          <h2 className="text-base font-semibold text-white">Recent Activity</h2>
          {syncMutation.data ? (
            <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-100">
              Synced {syncMutation.data.scannedProjects} projects. Added{" "}
              {syncMutation.data.newCommits} commits and updated{" "}
              {syncMutation.data.updatedCommits}.
            </div>
          ) : null}
          {syncMutation.isError ? (
            <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
              {syncMutation.error instanceof Error
                ? syncMutation.error.message
                : "Sync failed."}
            </div>
          ) : null}
          <div className="mt-4 grid gap-2">
            {recentItems.length > 0 ? (
              recentItems.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-white/8 bg-slate-950/45 p-3"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <Badge tone={item.activityType === "commit" ? "cyan" : "blue"}>
                      {item.activityType === "commit" ? "Commit" : item.activityType}
                    </Badge>
                    {item.projectName ? (
                      <span className="truncate text-[11px] text-slate-500">
                        {item.projectName}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-sm font-medium text-slate-100">
                    {item.summary}
                  </p>
                </article>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-white/8 bg-white/[0.02] p-4 text-xs leading-5 text-slate-400">
                No activity yet. WorkTrace only tracks what you explicitly add or sync
                from local repositories.
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function activityDaysForWeek(start: string) {
  const [year, month, day] = start.split("-").map(Number);
  const startDate = new Date(year, month - 1, day);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return formatDateOnly(date);
  });
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
