import type { ActivityItem } from "../../types/activity";
import type { ActivityGroup } from "../../types/activityGroup";
import type { WeeklyTask } from "../../types/weeklyTask";

export type TimelineEntry =
  | { kind: "activity"; id: string; occurredAt: string; item: ActivityItem }
  | { kind: "group"; id: string; occurredAt: string; group: ActivityGroup }
  | { kind: "task"; id: string; occurredAt: string; task: WeeklyTask };

export type MixedTimelineDay = {
  date: string;
  items: TimelineEntry[];
};

export type StoryDay = {
  date: string;
  summary: string;
  entries: TimelineEntry[];
  reportReadyCount: number;
  projectCount: number;
  needsReviewCount: number;
  evidenceCount: number;
};

export function buildStoryDays(days: MixedTimelineDay[]): StoryDay[] {
  return [...days]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((day) => {
      const entries = [...day.items].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
      return {
        date: day.date,
        summary: summarizeStoryDay(entries),
        entries,
        reportReadyCount: countReportReady(entries),
        projectCount: countProjects(entries),
        needsReviewCount: countNeedsReview(entries),
        evidenceCount: countEvidence(entries),
      };
    });
}

export function summarizeStoryDay(entries: TimelineEntry[]) {
  const phrases = entries
    .map(storyPhrase)
    .filter((value): value is string => Boolean(value))
    .map(cleanPhrase);
  const unique = uniqueByNormalized(phrases).slice(0, 3);

  if (unique.length === 0) {
    return "Captured activity for the day.";
  }

  return toSentence(joinPhrases(unique));
}

function storyPhrase(entry: TimelineEntry) {
  if (entry.kind === "group") {
    return entry.group.reportSummary || entry.group.summary || entry.group.title;
  }

  if (entry.kind === "activity") {
    const subject = entry.item.summary.split("\n")[0]?.trim();
    if (!subject) return null;
    if (entry.item.activityType === "commit") {
      return subject.replace(/^(feat|fix|docs|style|refactor|test|chore|perf|build|ci)(\([^)]+\))?:\s*/i, "");
    }
    return `${labelActivity(entry.item.activityType)}: ${subject}`;
  }

  if (entry.task.status === "completed") {
    return `Completed ${entry.task.title}`;
  }
  if (entry.task.status === "blocked" || entry.task.taskType === "blocker") {
    return `Tracked blocker: ${entry.task.title}`;
  }
  return `Planned ${entry.task.title}`;
}

function cleanPhrase(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/^[\-*]\s+/, "")
    .trim()
    .replace(/[.]+$/, "");
}

function uniqueByNormalized(values: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const normalized = value.toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(value);
  }
  return unique;
}

function joinPhrases(values: string[]) {
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function toSentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}.`;
}

function countReportReady(entries: TimelineEntry[]) {
  return entries.filter((entry) => {
    if (entry.kind === "group") return entry.group.includedInReport;
    if (entry.kind === "activity") return entry.item.includedInReport;
    return entry.task.includedInReport;
  }).length;
}

function countProjects(entries: TimelineEntry[]) {
  const projects = new Set<string>();
  for (const entry of entries) {
    if (entry.kind === "group") {
      if (entry.group.projectId) projects.add(entry.group.projectId);
      for (const project of entry.group.projects) {
        projects.add(project.projectId);
      }
    } else if (entry.kind === "activity" && entry.item.projectId) {
      projects.add(entry.item.projectId);
    } else if (entry.kind === "task" && entry.task.projectId) {
      projects.add(entry.task.projectId);
    }
  }
  return projects.size;
}

function countNeedsReview(entries: TimelineEntry[]) {
  return entries.filter((entry) => {
    if (entry.kind !== "group") return false;
    return (
      entry.group.reviewStatus === "needs_review" ||
      entry.group.confidenceLabel === "needs_review" ||
      entry.group.titleConfidenceLabel === "needs_review" ||
      entry.group.titleQualityLabel === "needs_user_review" ||
      entry.group.titleQualityLabel === "fallback_only"
    );
  }).length;
}

function countEvidence(entries: TimelineEntry[]) {
  return entries.reduce((total, entry) => {
    if (entry.kind === "group") return total + Math.max(entry.group.items.length, 1);
    return total + 1;
  }, 0);
}

function labelActivity(value: string) {
  if (value === "commit") return "Commit";
  return value.replace(/_/g, " ");
}
