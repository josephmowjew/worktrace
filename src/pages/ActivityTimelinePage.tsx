import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Panel } from "../components/ui/Panel";
import { syncCommits } from "../lib/api/gitSync";
import { currentWeekRange } from "../lib/dates";

const filters = ["All", "Commits", "Meetings", "Reviews", "Testing", "Deployments"];

export function ActivityTimelinePage() {
  const queryClient = useQueryClient();
  const weekRange = currentWeekRange();
  const syncMutation = useMutation({
    mutationFn: () =>
      syncCommits({
        from: weekRange.from,
        to: weekRange.to,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["activity"] }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Activity Timeline</h1>
          <p className="mt-1 text-sm text-slate-400">Synced commits and manual logs will be grouped by day.</p>
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

      <div className="flex gap-2">
        {filters.map((filter, index) => (
          <Badge key={filter} tone={index === 0 ? "blue" : "slate"}>
            {filter}
          </Badge>
        ))}
      </div>

      <Panel className="min-h-[620px]">
        {syncMutation.data ? (
          <div className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            Synced {syncMutation.data.scannedProjects} projects. Added{" "}
            {syncMutation.data.newCommits} commits and updated{" "}
            {syncMutation.data.updatedCommits}.
          </div>
        ) : null}
        {syncMutation.isError ? (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
            {syncMutation.error instanceof Error
              ? syncMutation.error.message
              : "Sync failed."}
          </div>
        ) : null}
        <div className="flex h-[520px] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.03] text-sm text-slate-400">
          Timeline data will appear here after activity queries are implemented. Current sync range: {weekRange.label}.
        </div>
      </Panel>
    </div>
  );
}
