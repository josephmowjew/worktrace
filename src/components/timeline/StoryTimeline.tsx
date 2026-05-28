import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  ListChecks,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ElementType } from "react";
import type { ActivityGroup, TitleCandidate } from "../../types/activityGroup";
import type { WeeklyTask } from "../../types/weeklyTask";
import { Badge } from "../ui/Badge";
import { TimelineGroupItem } from "./TimelineGroupItem";
import { TimelineItem } from "./TimelineItem";
import { buildStoryDays, type MixedTimelineDay, type StoryDay, type TimelineEntry } from "./storyTimelineModel";

type StoryTimelineProps = {
  days: MixedTimelineDay[];
  onViewTask: (task: WeeklyTask) => void;
  onEditGroup: (group: ActivityGroup) => void;
  onSelectTitleCandidate: (group: ActivityGroup, candidate: TitleCandidate) => void;
};

export function StoryTimeline({
  days,
  onViewTask,
  onEditGroup,
  onSelectTitleCandidate,
}: StoryTimelineProps) {
  const storyDays = useMemo(() => buildStoryDays(days), [days]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-cyan-300/14 bg-cyan-300/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/16 bg-slate-950/45 text-cyan-200">
              <BookOpen className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-50">Story mode</p>
              <p className="mt-1 max-w-[68ch] text-xs leading-5 text-slate-400">
                A chronological weekly readout built from the same local evidence used by the timeline and reports.
              </p>
            </div>
          </div>
          <Badge tone="blue">{storyDays.length} day{storyDays.length === 1 ? "" : "s"}</Badge>
        </div>
      </div>

      {storyDays.map((day) => (
        <StoryDaySection
          key={day.date}
          day={day}
          onViewTask={onViewTask}
          onEditGroup={onEditGroup}
          onSelectTitleCandidate={onSelectTitleCandidate}
        />
      ))}
    </div>
  );
}

function StoryDaySection({
  day,
  onViewTask,
  onEditGroup,
  onSelectTitleCandidate,
}: {
  day: StoryDay;
  onViewTask: (task: WeeklyTask) => void;
  onEditGroup: (group: ActivityGroup) => void;
  onSelectTitleCandidate: (group: ActivityGroup, candidate: TitleCandidate) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="rounded-2xl border border-blue-100/10 bg-slate-950/38 p-4 shadow-[0_16px_46px_rgba(2,6,23,0.24),inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-lg border border-blue-300/15 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-100">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatStoryDay(day.date)}
            </span>
            <StoryMetric icon={CheckCircle2} label={`${day.reportReadyCount} report`} tone="green" />
            <StoryMetric icon={FileText} label={`${day.evidenceCount} evidence`} tone="slate" />
            {day.projectCount > 0 ? <StoryMetric icon={BookOpen} label={`${day.projectCount} project${day.projectCount === 1 ? "" : "s"}`} tone="blue" /> : null}
            {day.needsReviewCount > 0 ? <StoryMetric icon={AlertTriangle} label={`${day.needsReviewCount} review`} tone="orange" /> : null}
          </div>

          <p className="mt-3 max-w-[74ch] text-[15px] font-medium leading-7 text-slate-100 [text-wrap:pretty]">
            {day.summary}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-slate-950/42 px-3 text-xs font-semibold text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[background-color,color,transform] duration-150 hover:bg-white/8 hover:text-slate-100 active:scale-[0.96]"
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Evidence
        </button>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-3 border-t border-white/8 pt-4">
          {day.entries.map((entry) => (
            <StoryEvidenceEntry
              key={`${entry.kind}-${entry.id}`}
              entry={entry}
              onViewTask={onViewTask}
              onEditGroup={onEditGroup}
              onSelectTitleCandidate={onSelectTitleCandidate}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function StoryEvidenceEntry({
  entry,
  onViewTask,
  onEditGroup,
  onSelectTitleCandidate,
}: {
  entry: TimelineEntry;
  onViewTask: (task: WeeklyTask) => void;
  onEditGroup: (group: ActivityGroup) => void;
  onSelectTitleCandidate: (group: ActivityGroup, candidate: TitleCandidate) => void;
}) {
  if (entry.kind === "group") {
    return (
      <TimelineGroupItem
        group={entry.group}
        onEdit={onEditGroup}
        onSelectTitleCandidate={onSelectTitleCandidate}
        showTime={false}
      />
    );
  }

  if (entry.kind === "activity") {
    return <TimelineItem item={entry.item} showTime={false} />;
  }

  return (
    <button
      type="button"
      onClick={() => onViewTask(entry.task)}
      className="flex w-full items-start gap-3 rounded-2xl border border-cyan-200/10 bg-slate-950/36 p-4 text-left shadow-[0_12px_34px_rgba(2,6,23,0.2),inset_0_1px_0_rgba(255,255,255,0.035)] transition-[background-color,border-color,transform] duration-150 hover:border-cyan-200/18 hover:bg-slate-950/48 active:scale-[0.99]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/15 bg-cyan-500/10 text-cyan-200">
        <ListChecks className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-cyan-200/10 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-100">
            Task
          </span>
          <Badge tone={entry.task.status === "blocked" ? "orange" : entry.task.status === "completed" ? "green" : "blue"}>
            {entry.task.status.replace("_", " ")}
          </Badge>
          {entry.task.includedInReport ? <Badge tone="green">Report</Badge> : null}
        </span>
        <span className="mt-2 block text-sm font-semibold text-slate-50">{entry.task.title}</span>
        {entry.task.details ? (
          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-500">{entry.task.details}</span>
        ) : null}
      </span>
    </button>
  );
}

function StoryMetric({
  icon: Icon,
  label,
  tone,
}: {
  icon: ElementType;
  label: string;
  tone: "blue" | "green" | "orange" | "slate";
}) {
  const classes = {
    blue: "border-blue-300/15 bg-blue-500/10 text-blue-200",
    green: "border-emerald-300/15 bg-emerald-500/10 text-emerald-200",
    orange: "border-amber-300/15 bg-amber-500/10 text-amber-200",
    slate: "border-white/8 bg-white/5 text-slate-400",
  }[tone];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${classes}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function formatStoryDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}
