import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ChevronDown, Gauge, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { FrictionEvidenceItem, FrictionInsight } from "../../types/friction";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Panel } from "./Panel";

type FrictionInsightPanelProps = {
  title?: string;
  insights: FrictionInsight[];
  isLoading?: boolean;
  emptyText?: string;
  limit?: number;
  compact?: boolean;
};

const severityTone: Record<FrictionInsight["severity"], "orange" | "blue" | "slate"> = {
  high: "orange",
  medium: "blue",
  low: "slate",
};

const confidenceTone: Record<string, "green" | "blue" | "orange" | "slate"> = {
  strong: "green",
  likely: "blue",
  watch: "orange",
  needs_review: "slate",
};

export function FrictionInsightPanel({
  title = "Friction Watch",
  insights,
  isLoading = false,
  emptyText = "No clear friction patterns in this range.",
  limit = 3,
  compact = false,
}: FrictionInsightPanelProps) {
  const navigate = useNavigate();
  const [expandedInsightId, setExpandedInsightId] = useState<string | null>(null);
  const eligibleInsights = compact
    ? insights.filter((insight) => ["strong", "likely"].includes(insight.confidenceLabel ?? "likely"))
    : insights;
  const visible = eligibleInsights.slice(0, limit);

  function handleAction(insight: FrictionInsight) {
    if (insight.primaryAction?.route) {
      navigate(insight.primaryAction.route, {
        state: insight.primaryAction.stateJson ?? undefined,
      });
      return;
    }

    const taskItems = insight.evidenceItems.filter((item) => item.sourceType === "weekly_task");
    if (taskItems.length === 1) {
      navigate("/weekly-plan", {
        state: { openTaskId: taskItems[0].sourceId, frictionInsightId: insight.id },
      });
      return;
    }
    if (taskItems.length > 1) {
      navigate("/weekly-plan", {
        state: {
          highlightTaskIds: taskItems.map((item) => item.sourceId),
          frictionInsightId: insight.id,
        },
      });
      return;
    }

    const activityItem = insight.evidenceItems.find((item) => item.sourceType === "activity");
    if (activityItem) {
      navigate("/activity", {
        state: { searchQuery: activityItem.title, frictionInsightId: insight.id },
      });
      return;
    }

    navigate(insight.actionTarget);
  }

  return (
    <Panel className={compact ? "border-white/10 bg-slate-950/45 p-3" : undefined}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-orange-200" />
          <h2 className={compact ? "text-xs font-semibold uppercase tracking-[0.12em] text-blue-200" : "text-sm font-semibold text-white"}>
            {title}
          </h2>
        </div>
        <Badge tone={visible.length > 0 ? "orange" : "slate"}>{visible.length}</Badge>
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-white/[0.03]" />
      ) : visible.length > 0 ? (
        <div className="space-y-2">
          {visible.map((insight) => {
            const isExpanded = expandedInsightId === insight.id;
            const evidenceItems = isExpanded ? insight.evidenceItems : insight.evidenceItems.slice(0, 3);
            return (
            <article key={insight.id} className="rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-orange-300/20 bg-orange-500/12 text-orange-200">
                  {insight.severity === "high" ? <AlertTriangle className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 text-sm font-medium text-slate-100">{insight.title}</p>
                    <Badge tone={severityTone[insight.severity]}>{insight.severity}</Badge>
                    <Badge tone={confidenceTone[insight.confidenceLabel] ?? "slate"}>
                      {formatConfidence(insight.confidenceLabel)}
                    </Badge>
                    {insight.verified ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300/15 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-200">
                        <ShieldCheck className="h-3 w-3" />
                        verified
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{insight.detail}</p>
                  {insight.reasons?.[0] ? (
                    <p className="mt-1 text-[11px] leading-4 text-slate-500">
                      Because {insight.reasons[0].detail}
                    </p>
                  ) : null}
                  {insight.metrics.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {insight.metrics.slice(0, compact ? 2 : 3).map((metric) => (
                        <span key={`${insight.id}-${metric.key ?? metric.label}`} className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-400">
                          {metric.label}: <span className="font-semibold text-slate-200 tabular-nums">{metric.value}</span>
                          {metric.threshold ? (
                            <span className="ml-1 text-slate-500">/ {metric.direction === "below" ? "<=" : ">="} {metric.threshold}</span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {isExpanded && insight.reasons?.length ? (
                    <div className="mt-3 rounded-lg border border-white/8 bg-white/[0.02] p-2">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Reasoning</p>
                      <div className="space-y-1.5">
                        {insight.reasons.map((reason) => (
                          <div key={`${insight.id}-${reason.id}`} className="flex items-start gap-2 text-[11px] leading-4">
                            <CheckCircle2 className={`mt-0.5 h-3 w-3 shrink-0 ${reason.strength === "limiting" ? "text-orange-300" : "text-emerald-300"}`} />
                            <div>
                              <span className="font-medium text-slate-300">{reason.label}</span>
                              <span className="text-slate-500"> - {reason.detail}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {insight.evidenceItems.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-white/8 bg-slate-950/35 p-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Why this showed up
                        </p>
                        {insight.evidenceItems.length > 3 ? (
                          <button
                            type="button"
                            onClick={() => setExpandedInsightId(isExpanded ? null : insight.id)}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-blue-200 transition-colors hover:bg-blue-500/10 hover:text-blue-100"
                          >
                            {isExpanded ? "Show less" : "View evidence"}
                            <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          </button>
                        ) : null}
                      </div>
                      <div className="space-y-1.5">
                        {evidenceItems.map((item) => (
                          <EvidenceRow key={`${insight.id}-${item.sourceType}-${item.sourceId}-${item.date}`} item={item} />
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {isExpanded && insight.dataHealth?.notes?.length ? (
                    <div className="mt-3 rounded-lg border border-white/8 bg-white/[0.02] p-2 text-[11px] leading-4 text-slate-500">
                      <p className="mb-1 font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Data health: {insight.dataHealth.status}
                      </p>
                      {insight.dataHealth.notes.map((note) => (
                        <p key={`${insight.id}-${note}`}>{note}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
                <Button variant="ghost" onClick={() => handleAction(insight)} className="h-8 shrink-0 px-2 text-xs">
                  {insight.actionLabel}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-xs leading-5 text-slate-400">
          {emptyText}
        </div>
      )}
    </Panel>
  );
}

function EvidenceRow({ item }: { item: FrictionEvidenceItem }) {
  return (
    <div className="grid gap-1 rounded-md border border-white/6 bg-white/[0.025] px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2 text-[11px]">
        <span className="shrink-0 rounded bg-white/8 px-1.5 py-0.5 font-medium text-slate-300">
          {sourceLabel(item.sourceType)}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-slate-500">
          <CalendarDays className="h-3 w-3" />
          {item.date}
        </span>
        {item.projectName ? (
          <span className="min-w-0 truncate text-slate-500">{item.projectName}</span>
        ) : null}
        {item.role ? (
          <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
            {item.role}
          </span>
        ) : null}
      </div>
      <p className="truncate text-xs font-medium text-slate-200">{item.title}</p>
      {item.detail ? <p className="line-clamp-2 text-[11px] leading-4 text-slate-500">{item.detail}</p> : null}
    </div>
  );
}

function formatConfidence(value: string | undefined) {
  return (value ?? "likely").replace("_", " ");
}

function sourceLabel(sourceType: FrictionEvidenceItem["sourceType"]) {
  switch (sourceType) {
    case "weekly_task":
      return "Task";
    case "activity":
      return "Activity";
    case "manual_log":
      return "Log";
    case "calendar_event":
      return "Calendar";
    case "focus_session":
      return "Focus";
    case "report":
      return "Report";
    default:
      return "Evidence";
  }
}
