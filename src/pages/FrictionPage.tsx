import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Gauge, RefreshCw, ShieldCheck, Target, Zap } from "lucide-react";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { FrictionInsightPanel } from "../components/ui/FrictionInsightPanel";
import { PageHeader } from "../components/ui/PageHeader";
import { Panel } from "../components/ui/Panel";
import { WeekRangePicker } from "../components/ui/WeekRangePicker";
import { useSpeech } from "../components/ui/SpeechProvider";
import { useToast } from "../components/ui/ToastProvider";
import { getFrictionInsights } from "../lib/api/friction";
import { getSettings } from "../lib/api/settings";
import { syncAnnouncement, syncStartedAnnouncement } from "../lib/announcements";
import { currentWeekRange, shiftWeek } from "../lib/dates";
import { isRepositorySyncInProgressError, useRepositorySync } from "../features/repositorySync/RepositorySyncProvider";

export function FrictionPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const speech = useSpeech();
  const repositorySync = useRepositorySync();
  const [anchorDate, setAnchorDate] = useState(new Date());
  const weekRange = currentWeekRange(anchorDate);
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });
  const insightsQuery = useQuery({
    queryKey: ["frictionInsights", weekRange.from, weekRange.to, "friction"],
    queryFn: () =>
      getFrictionInsights({
        from: weekRange.from,
        to: weekRange.to,
        surface: "friction",
      }),
  });
  async function handleSyncRepositories() {
    speech.announce(syncStartedAnnouncement("friction signals"), { category: "sync" });
    try {
      const result = await repositorySync.syncRepositories(
        {
          from: null,
          to: null,
          authorEmail: settingsQuery.data?.gitAuthorEmail || null,
        },
        {
          scope: "friction",
          onAlreadyRunning: () => toast.info("Sync already running", "Repository activity is still being refreshed."),
        },
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
        queryClient.invalidateQueries({ queryKey: ["frictionInsights"] }),
        queryClient.invalidateQueries({ queryKey: ["weeklyTasks"] }),
      ]);
      toast.success(
        "Sync complete",
        `Added ${result.newCommits} commits and updated ${result.updatedCommits}.`,
      );
      speech.announce(syncAnnouncement(result), { category: "sync" });
    } catch (error) {
      if (isRepositorySyncInProgressError(error)) return;
      toast.error("Sync failed", error instanceof Error ? error.message : "Repository sync could not be completed.");
    }
  }

  const insights = insightsQuery.data ?? [];
  const highCount = insights.filter((insight) => insight.severity === "high").length;
  const mediumCount = insights.filter((insight) => insight.severity === "medium").length;
  const projectSwitchInsight = insights.find((insight) => insight.kind === "project_switching" || insight.kind === "context_switching");
  const reportInsight = insights.find((insight) => insight.kind === "late_report");

  return (
    <div className="space-y-4 pb-4">
      <PageHeader
        icon={Gauge}
        eyebrow="Work intelligence"
        title="Friction"
        description="Review conservative signals that may be slowing the week down."
        meta={
          <WeekRangePicker
            label={weekRange.label}
            onPrev={() => setAnchorDate(shiftWeek(anchorDate, -1))}
            onNext={() => setAnchorDate(shiftWeek(anchorDate, 1))}
          />
        }
        actions={
          <Button
            variant="primary"
            onClick={() => void handleSyncRepositories()}
            disabled={repositorySync.isSyncing}
          >
            <RefreshCw className={`h-4 w-4 ${repositorySync.isSyncing ? "animate-spin" : ""}`} />
            {repositorySync.isSyncing ? "Syncing..." : "Sync activity"}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FrictionStat icon={AlertTriangle} label="Active insights" value={insights.length} tone={insights.length ? "orange" : "slate"} />
        <FrictionStat icon={Zap} label="Needs attention" value={highCount} tone={highCount ? "orange" : "slate"} />
        <FrictionStat icon={Target} label="Worth watching" value={mediumCount} tone={mediumCount ? "blue" : "slate"} />
        <FrictionStat icon={ShieldCheck} label="Current state" value={insights.length ? "Review" : "Quiet"} tone={insights.length ? "blue" : "green"} />
      </div>

      {insightsQuery.isError ? (
        <Panel>
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-[var(--wt-text-strong)]">
            {insightsQuery.error instanceof Error ? insightsQuery.error.message : "Friction insights could not be loaded."}
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <FrictionInsightPanel
          title="Needs Attention"
          insights={insights.filter((insight) => insight.severity === "high")}
          isLoading={insightsQuery.isLoading}
          emptyText="No high-confidence friction patterns in this range."
          limit={6}
        />
        <Panel>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white">Signals</h2>
            <Badge tone="slate">conservative</Badge>
          </div>
          <div className="space-y-2">
            <SignalRow label="Focus risk" value={projectSwitchInsight?.title ?? "No clear pattern"} active={Boolean(projectSwitchInsight)} />
            <SignalRow label="Report risk" value={reportInsight?.title ?? "No late-report pattern"} active={Boolean(reportInsight)} />
            <SignalRow label="Privacy" value="Local data only" active={false} />
          </div>
        </Panel>
      </div>

      <FrictionInsightPanel
        title="Worth Watching"
        insights={insights.filter((insight) => insight.severity !== "high")}
        isLoading={insightsQuery.isLoading}
        emptyText="No medium-confidence patterns to watch."
        limit={8}
      />
    </div>
  );
}

function FrictionStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  tone: "orange" | "blue" | "green" | "slate";
}) {
  const toneClass = {
    orange: "border-orange-500/18 bg-orange-500/10 text-orange-200",
    blue: "border-blue-500/18 bg-blue-500/10 text-blue-200",
    green: "border-emerald-500/18 bg-emerald-500/10 text-emerald-200",
    slate: "border-white/10 bg-white/[0.03] text-slate-300",
  }[tone];

  return (
    <Panel className="p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--wt-text-muted)]">{label}</p>
          <p className="mt-1 text-xl font-semibold text-[var(--wt-text-strong)] tabular-nums">{value}</p>
        </div>
      </div>
    </Panel>
  );
}

function SignalRow({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`truncate text-xs font-medium ${active ? "text-orange-200" : "text-slate-300"}`}>{value}</span>
    </div>
  );
}
