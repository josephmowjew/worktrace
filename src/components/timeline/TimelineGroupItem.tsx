import { CheckCircle2, ChevronDown, ChevronRight, Edit3, GitCommitVertical } from "lucide-react";
import { useState } from "react";
import type { ActivityGroup, TitleCandidate, TitleRationale } from "../../types/activityGroup";
import { TimelineItem } from "./TimelineItem";

type TimelineGroupItemProps = {
  group: ActivityGroup;
  onEdit: (group: ActivityGroup) => void;
  onSelectTitleCandidate?: (group: ActivityGroup, candidate: TitleCandidate) => void;
  showTime?: boolean;
};

export function TimelineGroupItem({ group, onEdit, onSelectTitleCandidate, showTime = true }: TimelineGroupItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [showNaming, setShowNaming] = useState(false);
  const firstTime = group.items[0]?.occurredAt ?? group.startDate;
  const activities = group.items
    .map((item) => item.activity)
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const titleRationale = safeTitleRationale(group.titleRationaleJson);
  const titleCandidates = safeTitleCandidates(group.titleCandidatesJson)
    .filter((candidate) => candidate.title !== group.title)
    .slice(0, 4);

  return (
    <article className="group relative z-10 rounded-2xl border border-cyan-200/12 bg-slate-950/42 shadow-[0_14px_42px_rgba(2,6,23,0.26),inset_0_1px_0_rgba(255,255,255,0.045)] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:border-cyan-200/22 hover:bg-slate-950/52">
      <div className="flex items-start gap-4 p-4">
        {showTime ? (
          <span className="absolute left-0 mt-1 w-16 -translate-x-[56px] text-left text-sm tabular-nums text-slate-400 max-sm:static max-sm:w-auto max-sm:translate-x-0 max-sm:text-xs">
            {formatActivityTime(firstTime)}
          </span>
        ) : null}

        <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-500/10 text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <GitCommitVertical className="h-5 w-5 shrink-0 stroke-[2.35]" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-cyan-200/10 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-100">
              Work item
            </span>
            {group.projectName ? (
              <span className="rounded-md border border-white/8 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                {group.projectName}
              </span>
            ) : null}
            {group.projectCount > 1 ? (
              <span className="rounded-md border border-violet-300/15 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-100">
                Workspace item · {group.projectCount} projects
              </span>
            ) : group.workspaceName ? (
              <span className="rounded-md border border-white/8 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                {group.workspaceName}
              </span>
            ) : null}
            <span className="rounded-md border border-white/8 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
              {group.items.length} commit{group.items.length === 1 ? "" : "s"}
            </span>
            <span className={confidenceBadgeClass(group.confidenceLabel)}>
              {group.confidenceLabel.replace("_", " ")}
            </span>
            {group.locked ? (
              <span className="rounded-md border border-emerald-300/15 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                Locked
              </span>
            ) : null}
            {group.titleQualityLabel && group.titleQualityLabel !== "report_ready" ? (
              <span className={titleQualityBadgeClass(group.titleQualityLabel)}>
                {titleQualityLabel(group.titleQualityLabel)}
              </span>
            ) : null}
            {group.includedInReport ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300/15 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                <CheckCircle2 className="h-3 w-3" />
                Report
              </span>
            ) : null}
          </div>

          <p className="mt-2 text-[15px] font-semibold leading-6 text-slate-50 [text-wrap:pretty]">
            {group.title}
          </p>
          {group.summary ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
              {group.summary.replace(/\n/g, " ")}
            </p>
          ) : null}
          {group.rationaleJson && (group.items.length > 1 || group.reviewStatus === "needs_review") ? (
            <p className="mt-2 text-[11px] font-medium text-cyan-200/70">
              Why grouped: {safeReasons(group.rationaleJson).slice(0, 2).join(" · ")}
            </p>
          ) : null}
          {titleRationale ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowNaming(!showNaming)}
                className="text-[11px] font-semibold text-slate-400 transition-colors hover:text-cyan-200"
              >
                Why named this?
              </button>
              {showNaming ? (
                <div className="mt-2 rounded-xl border border-white/8 bg-slate-950/45 p-3 text-xs text-slate-400">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={titleQualityBadgeClass(titleRationale.titleQualityLabel)}>
                      {titleQualityLabel(titleRationale.titleQualityLabel)}
                    </span>
                    <span className="rounded-md border border-white/8 bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                      {titleRationale.namingStrategy.replace(/_/g, " ")}
                    </span>
                  </div>
                  {titleRationale.positiveEvidence.length ? (
                    <p className="mt-2 text-cyan-100/70">
                      {titleRationale.positiveEvidence.slice(0, 3).join(" Â· ")}
                    </p>
                  ) : null}
                  {titleRationale.rejectedTerms.length ? (
                    <p className="mt-2 text-slate-500">
                      Ignored: {titleRationale.rejectedTerms.slice(0, 8).join(", ")}
                    </p>
                  ) : null}
                  {titleCandidates.length ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                        Alternate titles
                      </p>
                      {titleCandidates.map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() => onSelectTitleCandidate?.(group, candidate)}
                          className="block w-full rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-left text-xs font-medium text-slate-300 transition-colors hover:border-cyan-300/20 hover:bg-cyan-400/8"
                        >
                          {candidate.title}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(group)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-950/42 text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[background-color,color,transform] duration-150 hover:bg-white/8 hover:text-slate-200 active:scale-[0.96]"
            aria-label="Edit activity group"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-slate-950/42 text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[background-color,color,transform] duration-150 hover:bg-white/8 hover:text-slate-200 active:scale-[0.96]"
            aria-label={expanded ? "Collapse grouped commits" : "Expand grouped commits"}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="mx-4 mb-4 space-y-2 rounded-xl border border-blue-100/8 bg-slate-950/50 p-3">
          {group.projectCount > 1 ? (
            <div className="flex flex-wrap gap-2 pb-1">
              {group.projects.map((project) => (
                <span
                  key={project.projectId}
                  className="rounded-md border border-white/8 bg-white/[0.03] px-2 py-1 text-[10px] font-semibold text-slate-300"
                >
                  {project.projectName}
                </span>
              ))}
            </div>
          ) : null}
          {activities.length ? (
            activities.map((item) => <TimelineItem key={item.id} item={item} showTime={false} />)
          ) : (
            <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3 text-xs text-slate-400">
              Source commits are no longer available.
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}

function confidenceBadgeClass(label: string) {
  if (label === "strong") {
    return "rounded-md border border-emerald-300/15 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-emerald-200";
  }
  if (label === "needs_review") {
    return "rounded-md border border-amber-300/15 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-amber-200";
  }
  return "rounded-md border border-blue-300/15 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-blue-200";
}

function titleQualityBadgeClass(label: string) {
  if (label === "report_ready" || label === "acceptable") {
    return "rounded-md border border-emerald-300/15 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200";
  }
  if (label === "technically_correct_but_weak") {
    return "rounded-md border border-blue-300/15 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-200";
  }
  return "rounded-md border border-amber-300/15 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-200";
}

function titleQualityLabel(label: string) {
  if (label === "report_ready") return "Report ready";
  if (label === "acceptable") return "Acceptable title";
  if (label === "technically_correct_but_weak") return "Weak title";
  if (label === "fallback_only") return "Fallback title";
  if (label === "rejected") return "Rejected title";
  return "Needs review";
}

function safeReasons(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function safeTitleCandidates(value?: string | null): TitleCandidate[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isTitleCandidate) : [];
  } catch {
    return [];
  }
}

function safeTitleRationale(value?: string | null): TitleRationale | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as TitleRationale) : null;
  } catch {
    return null;
  }
}

function isTitleCandidate(value: unknown): value is TitleCandidate {
  return Boolean(value && typeof value === "object" && "id" in value && "title" in value);
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
