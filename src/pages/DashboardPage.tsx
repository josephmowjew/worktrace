import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart3, ClipboardList, FolderKanban, GitCommit, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { StatCard } from "../components/ui/StatCard";
import { currentWeekRange } from "../lib/dates";
import { syncCommits } from "../lib/api/gitSync";

export function DashboardPage() {
  const queryClient = useQueryClient();
  const weekRange = currentWeekRange();
  const syncMutation = useMutation({
    mutationFn: () =>
      syncCommits({
        from: weekRange.from,
        to: weekRange.to,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-400">
            Your current week will appear here after adding projects and syncing Git activity.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "Syncing..." : "Sync This Week"}
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard icon={FolderKanban} label="Projects Worked On" value="0" hint="No projects synced yet" />
        <StatCard icon={GitCommit} label="Commits This Week" value="0" hint="Ready for first sync" tone="purple" />
        <StatCard icon={ClipboardList} label="Manual Logs" value="0" hint="Meetings and non-code work" tone="cyan" />
        <StatCard icon={BarChart3} label="Reports Generated" value="0" hint="Markdown reports saved here" tone="green" />
      </div>

      <div className="grid grid-cols-[1.3fr_0.7fr] gap-4">
        <Panel className="min-h-[340px]">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Weekly Activity Overview</h2>
              <p className="text-sm text-slate-400">Real activity charts arrive after the sync workflow is connected.</p>
            </div>
          </div>
          <div className="flex h-60 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.03] text-sm text-slate-400">
            Add a project, sync commits, and this area becomes your week at a glance.
          </div>
        </Panel>

        <Panel>
          <h2 className="text-lg font-semibold">Recent Activity</h2>
          {syncMutation.data ? (
            <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              Synced {syncMutation.data.scannedProjects} projects. Added{" "}
              {syncMutation.data.newCommits} commits and updated{" "}
              {syncMutation.data.updatedCommits}.
            </div>
          ) : null}
          {syncMutation.isError ? (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
              {syncMutation.error instanceof Error
                ? syncMutation.error.message
                : "Sync failed."}
            </div>
          ) : null}
          <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
            No activity yet. WorkTrace only tracks what you explicitly add or sync from local repositories. Current sync range: {weekRange.label}.
          </div>
        </Panel>
      </div>
    </div>
  );
}
