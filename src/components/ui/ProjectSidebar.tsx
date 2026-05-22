import { GitBranch, RefreshCw, Users } from "lucide-react";
import type { TopContributor } from "../../types/project";
import type { WeekSummary } from "../../types/activity";
import { Button } from "./Button";
import { Panel } from "./Panel";

export function ProjectSidebar({
  contributors,
  weekSummary,
  isLoading,
  onSync,
  isSyncing,
}: {
  contributors: TopContributor[];
  weekSummary?: WeekSummary;
  isLoading: boolean;
  onSync: () => void;
  isSyncing: boolean;
}) {
  return (
    <div className="space-y-4">
      <Panel>
        <h3 className="mb-3 text-sm font-semibold text-white">Quick Actions</h3>
        <Button variant="primary" onClick={onSync} disabled={isSyncing} className="w-full">
          <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Syncing..." : "Sync Repository"}
        </Button>
      </Panel>

      {weekSummary && (
        <Panel>
          <h3 className="mb-3 text-sm font-semibold text-white">Week Summary</h3>
          <div className="space-y-3">
            <SummaryRow label="Total Activities" value={weekSummary.totalActivities.toString()} />
            <SummaryRow label="Coding Time" value={formatMinutes(weekSummary.codingTimeMinutes)} />
            <SummaryRow label="Meetings" value={weekSummary.meetingCount.toString()} />
            <SummaryRow label="Deployments" value={weekSummary.deploymentCount.toString()} />
          </div>
        </Panel>
      )}

      <Panel>
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-cyan-200" />
          <h3 className="text-sm font-semibold text-white">Top Contributors</h3>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-white/[0.03]" />
            ))}
          </div>
        ) : contributors.length === 0 ? (
          <p className="text-xs text-slate-500">No contributors this week.</p>
        ) : (
          <div className="space-y-2">
            {contributors.map((contributor, index) => (
              <div key={contributor.authorName} className="flex items-center justify-between rounded-xl border border-white/8 bg-slate-950/35 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/10 text-[10px] font-semibold text-blue-200">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-100">{contributor.authorName}</p>
                    {contributor.authorEmail && (
                      <p className="truncate text-[10px] text-slate-500">{contributor.authorEmail}</p>
                    )}
                  </div>
                </div>
                <span className="text-xs font-semibold text-white">{contributor.commitCount}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <h3 className="mb-3 text-sm font-semibold text-white">Repository</h3>
        <div className="space-y-2 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <GitBranch className="h-3.5 w-3.5 text-slate-500" />
            <span>Git tracked</span>
          </div>
          <p className="text-[10px] text-slate-500">Commits are synced automatically every 5 minutes.</p>
        </div>
      </Panel>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes === 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
