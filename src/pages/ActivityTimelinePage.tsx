import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Filter,
  GitCommitHorizontal,
  NotebookText,
  RefreshCw,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { listActivity } from "../lib/api/activity";
import { syncCommits } from "../lib/api/gitSync";
import { listProjects } from "../lib/api/projects";
import { recentHistoryRange } from "../lib/dates";
import type { ActivityDay, ActivityItem } from "../types/activity";

const activityFilters = [
  { label: "All", value: "all" },
  { label: "Commits", value: "commit" },
  { label: "Meetings", value: "Meeting" },
  { label: "Development", value: "Development" },
  { label: "Bug Fixes", value: "Bug Fix" },
  { label: "Testing", value: "Testing" },
  { label: "Deployments", value: "Deployment" },
  { label: "Reviews", value: "Code Review" },
  { label: "Support", value: "Support" },
];

type ActivityGroup = {
  projectKey: string;
  projectName: string;
  items: ActivityItem[];
};

export function ActivityTimelinePage() {
  const queryClient = useQueryClient();
  const timelineRange = recentHistoryRange(new Date(), 3650);
  const [activityType, setActivityType] = useState("all");
  const [projectId, setProjectId] = useState("all");

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });
  const activityQuery = useQuery({
    queryKey: ["activity", timelineRange.from, timelineRange.to, activityType, projectId],
    queryFn: () =>
      listActivity({
        from: timelineRange.from,
        to: timelineRange.to,
        activityType: activityType === "all" ? null : activityType,
        projectIds: projectId === "all" ? null : [projectId],
      }),
  });
  const syncMutation = useMutation({
    mutationFn: () =>
      syncCommits({
        from: null,
        to: null,
        authorEmail: null,
        projectIds: projectId === "all" ? null : [projectId],
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["activity"] }),
  });

  const activityDays = activityQuery.data ?? [];
  const summary = useMemo(() => summarizeActivity(activityDays), [activityDays]);

  return (
    <div className="space-y-4">
      <Panel className="relative overflow-hidden p-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_28%,rgba(56,189,248,0.16),transparent_26%),radial-gradient(circle_at_76%_10%,rgba(37,99,235,0.16),transparent_24%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              <CalendarDays className="h-3.5 w-3.5" />
              Recent activity ledger
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Activity Timeline
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Synced commits and manual logs grouped by day, project, and report
              readiness for {timelineRange.label}.
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Panel className="space-y-3 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Filter className="h-4 w-4 text-cyan-300" />
              Filters
            </div>
            <div className="flex flex-wrap gap-2">
              {activityFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setActivityType(filter.value)}
                  className={[
                    "rounded-xl border px-3 py-2 text-xs font-semibold transition-all duration-150",
                    activityType === filter.value
                      ? "border-blue-300/25 bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                      : "border-white/10 bg-slate-950/45 text-slate-400 hover:bg-white/10 hover:text-slate-200",
                  ].join(" ")}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.currentTarget.value)}
              className="h-10 w-full rounded-xl border border-white/10 bg-slate-950/75 px-3 text-sm text-slate-100 outline-none transition focus:border-blue-300/50 focus:ring-2 focus:ring-blue-500/15 sm:w-[320px]"
            >
              <option value="all">All projects</option>
              {(projectsQuery.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </Panel>

          <Panel className="min-h-[420px]">
            {syncMutation.data ? (
              <div className="mb-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                Synced {syncMutation.data.scannedProjects} projects. Added{" "}
                {syncMutation.data.newCommits} commits and updated{" "}
                {syncMutation.data.updatedCommits}.
                {syncMutation.data.skippedProjects > 0
                  ? ` Skipped ${syncMutation.data.skippedProjects} manual-only projects.`
                  : ""}
              </div>
            ) : null}
            {syncMutation.data?.errors.length ? (
              <div className="mb-3 rounded-xl border border-orange-400/20 bg-orange-500/10 p-3 text-xs text-orange-100">
                {syncMutation.data.errors.join(" ")}
              </div>
            ) : null}
            {syncMutation.isError ? (
              <div className="mb-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-100">
                {syncMutation.error instanceof Error
                  ? syncMutation.error.message
                  : "Sync failed."}
              </div>
            ) : null}

            {activityQuery.isLoading ? (
              <TimelineSkeleton />
            ) : activityQuery.isError ? (
              <div className="rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
                {activityQuery.error instanceof Error
                  ? activityQuery.error.message
                  : "Activity could not be loaded."}
              </div>
            ) : activityDays.length > 0 ? (
              <div className="space-y-5">
                {activityDays.map((day) => (
                  <ActivityDaySection key={day.date} day={day} />
                ))}
              </div>
            ) : (
              <div className="flex min-h-[300px] items-center justify-center rounded-xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-10 text-center text-xs text-slate-400">
                No activity found for these filters. Add a project, sync Git commits,
                or create manual logs for {timelineRange.label}.
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <BarChart3 className="h-4 w-4 text-cyan-300" />
              Recent Summary
            </div>
            <SummaryLine label="Total items" value={summary.total.toString()} />
            <SummaryLine label="Commits" value={summary.commits.toString()} />
            <SummaryLine label="Manual logs" value={summary.manual.toString()} />
            <SummaryLine label="Report-ready" value={summary.included.toString()} />
            <SummaryLine label="Hidden" value={summary.hidden.toString()} />
          </Panel>

          <Panel className="space-y-3">
            <h2 className="text-sm font-semibold text-white">Breakdown</h2>
            {summary.byType.length > 0 ? (
              summary.byType.map(([type, count]) => (
                <SummaryLine key={type} label={labelActivity(type)} value={count.toString()} />
              ))
            ) : (
              <p className="text-xs leading-5 text-slate-500">
                Activity type counts appear after syncing commits or adding manual logs.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ActivityDaySection({ day }: { day: ActivityDay }) {
  const groups = groupByProject(day.items);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <p className="text-xs font-semibold text-slate-300">
          {formatActivityDate(day.date)}
        </p>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      {groups.map((group) => (
        <div key={group.projectKey} className="space-y-2">
          <div className="flex items-center justify-between rounded-xl border border-white/8 bg-slate-950/35 px-3 py-2">
            <p className="text-sm font-semibold text-slate-100">{group.projectName}</p>
            <Badge tone="slate">{group.items.length} items</Badge>
          </div>
          <div className="grid gap-2">
            {group.items.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const isCommit = item.activityType === "commit";
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const Icon = isCommit ? GitCommitHorizontal : NotebookText;

  const subject = item.summary.split("\n")[0];
  const body = item.summary.split("\n").slice(1).join("\n").trim();
  const hasExtraContent = isCommit && (body || item.commitHash);

  const handleCopyHash = () => {
    if (item.commitHash) {
      navigator.clipboard.writeText(item.commitHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <article className="rounded-xl border border-white/8 bg-slate-950/45 shadow-lg shadow-black/10">
      <div className="flex items-start gap-3 p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-400/10 text-cyan-200">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={isCommit ? "cyan" : "blue"}>{labelActivity(item.activityType)}</Badge>
            {!item.includedInReport ? <Badge tone="orange">Hidden from report</Badge> : null}
            {item.includedInReport ? <Badge tone="green">Report-ready</Badge> : null}
          </div>
          <p className="mt-1.5 truncate text-sm font-medium text-slate-100">
            {subject}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {formatActivityTime(item.occurredAt)}
          </p>
        </div>
        {hasExtraContent && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
            aria-label={expanded ? "Collapse details" : "Expand details"}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {expanded && hasExtraContent && (
        <div className="ml-12 mr-3 mb-3 space-y-3 rounded-xl border border-white/8 bg-slate-950/60 p-3">
          {body && (
            <div className="max-h-48 overflow-y-auto text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
              {body}
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
            {item.authorName && (
              <div>
                <span className="text-slate-500">Author:</span>{" "}
                <span className="text-slate-200">{item.authorName}</span>
              </div>
            )}
            {item.branch && (
              <div>
                <span className="text-slate-500">Branch:</span>{" "}
                <span className="font-mono text-slate-200">{item.branch}</span>
              </div>
            )}
            {item.commitHash && (
              <div className="col-span-2 flex items-center gap-2">
                <span className="text-slate-500">Commit:</span>
                <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                  {item.commitHash}
                </code>
                <button
                  type="button"
                  onClick={handleCopyHash}
                  className="rounded p-0.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
                  aria-label="Copy commit hash"
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            )}
            {(item.filesChanged !== null || item.insertions !== null || item.deletions !== null) && (
              <div className="col-span-2 flex items-center gap-3 text-slate-400">
                {item.filesChanged !== null && (
                  <span>{item.filesChanged} file(s)</span>
                )}
                {item.insertions !== null && (
                  <span className="text-emerald-400">+{item.insertions}</span>
                )}
                {item.deletions !== null && (
                  <span className="text-red-400">-{item.deletions}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

function TimelineSkeleton() {
  return (
    <div className="grid gap-2">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-20 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]"
        />
      ))}
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/8 bg-slate-950/35 px-3 py-2 text-xs">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-slate-100">{value}</span>
    </div>
  );
}

function groupByProject(items: ActivityItem[]): ActivityGroup[] {
  const groups = new Map<string, ActivityGroup>();

  for (const item of items) {
    const projectKey = item.projectId ?? "general";
    const projectName = item.projectName ?? "General / no project";
    const group = groups.get(projectKey);

    if (group) {
      group.items.push(item);
    } else {
      groups.set(projectKey, {
        projectKey,
        projectName,
        items: [item],
      });
    }
  }

  return Array.from(groups.values());
}

function summarizeActivity(days: ActivityDay[]) {
  const items = days.flatMap((day) => day.items);
  const typeCounts = new Map<string, number>();

  for (const item of items) {
    typeCounts.set(item.activityType, (typeCounts.get(item.activityType) ?? 0) + 1);
  }

  return {
    total: items.length,
    commits: items.filter((item) => item.activityType === "commit").length,
    manual: items.filter((item) => item.activityType !== "commit").length,
    included: items.filter((item) => item.includedInReport).length,
    hidden: items.filter((item) => !item.includedInReport).length,
    byType: Array.from(typeCounts.entries()).sort((left, right) => right[1] - left[1]),
  };
}

function labelActivity(value: string) {
  if (value === "commit") {
    return "Commit";
  }

  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatActivityDate(value: string) {
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
